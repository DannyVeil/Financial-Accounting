// CSV history import is disabled. Retained for future rework.
// const assert = require('node:assert/strict');
// const esbuild = require('esbuild');
//
// (async () => {
//     const result = await esbuild.build({ entryPoints: ['src/controllers/importData.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
//     const mod = { exports: {} };
//     new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
//     const api = mod.exports;
//     const mapping = { date: 0, amount: 1, type: 2, note: 3, currency: 4, dateOrder: 'ymd', decimal: '.' };
//     const csv = api.parseCsv('\uFEFFDate;Amount;Type;Note;Currency\r\n2026-01-02;-12.50;Expense;"Кофе; ""большой""\nс собой";KZT\r\n2026-02-03;100;Income;Salary;KZT', ';');
//     let rows = api.mapRows(csv, mapping);
//     assert.equal(rows[0].amount, '12.5');
//     assert.equal(rows[0].comment, 'Кофе; "большой"\nс собой');
//     assert.equal(rows[0].date, '2026-01-02T00:00:00');
//     assert.throws(() => api.parseCsv('a,b\n"unfinished', ','), /quote/);
//     assert.throws(() => api.normalizeDate('2026-02-30', 'ymd'), /date/);
//     assert.equal(api.normalizeDate('31.12.2025', 'dmy'), '2025-12-31T00:00:00');
//     const signed = api.mapRows([['date', 'amount'], ['02.01.2026', '-1 234,56'], ['03.01.2026', '0'], ['bad', '12']], { ...mapping, type: -1, note: -1, currency: -1, dateOrder: 'dmy', decimal: ',' });
//     assert.equal(signed[0].amount, '1234.56');
//     assert.equal(signed[0].type, 'expense');
//     assert(signed[1].error && signed[2].error);
//     assert(api.mapRows([csv[0], ['2026-01-01', '10', 'Transfer', '', 'KZT']], mapping)[0].error);
//     const files = new Map([
//         ['db/accounts.json', JSON.stringify({ accounts: [{ id: 'bank', currency: 'KZT', balance: '1000', archived: false }] })],
//         ['db/categories.json', JSON.stringify({ categories: { expenditure_plan: [{ id: 'food', type: 'expense', archived: false }], income_plan: [{ id: 'salary', type: 'income', archived: false }] } })]
//     ]);
//     const writes = [];
//     let failPath = null;
//     const adapter = {
//         exists: async path => files.has(path),
//         read: async path => { if (!files.has(path)) throw Error('Missing file'); return files.get(path); },
//         list: async () => ({ files: [...files.keys()] }),
//         write: async (path, text) => { writes.push(path); if (path === failPath) { failPath = null; throw Error('Disk failure'); } files.set(path, text); },
//         rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
//         remove: async path => { files.delete(path); }
//     };
//     const plugin = { dbPath: 'db', settings: { startYear: 2025 }, app: { vault: { adapter } } };
//     rows[0].categoryId = 'food'; rows[1].categoryId = 'salary';
//     const accountsBefore = files.get('db/accounts.json');
//     assert.equal(await api.importHistory(plugin, 'bank', rows), 2);
//     assert.equal(files.get('db/accounts.json'), accountsBefore);
//     assert(!writes.includes('db/accounts.json'));
//     const year = JSON.parse(files.get('db/2026.json'));
//     const imported = year.months['1'].history[0];
//     assert.equal(imported.bill.id, 'bank');
//     assert.equal(imported.category.id, 'food');
//     assert.equal(imported.currency, 'KZT');
//     assert(!('historyOnly' in imported));
//     assert.notEqual(imported.id, year.months['2'].history[0].id);
//     assert.equal(Object.keys(year.months).length, 12);
//     await assert.rejects(api.importHistory(plugin, 'bank', rows), /duplicates/);
//     const saved = files.get('db/2026.json');
//     await assert.rejects(api.importHistory(plugin, 'bank', [{ ...rows[0], date: '2026-03-01T00:00:00', currency: 'USD' }]), /currency/);
//     await assert.rejects(api.importHistory(plugin, 'bank', [{ ...rows[0], categoryId: 'foreign-id' }]), /category/);
//     await assert.rejects(api.importHistory(plugin, 'bank', [{ ...rows[0], date: '2024-01-01T00:00:00' }]), /accounting period/);
//     assert.equal(files.get('db/2026.json'), saved);
//     failPath = 'db/2026.json';
//     await assert.rejects(api.importHistory(plugin, 'bank', [
//         { ...rows[0], date: '2025-03-01T00:00:00' },
//         { ...rows[0], date: '2026-03-01T00:00:00' }
//     ]), /previous history restored/);
//     assert.equal(files.get('db/2026.json'), saved);
//     assert(!files.has('db/2025.json'));
//     assert(!files.has('db/import-journal.json'));
//     assert.equal(files.get('db/accounts.json'), accountsBefore);
//     // A persisted journal rolls partial history writes back after restart.
//     files.set('db/import-journal.json', JSON.stringify({ version: 1, previous: { '2026.json': saved, '2025.json': null } }));
//     files.set('db/2026.json', '{}'); files.set('db/2025.json', '{}');
//     assert.equal(await api.recoverInterruptedImport(plugin), true);
//     assert.equal(files.get('db/2026.json'), saved);
//     assert(!files.has('db/2025.json'));
//     assert.equal(await api.importHistory(plugin, 'bank', [{ ...rows[0], date: '2026-03-01T00:00:00' }]), 1);
//     console.log('CSV import checks passed.');
// })().catch(error => { console.error(error); process.exitCode = 1; });
//