// CSV history import is disabled. Retained for future rework.
// import Big from 'big.js';
// import type MainPlugin from '../../main';
// import type { accountsData, categoriesData, HistoryData, YearData } from '../../main';
// import { acquireBackupLock, blockForRecovery } from './dataAccess';
//
// export type Mapping = {
//     date: number;
//     amount: number;
//     type: number;
//     note: number;
//     currency: number;
//     dateOrder: 'ymd' | 'dmy' | 'mdy';
//     decimal: '.' | ',';
// };
//
// export type ImportRow = {
//     line: number;
//     date: string;
//     amount: string;
//     type: 'expense' | 'income';
//     comment: string;
//     currency: string;
//     categoryId: string;
//     included: boolean;
//     error?: string;
//     duplicate?: boolean;
// };
//
// export function parseCsv(source: string, delimiter: string): string[][] {
//     if (![',', ';', '\t'].includes(delimiter)) {
//         throw new Error('Invalid delimiter.');
//     }
//     const text = source.replace(/^\uFEFF/, '');
//     const rows: string[][] = [];
//     let row: string[] = [];
//     let cell = '';
//     let insideQuotedCell = false;
//     let quoteClosed = false;
//
//     for (let index = 0; index < text.length; index++) {
//         const character = text[index];
//         if (insideQuotedCell) {
//             if (character === '"') {
//                 if (text[index + 1] === '"') {
//                     cell += '"';
//                     index++;
//                 } else {
//                     insideQuotedCell = false;
//                     quoteClosed = true;
//                 }
//             } else {
//                 cell += character;
//             }
//         } else if (character === delimiter || character === '\n' || character === '\r') {
//             row.push(cell);
//             cell = '';
//             quoteClosed = false;
//             if (character !== delimiter) {
//                 if (row.some(value => value.trim())) {
//                     rows.push(row);
//                 }
//                 row = [];
//                 if (character === '\r' && text[index + 1] === '\n') {
//                     index++;
//                 }
//             }
//         } else if (character === '"' && cell === '' && !quoteClosed) {
//             insideQuotedCell = true;
//         } else {
//             if (quoteClosed || character === '"') {
//                 throw new Error('Malformed CSV quoting.');
//             }
//             cell += character;
//         }
//     }
//     if (insideQuotedCell) {
//         throw new Error('Unclosed CSV quote.');
//     }
//     row.push(cell);
//     if (row.some(value => value.trim())) {
//         rows.push(row);
//     }
//     if (rows.length < 2) {
//         throw new Error('CSV must contain a header and at least one data row.');
//     }
//     if (rows.length > 10001) {
//         throw new Error('Import at most 10,000 rows at a time.');
//     }
//     return rows;
// }
//
// export function normalizeDate(value: string, order: Mapping['dateOrder']): string {
//     const match = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value.trim());
//     if (!match) {
//         throw new Error('Invalid date.');
//     }
//     const firstPart = Number(match[1]);
//     const secondPart = Number(match[2]);
//     const thirdPart = Number(match[3]);
//     let year: number;
//     let month: number;
//     let day: number;
//
//     if (order === 'ymd') {
//         [year, month, day] = [firstPart, secondPart, thirdPart];
//     } else if (order === 'dmy') {
//         [year, month, day] = [thirdPart, secondPart, firstPart];
//     } else {
//         [year, month, day] = [thirdPart, firstPart, secondPart];
//     }
//
//     const daysInMonth = new Date(year, month, 0).getDate();
//     const invalidYear = year < 1900 || year > 9999;
//     const invalidMonth = month < 1 || month > 12;
//     const invalidDay = day < 1 || day > daysInMonth;
//     const hours = match[4] || '00';
//     const minutes = match[5] || '00';
//     const seconds = match[6] || '00';
//     const invalidTime = Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59;
//
//     if (invalidYear || invalidMonth || invalidDay || invalidTime) {
//         throw new Error('Invalid date.');
//     }
//
//     const padNumber = (number: number) => String(number).padStart(2, '0');
//     const calendarDate = `${year}-${padNumber(month)}-${padNumber(day)}`;
//     return `${calendarDate}T${hours}:${minutes}:${seconds}`;
// }
//
// function parseAmount(value: string, decimalSeparator: Mapping['decimal']): Big {
//     const amountText = value.replace(/[\s\u00a0\u202f]/g, '');
//     const amountPattern = decimalSeparator === '.'
//         ? /^[+-]?\d+(?:\.\d+)?$/
//         : /^[+-]?\d+(?:,\d+)?$/;
//
//     if (!amountPattern.test(amountText)) {
//         throw new Error('Invalid amount. Check the decimal separator; thousands separators must be spaces.');
//     }
//
//     const amount = new Big(amountText.replace(',', '.'));
//     if (amount.eq(0)) {
//         throw new Error('Amount must not be zero.');
//     }
//     return amount;
// }
//
// function resolveOperationType(value: string, useAmountSign: boolean, amount: Big): ImportRow['type'] {
//     if (useAmountSign) {
//         return amount.lt(0) ? 'expense' : 'income';
//     }
//
//     const type = value.toLowerCase();
//     if (['expense', 'расход', 'debit'].includes(type)) {
//         return 'expense';
//     }
//     if (['income', 'доход', 'credit'].includes(type)) {
//         return 'income';
//     }
//
//     throw new Error('Type must be Income/Expense (or Доход/Расход).');
// }
//
// export function mapRows(csv: string[][], mapping: Mapping): ImportRow[] {
//     return csv.slice(1)
//         .map((cells, index) => {
//             const row: ImportRow = {
//                 line: index + 2,
//                 date: '',
//                 amount: '',
//                 type: 'expense',
//                 comment: '',
//                 currency: '',
//                 categoryId: '',
//                 included: true
//             };
//             const read = (index: number) => index < 0 ? '' : (cells[index] ?? '').trim();
//             try {
//                 if (cells.length !== csv[0].length) {
//                     throw new Error('Column count differs from the header.');
//                 }
//                 row.date = normalizeDate(read(mapping.date), mapping.dateOrder);
//                 const amount = parseAmount(read(mapping.amount), mapping.decimal);
//                 row.amount = amount.abs().toString();
//                 row.type = resolveOperationType(read(mapping.type), mapping.type < 0, amount);
//
//                 row.comment = read(mapping.note);
//                 row.currency = read(mapping.currency).toUpperCase();
//             } catch (error) {
//                 row.error = (error as Error).message;
//                 row.included = false;
//             }
//             return row;
//         });
// }
//
// export async function importContext(plugin: MainPlugin) {
//     const adapter = plugin.app.vault.adapter;
//     const accounts: accountsData = JSON.parse(await adapter.read(`${plugin.dbPath}/accounts.json`));
//     const categories: categoriesData = JSON.parse(await adapter.read(`${plugin.dbPath}/categories.json`));
//     const history: HistoryData[] = [];
//     const listing = await adapter.list(plugin.dbPath);
//     const yearPaths = listing.files.filter(path => /(?:^|\/)\d{4}\.json$/.test(path));
//
//     for (const path of yearPaths) {
//         const year: YearData = JSON.parse(await adapter.read(path));
//         for (const month of Object.values(year.months)) {
//             history.push(...month.history);
//         }
//     }
//     return {
//         accounts: accounts.accounts,
//         categories: [...categories.categories.expenditure_plan, ...categories.categories.income_plan],
//         history
//     };
// }
//
// export const duplicateKey = (accountId: string, row: {
//     date: string;
//     type: string;
//     amount: string;
// }) => JSON.stringify([accountId, row.date.slice(0, 10), row.type, new Big(row.amount).toString()]);
//
// const getImportJournalPath = (plugin: MainPlugin) => `${plugin.dbPath}/import-journal.json`;
//
// async function writeVerified(plugin: MainPlugin, path: string, text: string) {
//     await plugin.app.vault.adapter.write(path, text);
//     if (await plugin.app.vault.adapter.read(path) !== text) {
//         throw new Error(`Write verification failed: ${path}`);
//     }
// }
//
// export async function recoverInterruptedImport(plugin: MainPlugin): Promise<boolean> {
//     const adapter = plugin.app.vault.adapter;
//     const path = getImportJournalPath(plugin);
//     if (!await adapter.exists(path)) {
//         return false;
//     }
//     blockForRecovery(true);
//     const journal = JSON.parse(await adapter.read(path));
//     if (journal.version !== 1 || !journal.previous || typeof journal.previous !== 'object' || Array.isArray(journal.previous)) {
//         throw new Error('Invalid import journal.');
//     }
//     for (const [name, text] of Object.entries(journal.previous)) {
//         if (!/^\d{4}\.json$/.test(name) || (text !== null && typeof text !== 'string')) {
//             throw new Error('Invalid import recovery file.');
//         }
//     }
//     for (const [name, text] of Object.entries(journal.previous)) {
//         const target = `${plugin.dbPath}/${name}`;
//         if (text === null) {
//             if (await adapter.exists(target)) {
//                 await adapter.remove(target);
//             }
//         } else {
//             await writeVerified(plugin, target, text as string);
//         }
//     }
//     await adapter.remove(path);
//     blockForRecovery(false);
//     return true;
// }
//
// function createEmptyYear(year: string): YearData {
//     const months: YearData['months'] = {};
//     for (let month = 1; month <= 12; month++) {
//         months[String(month)] = {
//             history: [],
//             income_plan: [],
//             expenditure_plan: [],
//         };
//     }
//     return { year, months };
// }
//
// export async function importHistory(plugin: MainPlugin, accountId: string, rows: ImportRow[]): Promise<number> {
//     const release = acquireBackupLock();
//     try {
//         const context = await importContext(plugin);
//         const account = context.accounts.find(account => account.id === accountId && !account.archived);
//         if (!account) {
//             throw new Error('Choose an existing active account.');
//         }
//         const selectedRows = rows.filter(row => row.included);
//         if (!selectedRows.length) {
//             throw new Error('Select at least one row.');
//         }
//         const adapter = plugin.app.vault.adapter;
//         const previous: Record<string, string | null> = {};
//         const years: Record<string, YearData> = {};
//         const seenOperationKeys = new Set(context.history.map(operation => duplicateKey(operation.bill.id, operation)));
//         const operationIds = new Set(context.history.map(operation => operation.id));
//         for (const row of selectedRows) {
//             if (row.error || !new Big(row.amount).gt(0) || normalizeDate(row.date, 'ymd') !== row.date) {
//                 throw new Error(`Invalid row ${row.line}.`);
//             }
//             const year = row.date.slice(0, 4);
//             if (+year < plugin.settings.startYear || +year > new Date().getFullYear()) {
//                 throw new Error(`Row ${row.line}: year is outside the accounting period. Change the initial year in settings first.`);
//             }
//             if (row.currency && row.currency !== account.currency) {
//                 throw new Error(`Row ${row.line}: currency differs from the account.`);
//             }
//             if (!context.categories.some(character => character.id === row.categoryId && character.type === row.type && !character.archived)) {
//                 throw new Error(`Row ${row.line}: choose an active category.`);
//             }
//             const key = duplicateKey(accountId, row);
//             if (seenOperationKeys.has(key) && !row.duplicate) {
//                 throw new Error('New possible duplicates appeared. Rebuild the preview before saving.');
//             }
//             seenOperationKeys.add(key);
//             if (!years[year]) {
//                 const name = `${year}.json`;
//                 const path = `${plugin.dbPath}/${name}`;
//                 previous[name] = await adapter.exists(path) ? await adapter.read(path) : null;
//                 const previousYear = previous[name];
//                 if (previousYear === null) {
//                     years[year] = createEmptyYear(year);
//                 } else {
//                     years[year] = JSON.parse(previousYear);
//                 }
//             }
//             let id: string;
//             do {
//                 id = crypto.randomUUID();
//             } while (operationIds.has(id));
//             operationIds.add(id);
//             const month = String(Number(row.date.slice(5, 7)));
//             const monthHistory = years[year].months[month].history;
//             monthHistory.push({
//                 id,
//                 date: row.date,
//                 amount: new Big(row.amount).toString(),
//                 type: row.type,
//                 bill: {
//                     id: account.id
//                 },
//                 category: {
//                     id: row.categoryId
//                 },
//                 currency: account.currency,
//                 comment: row.comment
//             });
//         }
//         const journal = getImportJournalPath(plugin);
//         if (await adapter.exists(journal)) {
//             throw new Error('Restart Obsidian to recover the previous import.');
//         }
//         await writeVerified(plugin, `${journal}.pending`, JSON.stringify({
//             version: 1,
//             previous
//         }));
//         await adapter.rename(`${journal}.pending`, journal);
//         blockForRecovery(true);
//         try {
//             for (const [year, data] of Object.entries(years)) {
//                 await writeVerified(plugin, `${plugin.dbPath}/${year}.json`, JSON.stringify(data, null, 4));
//             }
//             await adapter.remove(journal);
//             blockForRecovery(false);
//         } catch (error) {
//             try {
//                 await recoverInterruptedImport(plugin);
//             } catch {
//                 throw new Error('Import failed; recovery is pending. Restart Obsidian before making changes.');
//             }
//             throw new Error(`Import cancelled; previous history restored. ${(error as Error).message}`);
//         }
//         return selectedRows.length;
//     } finally {
//         release();
//     }
// }
