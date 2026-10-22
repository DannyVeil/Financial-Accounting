import type MainPlugin from '../../main';
import type { accountsData, categoriesData, HistoryData, YearData } from '../../main';

type NamedItem = {
    name: string;
    emoji: string;
};

function escapeCsvCell(value: unknown): string {
    // Older JSON files may contain numbers despite the current TypeScript types.
    const text = String(value ?? '');
    const escapedText = text.replace(/"/g, '""');
    return `"${escapedText}"`;
}

function formatItemLabel(item: NamedItem | undefined, fallbackId: string): string {
    if (!item) {
        return fallbackId;
    }

    return `${item.name} ${item.emoji}`.trim();
}

async function readAllHistory(plugin: MainPlugin): Promise<HistoryData[]> {
    const adapter = plugin.app.vault.adapter;
    const listing = await adapter.list(plugin.dbPath);
    const yearPaths = listing.files
        .filter(path => /(?:^|\/)\d{4}\.json$/.test(path))
        .sort();
    const history: HistoryData[] = [];

    for (const path of yearPaths) {
        const text = await adapter.read(path);
        const year: YearData = JSON.parse(text);

        for (const month of Object.values(year.months)) {
            history.push(...month.history);
        }
    }

    history.sort((first, second) => first.date.localeCompare(second.date));
    return history;
}

function serializeCsv(rows: unknown[][]): string {
    const lines = rows.map(row => row.map(escapeCsvCell).join(','));

    // UTF-8 BOM preserves Cyrillic and emoji when opening the CSV in Excel.
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

async function findExportPath(plugin: MainPlugin): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filenamePrefix = `financial-accounting-history-${timestamp}`;
    let path = `${filenamePrefix}.csv`;
    let suffix = 1;

    while (await plugin.app.vault.adapter.exists(path)) {
        path = `${filenamePrefix}-${suffix}.csv`;
        suffix++;
    }

    return path;
}

export async function exportHistoryCsv(plugin: MainPlugin): Promise<string> {
    const { vault } = plugin.app;
    const accountsText = await vault.adapter.read(`${plugin.dbPath}/accounts.json`);
    const accounts: accountsData = JSON.parse(accountsText);
    const categoriesText = await vault.adapter.read(`${plugin.dbPath}/categories.json`);
    const categories: categoriesData = JSON.parse(categoriesText);

    const accountsById = new Map(accounts.accounts.map(account => [account.id, account]));
    const allCategories = [
        ...categories.categories.expenditure_plan,
        ...categories.categories.income_plan,
    ];
    const categoriesByTypeAndId = new Map(
        allCategories.map(category => [`${category.type}:${category.id}`, category]),
    );

    const history = await readAllHistory(plugin);
    const rows = [['Date', 'Type', 'Amount', 'Currency', 'Category', 'Account', 'Note']];

    for (const operation of history) {
        const account = accountsById.get(operation.bill.id);
        const categoryKey = `${operation.type}:${operation.category.id}`;
        const category = categoriesByTypeAndId.get(categoryKey);
        const currency = operation.currency || account?.currency || plugin.settings.baseCurrency;

        rows.push([
            operation.date,
            operation.type === 'expense' ? 'Expense' : 'Income',
            operation.amount,
            currency,
            formatItemLabel(category, operation.category.id),
            formatItemLabel(account, operation.bill.id),
            operation.comment ?? '',
        ]);
    }

    const csv = serializeCsv(rows);
    const path = await findExportPath(plugin);
    await vault.create(path, csv);
    return path;
}
