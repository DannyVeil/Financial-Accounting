import Big from 'big.js';
import type MainPlugin from '../../main';
import { acquireBackupLock, blockForRecovery } from './dataAccess';

export const DEFAULT_BACKUP_FOLDER = 'Financial Accounting Backups';

const FORMAT = 'financial-accounting-backup';

const dataFilePattern = /^(accounts|categories|\d{4})\.json$/;

type Settings = {
    startYear: number;
    baseCurrency: string;
    backupFolder?: string;
};

type Snapshot = {
    files: Record<string, string>;
    settings: Settings;
};

export type Backup = {
    format: string;
    formatVersion: number;
    pluginVersion: string;
    createdAt: string;
    files: Record<string, unknown>;
    settings: Settings;
};

const requireObject = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Expected a JSON object.');
    }
    return value as Record<string, unknown>;
};

const requireArray = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) {
        throw new Error('Expected a list.');
    }
    return value;
};

const requireString = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('Missing or invalid text field.');
    }
    return value;
};

const validateAmount = (value: unknown, positive = false): void => {
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Invalid monetary amount.');
    }
    const amount = new Big(value);
    if (positive && !amount.gt(0)) {
        throw new Error('Operation amounts must be positive.');
    }
};

export function backupFolder(value: string): string {
    const path = value.trim().replace(/\\/g, '/');
    const hasControlCharacters = Array.from(path).some(character => character.charCodeAt(0) < 32);
    const hasInvalidSegment = path.split('/').some(part => {
        return !part || part.startsWith('.') || /[:*?"<>|]/.test(part);
    });

    if (!path || path.startsWith('/') || hasControlCharacters || hasInvalidSegment) {
        throw new Error('Choose a visible relative folder inside the vault, without . or .. segments.');
    }
    return path;
}

function validateSettings(value: unknown): Settings {
    const data = requireObject(value);
    if (!Number.isInteger(data.startYear) || Number(data.startYear) < 1900 || Number(data.startYear) > 9999) {
        throw new Error('Invalid starting year.');
    }
    if (!/^[A-Z]{3}$/.test(requireString(data.baseCurrency))) {
        throw new Error('Invalid base currency.');
    }
    if (data.backupFolder !== undefined) {
        backupFolder(requireString(data.backupFolder));
    }
    return data as Settings;
}

function validateCommonFields(value: unknown, usedIds: Set<string>): Record<string, unknown> {
    const item = requireObject(value);
    const id = requireString(item.id);

    if (usedIds.has(id)) {
        throw new Error(`Duplicate ID: ${id}`);
    }

    usedIds.add(id);
    requireString(item.name);

    if (typeof item.emoji !== 'string' || typeof item.archived !== 'boolean') {
        throw new Error('Invalid account or category fields.');
    }
    if (item.comment != null && typeof item.comment !== 'string') {
        throw new Error('Invalid note.');
    }

    return item;
}

function validateAccounts(value: unknown): Map<string, string> {
    const accountsFile = requireObject(value);
    const accountIds = new Set<string>();
    const currenciesByAccountId = new Map<string, string>();

    for (const accountValue of requireArray(accountsFile.accounts)) {
        const account = validateCommonFields(accountValue, accountIds);
        validateAmount(account.balance);

        const currency = requireString(account.currency);
        if (!/^[A-Z]{3}$/.test(currency) || typeof account.generalBalance !== 'boolean') {
            throw new Error('Invalid account.');
        }

        currenciesByAccountId.set(requireString(account.id), currency);
    }

    return currenciesByAccountId;
}

function validateCategories(value: unknown): Set<string> {
    const categoriesFile = requireObject(value);
    const categories = requireObject(categoriesFile.categories);
    const categoryKeys = new Set<string>();
    const categoryGroups = [
        ['income_plan', 'income'],
        ['expenditure_plan', 'expense'],
    ];

    for (const [groupName, operationType] of categoryGroups) {
        const categoryIds = new Set<string>();

        for (const categoryValue of requireArray(categories[groupName])) {
            const category = validateCommonFields(categoryValue, categoryIds);
            if (category.type !== operationType) {
                throw new Error('Invalid category type.');
            }

            categoryKeys.add(`${operationType}:${category.id}`);
        }
    }

    return categoryKeys;
}

function validateOperationDate(
    operation: Record<string, unknown>,
    filename: string,
    year: string,
    month: number,
): void {
    // Older records may have no time. Validate without changing their date.
    const date = typeof operation.date === 'string' ? operation.date : '';
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})(?:T.+)?$/.exec(date);
    const matchesExpectedMonth = dateParts
        && dateParts[1] === year
        && Number(dateParts[2]) === month;
    const day = Number(dateParts?.[3]);
    const daysInMonth = new Date(Number(dateParts?.[1]), month, 0).getDate();
    const isValidDay = day >= 1 && day <= daysInMonth;
    const isValidDate = Number.isFinite(Date.parse(date));

    if (!matchesExpectedMonth || !isValidDay || !isValidDate) {
        throw new Error(
            `Invalid operation date or month: ${filename}, month ${month}, `
            + `operation ${operation.id}, date ${JSON.stringify(operation.date)}. `
            + 'Expected YYYY-MM-DD or an ISO timestamp in this month.',
        );
    }
}

