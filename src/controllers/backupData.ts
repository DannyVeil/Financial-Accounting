import Big from 'big.js';
import type MainPlugin from '../../main';
import { acquireBackupLock, blockForRecovery } from './dataAccess';

export const DEFAULT_BACKUP_FOLDER = 'Financial Accounting Backups';
const FORMAT = 'financial-accounting-backup';
const fileName = /^(accounts|categories|\d{4})\.json$/;
type Settings = { startYear: number; baseCurrency: string; backupFolder?: string };
type Snapshot = { files: Record<string, string>; settings: Settings };
export type Backup = {
    format: string; formatVersion: number; pluginVersion: string; createdAt: string;
    files: Record<string, unknown>; settings: Settings;
};
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
    return value as Record<string, unknown>;
};
const array = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw new Error('Expected a list.'); return value; };
const string = (value: unknown): string => { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing or invalid text field.'); return value; };
const money = (value: unknown, positive = false): void => {
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Invalid monetary amount.');
    const amount = new Big(value);
    if (positive && !amount.gt(0)) throw new Error('Operation amounts must be positive.');
};
export function backupFolder(value: string): string {
    const path = value.trim().replace(/\\/g, '/');
    if (!path || path.startsWith('/') || path.split('/').some(part => !part || part.startsWith('.') || /[:*?"<>|\x00-\x1f]/.test(part))) {
        throw new Error('Choose a visible relative folder inside the vault, without . or .. segments.');
    }
    return path;
}
function settings(value: unknown): Settings {
    const data = object(value);
    if (!Number.isInteger(data.startYear) || Number(data.startYear) < 1900 || Number(data.startYear) > 9999) throw new Error('Invalid starting year.');
    if (!/^[A-Z]{3}$/.test(string(data.baseCurrency))) throw new Error('Invalid base currency.');
    if (data.backupFolder !== undefined) backupFolder(string(data.backupFolder));
    return data as Settings;
}
export function parseBackup(text: string): Backup {
    const data = object(JSON.parse(text));
    if (data.format !== FORMAT || data.formatVersion !== 1) throw new Error('Unsupported backup format or version.');
    string(data.pluginVersion);
    if (!Number.isFinite(Date.parse(string(data.createdAt)))) throw new Error('Invalid backup date.');
    settings(data.settings);
    const files = object(data.files);
    if (!files['accounts.json'] || !files['categories.json'] || Object.keys(files).some(name => !fileName.test(name))) throw new Error('Invalid backup file list.');
    const accounts = new Map<string, string>();
    const common = (value: unknown, ids: Set<string>): Record<string, unknown> => {
        const item = object(value); const id = string(item.id);
        if (ids.has(id)) throw new Error(`Duplicate ID: ${id}`);
        ids.add(id); string(item.name);
        if (typeof item.emoji !== 'string' || typeof item.archived !== 'boolean') throw new Error('Invalid account or category fields.');
        if (item.comment != null && typeof item.comment !== 'string') throw new Error('Invalid note.');
        return item;
    };
    const accountIds = new Set<string>();
    for (const value of array(object(files['accounts.json']).accounts)) {
        const item = common(value, accountIds); money(item.balance);
        const currency = string(item.currency);
        if (!/^[A-Z]{3}$/.test(currency) || typeof item.generalBalance !== 'boolean') throw new Error('Invalid account.');
        accounts.set(string(item.id), currency);
    }
    const categories = object(object(files['categories.json']).categories);
    const categoryKeys = new Set<string>();
    for (const [key, type] of [['income_plan', 'income'], ['expenditure_plan', 'expense']]) {
        const ids = new Set<string>();
        for (const value of array(categories[key])) {
            const item = common(value, ids);
            if (item.type !== type) throw new Error('Invalid category type.');
            categoryKeys.add(`${type}:${item.id}`);
        }
    }
    const operationIds = new Set<string>();
    for (const [name, value] of Object.entries(files)) {
        if (!/^\d{4}\.json$/.test(name)) continue;
        const year = object(value);
        if (String(year.year) !== name.slice(0, 4)) throw new Error('Year does not match filename.');
        const months = object(year.months);
        if (Object.keys(months).length !== 12) throw new Error('A year must contain all twelve months.');
        for (let month = 1; month <= 12; month++) {
            for (const value of array(object(months[String(month)]).history)) {
                const item = object(value); const id = string(item.id);
                if (operationIds.has(id)) throw new Error(`Duplicate operation ID: ${id}`);
                operationIds.add(id); money(item.amount, true);
                const accountId = string(object(item.bill).id);
                if (!accounts.has(accountId) || !categoryKeys.has(`${item.type}:${string(object(item.category).id)}`)) throw new Error('An operation refers to a missing account or category.');
                if (item.currency !== undefined && item.currency !== accounts.get(accountId)) throw new Error('Operation currency does not match its account.');
                const date = string(item.date);
                const parts = /^(\d{4})-(\d{2})-(\d{2})T/.exec(date);
                if (!parts || !Number.isFinite(Date.parse(date)) || parts[1] !== String(year.year) || Number(parts[2]) !== month || Number(parts[3]) < 1 || Number(parts[3]) > new Date(Number(parts[1]), month, 0).getDate()) throw new Error('Invalid operation date or month.');
                if (item.comment != null && typeof item.comment !== 'string') throw new Error('Invalid operation note.');
            }
        }
    }
    return data as Backup;
}
export function backupSummary(backup: Backup): string {
    const accounts = array(object(backup.files['accounts.json']).accounts).length;
    const cats = object(object(backup.files['categories.json']).categories);
    let operations = 0;
    for (const [name, year] of Object.entries(backup.files)) if (/^\d{4}/.test(name)) {
        for (const month of Object.values(object(object(year).months))) operations += array(object(month).history).length;
    }
    return `Created: ${new Date(backup.createdAt).toLocaleString()}\nAccounts: ${accounts}; categories: ${array(cats.income_plan).length + array(cats.expenditure_plan).length}; operations: ${operations}.`;
}
async function snapshot(plugin: MainPlugin): Promise<Snapshot> {
    const adapter = plugin.app.vault.adapter;
    const files: Record<string, string> = {};
    if (await adapter.exists(plugin.dbPath)) {
        for (const path of (await adapter.list(plugin.dbPath)).files) {
            const name = path.slice(path.lastIndexOf('/') + 1);
            if (fileName.test(name)) files[name] = await adapter.read(path);
        }
    }
    return { files, settings: JSON.parse(JSON.stringify(plugin.settings)) };
}
function envelope(plugin: MainPlugin, state: Snapshot): Backup {
    const files: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(state.files)) files[name] = JSON.parse(text);
    if (!Object.keys(files).length) {
        files['accounts.json'] = { accounts: [] };
        files['categories.json'] = { categories: { income_plan: [], expenditure_plan: [] } };
    }
    return parseBackup(JSON.stringify({ format: FORMAT, formatVersion: 1, pluginVersion: plugin.manifest.version, createdAt: new Date().toISOString(), files, settings: state.settings }));
}
async function ensureFolder(plugin: MainPlugin, path: string): Promise<void> {
    let current = '';
    for (const part of path.split('/')) {
        current = current ? `${current}/${part}` : part;
        if (!await plugin.app.vault.adapter.exists(current)) await plugin.app.vault.createFolder(current);
    }
}
async function saveBackup(plugin: MainPlugin, data: Backup, beforeRestore = false): Promise<string> {
    const folder = backupFolder(plugin.settings.backupFolder || DEFAULT_BACKUP_FOLDER);
    await ensureFolder(plugin, folder);
    const date = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    const stem = `${folder}/financial-accounting-${beforeRestore ? 'before-restore' : 'backup'}-${stamp}`;
    const { adapter } = plugin.app.vault;
    let path = `${stem}.json`, suffix = 2;
    while (await adapter.exists(path)) path = `${stem}-${suffix++}.json`;
    const text = JSON.stringify(data, null, 2);
    await plugin.app.vault.create(path, text);
    if (await adapter.read(path) !== text) throw new Error('Backup verification failed.');
    return path;
}
export async function createBackup(plugin: MainPlugin): Promise<string> {
    const release = acquireBackupLock();
    try { return await saveBackup(plugin, envelope(plugin, await snapshot(plugin))); }
    finally { release(); }
}
const journalPath = (plugin: MainPlugin) => `${plugin.dbPath}/restore-journal.json`;
async function writeVerified(plugin: MainPlugin, path: string, text: string): Promise<void> {
    await plugin.app.vault.adapter.write(path, text);
    if (await plugin.app.vault.adapter.read(path) !== text) throw new Error(`Could not verify ${path}`);
}
async function applySnapshot(plugin: MainPlugin, state: Snapshot): Promise<void> {
    const adapter = plugin.app.vault.adapter;
    for (const [name, text] of Object.entries(state.files)) await writeVerified(plugin, `${plugin.dbPath}/${name}`, text);
    for (const path of (await adapter.list(plugin.dbPath)).files) {
        const name = path.slice(path.lastIndexOf('/') + 1);
        if (fileName.test(name) && !Object.prototype.hasOwnProperty.call(state.files, name)) await adapter.remove(path);
    }
    await plugin.saveData(state.settings);
    if (JSON.stringify(await plugin.loadData()) !== JSON.stringify(state.settings)) throw new Error('Settings verification failed.');
    plugin.settings = { ...state.settings, backupFolder: state.settings.backupFolder || DEFAULT_BACKUP_FOLDER };
}
export async function recoverInterruptedRestore(plugin: MainPlugin): Promise<boolean> {
    const adapter = plugin.app.vault.adapter;
    if (!await adapter.exists(journalPath(plugin))) return false;
    blockForRecovery(true);
    const journal = object(JSON.parse(await adapter.read(journalPath(plugin))));
    if (journal.version !== 1) throw new Error('Unsupported recovery journal.');
    const state = object(journal.previous);
    const files = object(state.files);
    if (Object.entries(files).some(([name, text]) => !fileName.test(name) || typeof text !== 'string')) throw new Error('Invalid recovery journal.');
    settings(state.settings);
    envelope(plugin, state as Snapshot);
    await applySnapshot(plugin, state as Snapshot);
    await adapter.remove(journalPath(plugin));
    blockForRecovery(false);
    return true;
}
export async function restoreBackup(plugin: MainPlugin, input: Backup): Promise<string> {
    const data = parseBackup(JSON.stringify(input));
    const release = acquireBackupLock();
    try {
        const previous = await snapshot(plugin);
        const safetyPath = await saveBackup(plugin, envelope(plugin, previous), true);
        await ensureFolder(plugin, plugin.dbPath);
        const path = journalPath(plugin);
        if (await plugin.app.vault.adapter.exists(path)) throw new Error('Restart Obsidian to recover the interrupted restore first.');
        await writeVerified(plugin, `${path}.pending`, JSON.stringify({ version: 1, previous }));
        await plugin.app.vault.adapter.rename(`${path}.pending`, path);
        blockForRecovery(true);
        try {
            const files: Record<string, string> = {};
            for (const [name, value] of Object.entries(data.files)) files[name] = JSON.stringify(value, null, 4);
            await applySnapshot(plugin, { files, settings: data.settings });
            await plugin.app.vault.adapter.remove(path);
            blockForRecovery(false);
        } catch (error) {
            try { await recoverInterruptedRestore(plugin); }
            catch { throw new Error(`Restore failed and recovery is pending. Restart Obsidian. Safety copy: ${safetyPath}`); }
            throw new Error(`Restore failed; previous data was recovered. ${error instanceof Error ? error.message : String(error)}`);
        }
        return safetyPath;
    } finally { release(); }
}
