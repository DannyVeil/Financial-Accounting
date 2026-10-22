const assert = require('node:assert/strict');
const esbuild = require('esbuild');

(async () => {
    const result = await esbuild.build({
        stdin: { contents: `export { default as Plugin, stateManager } from './main';
            export * from './src/controllers/addData'; export * from './src/controllers/editingData';
            export * from './src/controllers/deleteData'; export * from './src/middleware/transferring';
            export * from './src/middleware/checkData';
            // export * from './src/controllers/importData';
            export { getAllFile, getMainData } from './src/controllers/searchData';
            export { formatNumbers } from './src/middleware/otherFunc';`, resolveDir: process.cwd(), loader: 'ts' },
        bundle: true, platform: 'node', format: 'cjs', write: false,
        plugins: [{ name: 'obsidian-test', setup(build) {
            build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'test' }));
            build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
                export class Plugin {} export class ItemView {} export class Modal {}
                export class PluginSettingTab {} export class Setting {} export class Notice {}
                export class Menu {} export const Platform = {}; export function setIcon() {}
            ` }));
        } }],
    });
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
    const api = mod.exports;
    const plugin = new api.Plugin();
    api.Plugin.instance = plugin;
    api.stateManager({ selectedYear: '2026', selectedMonth: '10', selectedCurrency: 'USD' });
    const bill = (id, currency, balance) => ({ id, currency, balance, name: id, emoji: '💳', generalBalance: true, archived: false });
    const files = {
        accounts: { accounts: [bill('usd', 'USD', '100'), bill('eur', 'EUR', '50'), bill('usd2', 'USD', '0')] },
        categories: { categories: { income_plan: [], expenditure_plan: [] } },
        2026: { year: 2026, months: { 10: { history: [] } } },
    };
    let failWrite = false;
    let writes = 0;
    const rawFiles = new Map();
    const key = path => path.split('/').pop().replace('.json', '');
    plugin.app = { vault: { configDir: '.obsidian', adapter: {
        exists: async path => key(path) in files,
        read: async path => {
            const json = JSON.stringify(files[key(path)]);
            const raw = rawFiles.get(key(path));
            return raw && JSON.stringify(JSON.parse(raw)) === json ? raw : json;
        },
        write: async (path, json) => { if (failWrite) throw Error('Disk unavailable'); writes++; files[key(path)] = JSON.parse(json); rawFiles.set(key(path), json); },
        rename: async (from, to) => { files[key(to)] = files[key(from)]; delete files[key(from)]; rawFiles.set(key(to), rawFiles.get(key(from))); rawFiles.delete(key(from)); },
        remove: async path => { delete files[key(path)]; rawFiles.delete(key(path)); },
        list: async () => ({ files: [`${plugin.dbPath}/2026.json`], folders: [] }),
    } } };
    const balance = id => files.accounts.accounts.find(b => b.id === id).balance;
    const tx = (id, account, amount, type = 'expense') => ({ id, bill: { id: account }, category: { id: 'food' }, amount, type, date: '2026-10-09T12:00:00' });
    const ok = result => assert.equal(result.status, 'success', result.error?.message);
    const bad = result => assert.equal(result.status, 'error');

    ok(await api.addJsonToPlan({ id: 'food', name: 'Food', emoji: '🍕', type: 'expense', amount: '0', /* parentId: null, */ archived: false }));
    const expense = tx('a', 'usd', '0.125');
    ok(await api.addJsonToHistory(expense));
    assert.equal(balance('usd'), '99.875');
    assert.equal(files[2026].months[10].history[0].currency, 'USD');
    const edited = { ...expense, bill: { id: 'eur' }, amount: '5' };
    writes = 0;
    ok(await api.editingJsonToHistory(edited, expense));
    assert.equal(writes, 2, 'one accounts write and one history write');
    assert.equal(balance('usd'), '100');
    assert.equal(balance('eur'), '45');
    bad(await api.deleteBill(files.accounts.accounts.find(b => b.id === 'eur')));
    bad(await api.deletePlan(files.categories.categories.expenditure_plan[0]));
    ok(await api.deleteHistory(edited));
    assert.equal(balance('eur'), '50');
    assert.equal(files[2026].months[10].history.length, 0);
    ok(await api.checkBill(tx('full', 'usd', '100')));
    bad(await api.checkBill(tx('over', 'usd2', '1'), expense));
    const income = tx('income', 'eur', '0.1', 'income');
    ok(await api.addJsonToHistory(income));
    assert.equal(balance('eur'), '50.1');
    ok(await api.deleteHistory(income));
    assert.equal(balance('eur'), '50');
    for (const amount of ['-1', '0', 'invalid']) bad(await api.addJsonToHistory(tx('bad', 'usd', amount)));

    ok(await api.transferBetweenBills({ type: 'same-currency', fromBillId: 'usd', toBillId: 'usd2', amount: '10.125' }));
    assert.equal(balance('usd'), '89.875');
    assert.equal(balance('usd2'), '10.125');
    ok(await api.transferBetweenBills({ type: 'cross-currency', fromBillId: 'usd', toBillId: 'eur', sourceAmount: '10', targetAmount: '9.25' }));
    assert.equal(balance('eur'), '59.25');
    // Legacy files mix numeric and string money, including untouched records.
    files.accounts.accounts.find(b => b.id === 'usd').balance = 79.875;
    files.accounts.accounts.find(b => b.id === 'usd2').balance = 10.125;
    files[2026].months[10].history.push(tx('legacy', 'usd', 1.25));
    files[2026].months[9] = { history: [tx('older', 'usd', 0)] };
    const readAccounts = await api.getAllFile('accounts');
    ok(readAccounts);
    assert.equal(readAccounts.json.accounts.find(b => b.id === 'usd').balance, '79.875');
    const readHistory = await api.getMainData();
    ok(readHistory);
    assert.equal(readHistory.jsonData.find(t => t.id === 'legacy').amount, '1.25');
    assert.equal(typeof files[2026].months[10].history[0].amount, 'number', 'reads do not rewrite files');
    assert.equal(api.formatNumbers(1234.5), '1 234.5');
    assert.equal(api.formatNumbers('1234.5000'), '1 234.5000');
    ok(await api.addJsonToHistory(tx('numeric', 'usd', 0.125)));
    assert.equal(balance('usd'), '79.75');
    assert.equal(typeof balance('usd2'), 'string', 'untouched balances are normalized on save');
    assert(files[2026].months[10].history.every(t => typeof t.amount === 'string'));
    assert.equal(files[2026].months[9].history[0].amount, '0');
    const legacy = tx('legacy', 'usd', 1.25);
    ok(await api.editingJsonToHistory({ ...legacy, amount: 0.5 }, legacy));
    assert.equal(balance('usd'), '80.5');
    assert.equal(files[2026].months[10].history.find(t => t.id === 'legacy').amount, '0.5');
    ok(await api.deleteHistory({ ...legacy, amount: 0.5 }));
    assert.equal(balance('usd'), '81');
    ok(await api.addJsonToBills(bill('numeric-bill', 'USD', 0)));
    assert.equal(balance('numeric-bill'), '0');
    ok(await api.editingJsonToBill(bill('numeric-bill', 'USD', 2.5)));
    assert.equal(balance('numeric-bill'), '2.5');
    ok(await api.transferBetweenBills({ type: 'same-currency', fromBillId: 'usd', toBillId: 'usd2', amount: 0.25 }));
    assert.equal(balance('usd'), '80.75');
    assert.equal(balance('usd2'), '10.375');
    const snapshot = JSON.stringify(files);
    for (const amount of ['-1', '0', 'invalid', '999']) bad(await api.transferBetweenBills({ type: 'same-currency', fromBillId: 'usd', toBillId: 'usd2', amount }));
    bad(await api.transferBetweenBills({ type: 'same-currency', fromBillId: 'usd', toBillId: 'usd', amount: '1' }));
    bad(await api.transferBetweenBills({ type: 'same-currency', fromBillId: 'usd', toBillId: 'eur', amount: '1' }));
    assert.equal(JSON.stringify(files), snapshot);
    failWrite = true;
    bad(await api.transferBetweenBills({ type: 'same-currency', fromBillId: 'usd', toBillId: 'usd2', amount: '1' }));
    assert.equal(JSON.stringify(files), snapshot);
//     failWrite = false;
//     plugin.settings.startYear = 2026;
//     const beforeImport = balance('usd');
//     assert.equal(await api.importHistory(plugin, 'usd', [{
//         line: 2, date: '2026-10-20T00:00:00', amount: '5', type: 'expense',
//         comment: 'Imported purchase', currency: 'USD', categoryId: 'food', included: true,
//     }]), 1);
//     assert.equal(balance('usd'), beforeImport, 'import must not change the current balance');
//     const imported = files[2026].months[10].history.find(t => t.comment === 'Imported purchase');
//     assert(!('historyOnly' in imported), 'import produces an ordinary operation');
//     const changed = { ...imported, amount: '7' };
//     ok(await api.editingJsonToHistory(changed, imported));
//     assert.equal(balance('usd'), '78.75', 'editing imported expense applies the ordinary difference');
//     ok(await api.deleteHistory(changed));
//     assert.equal(balance('usd'), '85.75', 'deleting imported expense returns its amount as usual');
    console.log('Transaction, transfer, precision, validation and write-failure checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