function validateHistoryFiles(
    files: Record<string, unknown>,
    currenciesByAccountId: Map<string, string>,
    categoryKeys: Set<string>,
): void {
    const operationIds = new Set<string>();

    for (const [filename, fileValue] of Object.entries(files)) {
        if (!/^\d{4}\.json$/.test(filename)) {
            continue;
        }

        const yearFile = requireObject(fileValue);
        const year = String(yearFile.year);
        if (year !== filename.slice(0, 4)) {
            throw new Error('Year does not match filename.');
        }

        const months = requireObject(yearFile.months);
        if (Object.keys(months).length !== 12) {
            throw new Error('A year must contain all twelve months.');
        }

        for (let month = 1;month <= 12;month++) {
            const monthData = requireObject(months[String(month)]);
            const history = requireArray(monthData.history);

            for (const operationValue of history) {
                const operation = requireObject(operationValue);
                const id = requireString(operation.id);
                if (operationIds.has(id)) {
                    throw new Error(`Duplicate operation ID: ${id}`);
                }

                operationIds.add(id);
                validateAmount(operation.amount, true);

                const accountId = requireString(requireObject(operation.bill).id);
                if (!currenciesByAccountId.has(accountId)) {
                    throw new Error('An operation refers to a missing account or category.');
                }
                const categoryId = requireString(requireObject(operation.category).id);
                const categoryKey = `${operation.type}:${categoryId}`;
                if (!categoryKeys.has(categoryKey)) {
                    throw new Error('An operation refers to a missing account or category.');
                }

                const accountCurrency = currenciesByAccountId.get(accountId);
                if (operation.currency !== undefined && operation.currency !== accountCurrency) {
                    throw new Error('Operation currency does not match its account.');
                }

                validateOperationDate(operation, filename, year, month);
                if (operation.comment != null && typeof operation.comment !== 'string') {
                    throw new Error('Invalid operation note.');
                }
            }
        }
    }
}

export function parseBackup(text: string): Backup {
    const backup = requireObject(JSON.parse(text));
    if (backup.format !== FORMAT || backup.formatVersion !== 1) {
        throw new Error('Unsupported backup format or version.');
    }

    requireString(backup.pluginVersion);
    if (!Number.isFinite(Date.parse(requireString(backup.createdAt)))) {
        throw new Error('Invalid backup date.');
    }
    validateSettings(backup.settings);

    const files = requireObject(backup.files);
    const hasRequiredFiles = files['accounts.json'] && files['categories.json'];
    const hasUnknownFiles = Object.keys(files).some(name => !dataFilePattern.test(name));
    if (!hasRequiredFiles || hasUnknownFiles) {
        throw new Error('Invalid backup file list.');
    }

    const currenciesByAccountId = validateAccounts(files['accounts.json']);
    const categoryKeys = validateCategories(files['categories.json']);
    validateHistoryFiles(files, currenciesByAccountId, categoryKeys);

    return backup as Backup;
}

