// CSV history import is disabled. Retained for future rework.
// import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
// import MainPlugin, { FinancialAccountingView } from '../../main';
// import { duplicateKey, importContext, importHistory, ImportRow, Mapping, mapRows, parseCsv } from '../controllers/importData';
// import { withDataAccess } from '../controllers/dataAccess';
//
// type ImportContext = Awaited<ReturnType<typeof importContext>>;
//
// export class ImportHistoryModal extends Modal {
//     private busy = false;
//
//     constructor(private plugin: MainPlugin) {
//         super(plugin.app);
//     }
//
//     onOpen(): void {
//         this.modalEl.addClass('finance-import-modal');
//         this.contentEl.createEl('h2', {
//             text: 'Import operation history'
//         });
//         this.contentEl.createEl('p', {
//             text: 'Import adds ordinary operations without changing current account balances. Editing or deleting them later affects balances as usual.'
//         });
//         this.contentEl.createEl('p', {
//             text: 'CSV must have column headers. Choose a file containing income and expense history for one account. Maximum: 5 MB / 10,000 rows.'
//         });
//         const input = this.contentEl.createEl('input', {
//             type: 'file',
//             attr: {
//                 accept: '.csv,text/csv',
//                 'aria-label': 'CSV file'
//             }
//         });
//         const encoding = this.contentEl.createEl('select', {
//             attr: {
//                 'aria-label': 'File encoding'
//             }
//         });
//         encoding.createEl('option', {
//             value: 'utf-8',
//             text: 'UTF-8'
//         });
//         encoding.createEl('option', {
//             value: 'windows-1251',
//             text: 'Windows-1251'
//         });
//         new Setting(this.contentEl)
//             .addButton(button => button.setButtonText('Read CSV')
//                 .onClick(async () => { await this.readSelectedFile(input, encoding, button); }));
//     }
//
//     private configure(text: string, context: ImportContext): void {
//         this.contentEl.empty();
//         this.contentEl.createEl('h2', {
//             text: 'Match CSV columns'
//         });
//         this.contentEl.createEl('p', {
//             text: 'Select the account and check column mappings. Source IDs are never used. Amounts may use spaces as thousands separators.'
//         });
//         const accounts = context.accounts.filter(account => !account.archived);
//         if (!accounts.length) {
//             this.contentEl.createEl('p', {
//                 text: 'Create an account before importing.'
//             });
//             return;
//         }
//         let accountId = accounts[0].id;
//         new Setting(this.contentEl)
//             .setName('Account')
//             .addDropdown(dropdown => {
//                 accounts.forEach(account => dropdown.addOption(account.id, `${account.emoji} ${account.name} · ${account.currency}`));
//                 dropdown.setValue(accountId)
//                     .onChange(value => {
//                         accountId = value;
//                     });
//             });
//         const delimiterSetting = new Setting(this.contentEl)
//             .setName('CSV separator');
//         const fields = this.contentEl.createDiv();
//         let csv: string[][] = [];
//         let mapping: Mapping;
//         const renderColumnMapping = (delimiter: string) => {
//             fields.empty();
//             try {
//                 csv = parseCsv(text, delimiter);
//             } catch (error) {
//                 fields.createEl('p', {
//                     text: (error as Error).message
//                 });
//                 return;
//             }
//             const findColumnIndex = (names: string[]) => csv[0].findIndex(operation => names.includes(operation.trim().toLowerCase()));
//             mapping = {
//                 date: findColumnIndex(['date', 'дата']),
//                 amount: findColumnIndex(['amount', 'сумма']),
//                 type: findColumnIndex(['type', 'тип']),
//                 note: findColumnIndex(['note', 'comment', 'description', 'описание', 'комментарий']),
//                 currency: findColumnIndex(['currency', 'валюта']),
//                 dateOrder: 'ymd',
//                 decimal: '.'
//             };
//             const columnLabels = [
//                 ['date', 'Date'],
//                 ['amount', 'Amount'],
//                 ['type', 'Type'],
//                 ['note', 'Note'],
//                 ['currency', 'Currency'],
//             ] as const;
//
//             for (const [key, label] of columnLabels) {
//                 new Setting(fields)
//                     .setName(label)
//                     .addDropdown(dropdown => {
//                         let unselectedLabel = 'Not selected';
//                         if (key === 'type') {
//                             unselectedLabel = 'From amount sign: minus = expense, plus = income';
//                         } else if (key === 'currency') {
//                             unselectedLabel = 'Use account currency';
//                         }
//
//                         dropdown.addOption('-1', unselectedLabel);
//                         csv[0].forEach((header, index) => dropdown.addOption(String(index), `${index + 1}: ${header}`));
//                         dropdown.setValue(String(mapping[key]))
//                             .onChange(value => {
//                                 mapping[key] = +value;
//                             });
//                     });
//             }
//             new Setting(fields)
//                 .setName('Date format')
//                 .addDropdown(dropdown => dropdown.addOption('ymd', 'YYYY-MM-DD')
//                     .addOption('dmy', 'DD.MM.YYYY')
//                     .addOption('mdy', 'MM/DD/YYYY')
//                     .onChange(value => {
//                         mapping.dateOrder = value as Mapping['dateOrder'];
//                     }));
//             new Setting(fields)
//                 .setName('Decimal separator')
//                 .addDropdown(dropdown => dropdown.addOption('.', 'Dot: 1234.56')
//                     .addOption(',', 'Comma: 1234,56')
//                     .onChange(value => {
//                         mapping.decimal = value as Mapping['decimal'];
//                     }));
//             const sample = fields.createEl('pre', {
//                 cls: 'finance-import-sample'
//             });
//             sample.textContent = csv.slice(0, 4)
//                 .map(row => row.join(' | ')).join('\n');
//             new Setting(fields)
//                 .addButton(button => button.setButtonText('Preview')
//                     .setCta()
//                     .onClick(async () => {
//                         if (this.busy) {
//                             return;
//                         }
//                         if (mapping.date < 0 || mapping.amount < 0) {
//                             new Notice('Select date and amount columns.');
//                             return;
//                         }
//                         this.busy = true;
//                         button.setDisabled(true);
//                         try {
//                             const latestContext = await withDataAccess(() => importContext(this.plugin));
//                             this.preview(mapRows(csv, mapping), accountId, latestContext, () => this.configure(text, latestContext));
//                         } catch (error) {
//                             new Notice((error as Error).message);
//                         } finally {
//                             this.busy = false;
//                             button.setDisabled(false);
//                         }
//                     }));
//         };
//         let delimiter = ',';
//         let largestColumnCount = 0;
//         for (const candidate of [',', ';', '\t']) {
//             try {
//                 const parsed = parseCsv(text, candidate);
//                 if (parsed[0].length > largestColumnCount) {
//                     largestColumnCount = parsed[0].length;
//                     delimiter = candidate;
//                 }
//             } catch { /* Another separator may match this file. */
//             }
//         }
//         delimiterSetting.addDropdown(dropdown => dropdown.addOption(',', 'Comma')
//             .addOption(';', 'Semicolon')
//             .addOption('\t', 'Tab')
//             .setValue(delimiter)
//             .onChange(renderColumnMapping));
//         renderColumnMapping(delimiter);
//     }
//
//     private preview(rows: ImportRow[], accountId: string, context: ImportContext, back: () => void): void {
//         const account = context.accounts.find(account => account.id === accountId && !account.archived);
//         if (!account) {
//             throw new Error('Account no longer available.');
//         }
//         this.contentEl.empty();
//         this.contentEl.createEl('h2', {
//             text: 'Review history import'
//         });
//         this.contentEl.createEl('p', {
//             text: `${account.emoji} ${account.name} · ${account.currency}. Current balance stays ${account.balance} ${account.currency}.`
//         });
//         this.contentEl.createEl('p', {
//             text: 'Possible duplicates match account, calendar date, type and amount. '
//                 + 'They are unchecked by default; include them only if they are separate operations. '
//                 + 'Assign a category to each selected row.'
//         });
//         const seenOperationKeys = new Set(context.history.map(operation => duplicateKey(operation.bill.id, operation)));
//         for (const row of rows) {
//             if (!row.error && row.currency && row.currency !== account.currency) {
//                 row.error = 'Currency differs from the account.';
//             }
//             const operationYear = Number(row.date.slice(0, 4));
//             const beforeStartYear = operationYear < this.plugin.settings.startYear;
//             const afterCurrentYear = operationYear > new Date().getFullYear();
//             if (!row.error && (beforeStartYear || afterCurrentYear)) {
//                 row.error = 'Year is outside the accounting period. Adjust the initial year in settings.';
//             }
//             if (row.error) {
//                 row.included = false;
//                 continue;
//             }
//             const key = duplicateKey(accountId, row);
//             row.duplicate = seenOperationKeys.has(key);
//             if (row.duplicate) {
//                 row.included = false;
//             }
//             seenOperationKeys.add(key);
//         }
//         const summary = this.contentEl.createEl('p');
//         const updateSummary = () => {
//             const selectedCount = rows.filter(row => row.included).length;
//             const errorCount = rows.filter(row => row.error).length;
//             const duplicateCount = rows.filter(row => row.duplicate).length;
//             summary.textContent = `${selectedCount} selected / ${rows.length} rows`
//                 + ` · ${errorCount} errors · ${duplicateCount} possible duplicates`;
//         };
//         const categorySelects = new Map<ImportRow, HTMLSelectElement>();
//         for (const type of ['expense', 'income'] as const) {
//             new Setting(this.contentEl)
//                 .setName(`Category for all ${type} rows`)
//                 .addDropdown(dropdown => {
//                     dropdown.addOption('', 'Choose category');
//                     context.categories.filter(category => category.type === type && !category.archived)
//                         .forEach(category => dropdown.addOption(category.id, `${category.emoji} ${category.name}`));
//                     dropdown.onChange(id => {
//                         if (this.busy) {
//                             return;
//                         }
//                         rows.filter(row => row.type === type && !row.error)
//                             .forEach(row => {
//                                 row.categoryId = id;
//                                 const select = categorySelects.get(row);
//                                 if (select) {
//                                     select.value = id;
//                                 }
//                             });
//                     });
//                 });
//         }
//         this.renderPreviewTable(rows, context, categorySelects, updateSummary);
//         updateSummary();
//         new Setting(this.contentEl)
//             .addButton(button => button.setButtonText('Back')
//                 .onClick(() => {
//                     if (!this.busy) {
//                         back();
//                     }
//                 }))
//             .addButton(button => button.setButtonText('Import selected history')
//                 .setCta()
//                 .onClick(async () => { await this.saveSelectedHistory(rows, accountId, button); }));
//     }
//
//     private async readSelectedFile(input: HTMLInputElement, encoding: HTMLSelectElement, button: ButtonComponent): Promise<void> {
//         if (this.busy) {
//             return;
//         }
//         const file = input.files?.[0];
//         if (!file) {
//             new Notice('Choose a CSV file.');
//             return;
//         }
//         if (file.size > 5 * 1024 * 1024) {
//             new Notice('Maximum file size is 5 MB.');
//             return;
//         }
//         this.busy = true;
//         button.setDisabled(true);
//         try {
//             const text = new TextDecoder(encoding.value, {
//                 fatal: true
//             }).decode(await file.arrayBuffer());
//             const context = await withDataAccess(() => importContext(this.plugin));
//             this.configure(text, context);
//         } catch (error) {
//             new Notice((error as Error).message);
//         } finally {
//             this.busy = false;
//             button.setDisabled(false);
//         }
//     }
//
//     private async saveSelectedHistory(rows: ImportRow[], accountId: string, button: ButtonComponent): Promise<void> {
//         if (this.busy) {
//             return;
//         }
//         if (rows.some(row => row.included && !row.categoryId)) {
//             new Notice('Choose categories for all selected rows.');
//             return;
//         }
//         this.busy = true;
//         button.setDisabled(true);
//         try {
//             const count = await importHistory(this.plugin, accountId, rows.map(row => ({
//                 ...row
//             })));
//             new Notice(`Imported ${count} operations. Account balances unchanged.`);
//             this.close();
//             try {
//                 for (const leaf of this.app.workspace.getLeavesOfType('financial-accounting-view')) {
//                     await (leaf.view as FinancialAccountingView).onOpen();
//                 }
//             } catch {
//                 new Notice('History saved. Reopen the finance panel to refresh it.');
//             }
//         } catch (error) {
//             new Notice((error as Error).message, 12000);
//         } finally {
//             this.busy = false;
//             button.setDisabled(false);
//         }
//     }
//
//     private renderPreviewTable(
//         rows: ImportRow[],
//         context: ImportContext,
//         categorySelects: Map<ImportRow, HTMLSelectElement>,
//         updateSummary: () => void,
//     ): void {
//         const scroll = this.contentEl.createDiv({
//             cls: 'finance-import-table'
//         });
//         const table = scroll.createEl('table');
//         const head = table.createEl('thead').createEl('tr');
//         ['Import', 'Row', 'Date', 'Type', 'Amount', 'Note', 'Category', 'Status'].forEach(text => head.createEl('th', {
//             text
//         }));
//         const body = table.createEl('tbody');
//         for (const row of rows) {
//             const tableRow = body.createEl('tr');
//             const includeCheckbox = tableRow.createEl('td').createEl('input', {
//                 type: 'checkbox',
//                 attr: {
//                     'aria-label': `Import row ${row.line}`
//                 }
//             });
//             includeCheckbox.checked = row.included;
//             includeCheckbox.disabled = !!row.error;
//             includeCheckbox.onchange = () => {
//                 if (!this.busy) {
//                     row.included = includeCheckbox.checked;
//                     updateSummary();
//                 }
//             };
//             [String(row.line), row.date.replace('T', ' '), row.type, row.amount, row.comment].forEach(text => tableRow.createEl('td', {
//                 text
//             }));
//             const select = tableRow.createEl('td').createEl('select', {
//                 attr: {
//                     'aria-label': `Category for row ${row.line}`
//                 }
//             });
//             select.createEl('option', {
//                 value: '',
//                 text: 'Choose category'
//             });
//             context.categories.filter(category => category.type === row.type && !category.archived)
//                 .forEach(category => select.createEl('option', {
//                     value: category.id,
//                     text: `${category.emoji} ${category.name}`
//                 }));
//             select.disabled = !!row.error;
//             select.onchange = () => {
//                 if (!this.busy) {
//                     row.categoryId = select.value;
//                 }
//             };
//             categorySelects.set(row, select);
//             tableRow.createEl('td', {
//                 text: row.error || (row.duplicate ? 'Possible duplicate' : 'Ready')
//             });
//         }
//     }
//
//     onClose(): void {
//         this.contentEl.empty();
//     }
// }