export function backupSummary(backup: Backup): string {
    const accountsFile = requireObject(backup.files['accounts.json']);
    const categoriesFile = requireObject(backup.files['categories.json']);
    const categories = requireObject(categoriesFile.categories);
    const accountCount = requireArray(accountsFile.accounts).length;
    const categoryCount = requireArray(categories.income_plan).length
        + requireArray(categories.expenditure_plan).length;
    let operationCount = 0;

    for (const [name, year] of Object.entries(backup.files)) {
        if (!/^\d{4}/.test(name)) {
            continue;
        }

        const months = requireObject(requireObject(year).months);
        for (const month of Object.values(months)) {
            operationCount += requireArray(requireObject(month).history).length;
        }
    }

    const createdAt = new Date(backup.createdAt).toLocaleString();
    return `Created: ${createdAt}\n`
        + `Accounts: ${accountCount}; categories: ${categoryCount}; operations: ${operationCount}.`;
}

async function captureSnapshot(plugin: MainPlugin): Promise<Snapshot> {
    const adapter = plugin.app.vault.adapter;
    const files: Record<string, string> = {};
    if (await adapter.exists(plugin.dbPath)) {
        for (const path of (await adapter.list(plugin.dbPath)).files) {
            const name = path.slice(path.lastIndexOf('/') + 1);
            if (dataFilePattern.test(name)) {
                files[name] = await adapter.read(path);
            }
        }
    }
    return {
        files,
        settings: JSON.parse(JSON.stringify(plugin.settings))
    };
}

function buildBackup(plugin: MainPlugin, state: Snapshot): Backup {
    const files: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(state.files)) {
        files[name] = JSON.parse(text);
    }
    if (!Object.keys(files).length) {
        files['accounts.json'] = {
            accounts: []
        };
        files['categories.json'] = {
            categories: {
                income_plan: [],
                expenditure_plan: []
            }
        };
    }
    const backup = {
        format: FORMAT,
        formatVersion: 1,
        pluginVersion: plugin.manifest.version,
        createdAt: new Date().toISOString(),
        files,
        settings: state.settings,
    };

    return parseBackup(JSON.stringify(backup));
}

async function ensureFolder(plugin: MainPlugin, path: string): Promise<void> {
    let current = '';
    for (const part of path.split('/')) {
        current = current ? `${current}/${part}` : part;
        if (!await plugin.app.vault.adapter.exists(current)) {
            await plugin.app.vault.createFolder(current);
        }
    }
}

async function saveBackup(plugin: MainPlugin, data: Backup, beforeRestore = false): Promise<string> {
    const folder = backupFolder(plugin.settings.backupFolder || DEFAULT_BACKUP_FOLDER);
    await ensureFolder(plugin, folder);
    const date = new Date();
    const padNumber = (n: number) => String(n).padStart(2, '0');
    const datePart = [
        date.getFullYear(),
        padNumber(date.getMonth() + 1),
        padNumber(date.getDate()),
    ].join('-');
    const timePart = [
        padNumber(date.getHours()),
        padNumber(date.getMinutes()),
        padNumber(date.getSeconds()),
    ].join('-');
    const timestamp = `${datePart}_${timePart}`;
    const filenamePrefix = `${folder}/financial-accounting-${beforeRestore ? 'before-restore' : 'backup'}-${timestamp}`;
    const { adapter } = plugin.app.vault;
    let path = `${filenamePrefix}.json`;
    let suffix = 2;
    while (await adapter.exists(path)) {
        path = `${filenamePrefix}-${suffix++}.json`;
    }
    const text = JSON.stringify(data, null, 2);
    await plugin.app.vault.create(path, text);
    if (await adapter.read(path) !== text) {
        throw new Error('Backup verification failed.');
    }
    return path;
}

export async function createBackup(plugin: MainPlugin): Promise<string> {
    const release = acquireBackupLock();
    try {
        const state = await captureSnapshot(plugin);
        const backup = buildBackup(plugin, state);
        return await saveBackup(plugin, backup);
    } finally {
        release();
    }
}

const getRestoreJournalPath = (plugin: MainPlugin) => `${plugin.dbPath}/restore-journal.json`;

async function writeVerified(plugin: MainPlugin, path: string, text: string): Promise<void> {
    await plugin.app.vault.adapter.write(path, text);
    if (await plugin.app.vault.adapter.read(path) !== text) {
        throw new Error(`Could not verify ${path}`);
    }
}

async function applySnapshot(plugin: MainPlugin, state: Snapshot): Promise<void> {
    const adapter = plugin.app.vault.adapter;
    for (const [name, text] of Object.entries(state.files)) {
        await writeVerified(plugin, `${plugin.dbPath}/${name}`, text);
    }
    const storedFiles = await adapter.list(plugin.dbPath);
    for (const path of storedFiles.files) {
        const name = path.slice(path.lastIndexOf('/') + 1);
        const belongsToSnapshot = Object.prototype.hasOwnProperty.call(state.files, name);
        if (dataFilePattern.test(name) && !belongsToSnapshot) {
            await adapter.remove(path);
        }
    }
    await plugin.saveData(state.settings);
    const savedSettings = await plugin.loadData();
    if (JSON.stringify(savedSettings) !== JSON.stringify(state.settings)) {
        throw new Error('Settings verification failed.');
    }
    plugin.settings = {
        ...state.settings,
        backupFolder: state.settings.backupFolder || DEFAULT_BACKUP_FOLDER
    };
}

export async function recoverInterruptedRestore(plugin: MainPlugin): Promise<boolean> {
    const adapter = plugin.app.vault.adapter;
    const journalPath = getRestoreJournalPath(plugin);
    if (!await adapter.exists(journalPath)) {
        return false;
    }
    blockForRecovery(true);
    const journalText = await adapter.read(journalPath);
    const journal = requireObject(JSON.parse(journalText));
    if (journal.version !== 1) {
        throw new Error('Unsupported recovery journal.');
    }
    const state = requireObject(journal.previous);
    const files = requireObject(state.files);
    if (Object.entries(files).some(([name, text]) => !dataFilePattern.test(name) || typeof text !== 'string')) {
        throw new Error('Invalid recovery journal.');
    }
    validateSettings(state.settings);
    buildBackup(plugin, state as Snapshot);
    await applySnapshot(plugin, state as Snapshot);
    await adapter.remove(journalPath);
    blockForRecovery(false);
    return true;
}

export async function restoreBackup(plugin: MainPlugin, input: Backup): Promise<string> {
    const data = parseBackup(JSON.stringify(input));
    const release = acquireBackupLock();
    try {
        const previous = await captureSnapshot(plugin);
        const safetyBackup = buildBackup(plugin, previous);
        const safetyPath = await saveBackup(plugin, safetyBackup, true);
        await ensureFolder(plugin, plugin.dbPath);
        const path = getRestoreJournalPath(plugin);
        if (await plugin.app.vault.adapter.exists(path)) {
            throw new Error('Restart Obsidian to recover the interrupted restore first.');
        }
        await writeVerified(plugin, `${path}.pending`, JSON.stringify({
            version: 1,
            previous
        }));
        await plugin.app.vault.adapter.rename(`${path}.pending`, path);
        blockForRecovery(true);
        try {
            const files: Record<string, string> = {};
            for (const [name, value] of Object.entries(data.files)) {
                files[name] = JSON.stringify(value, null, 4);
            }
            await applySnapshot(plugin, {
                files,
                settings: data.settings
            });
            await plugin.app.vault.adapter.remove(path);
            blockForRecovery(false);
        } catch (error) {
            try {
                await recoverInterruptedRestore(plugin);
            } catch {
                throw new Error(`Restore failed and recovery is pending. Restart Obsidian. Safety copy: ${safetyPath}`);
            }
            throw new Error(`Restore failed; previous data was recovered. ${error instanceof Error ? error.message : String(error)}`);
        }
        return safetyPath;
    } finally {
        release();
    }
}
