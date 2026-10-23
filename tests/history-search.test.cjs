const assert = require('node:assert/strict');
const esbuild = require('esbuild');
class Element {
    constructor(tag, options = {}) { this.tag = tag; this.children = []; this.value = options.value || options.attr?.value || ''; this.textContent = options.text || ''; this.attributes = options.attr || {}; this.hidden = false; this.checked = false; this.scrollTop = 0; this.scrollHeight = 2000; this.clientHeight = 500; this.isConnected = true; this.parentElement = null; this.overflowY = 'auto'; this.ownerDocument = { defaultView: { getComputedStyle: element => ({ overflowY: element.overflowY }), requestAnimationFrame: callback => setImmediate(callback) } }; }
    createEl(tag, options) { const el = new Element(tag, options); this.children.push(el); el.parentElement = this; if (this.tag === 'select' && this.children.length === 1) this.value = el.value; return el; }
    addEventListener(name, handler) { this[name] = handler; }
    removeEventListener(name) { delete this[name]; }
    createDiv(options) { return this.createEl('div', options); }
    createSpan(options) { return this.createEl('span', options); }
    empty() { this.children = []; }
    setAttribute(key, value) { this.attributes[key] = value; }
    find(label) { if (this.attributes['aria-label'] === label) return this; for (const child of this.children) { const found = child.find(label); if (found) return found; } }
    all() { return [this, ...this.children.flatMap(child => child.all())]; }
}
(async () => {
    const result = await esbuild.build({ stdin: { contents: `export { default as Plugin, stateManager } from './main'; export { loadAllHistory, getHistoryMetadata, filterHistory } from './src/controllers/searchData'; export { showHistorySearch } from './src/view/historyView';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false,
        plugins: [{ name: 'obsidian', setup(build) { build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' })); build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export class Plugin {} export class ItemView {} export class Modal {} export class PluginSettingTab {} export class Setting {} export class Notice {} export class Menu {} export const Platform = {}; export function setIcon() {}' })); } }] });
    const module = { exports: {} }; new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
    const api = module.exports;
    const plugin = new api.Plugin(); api.Plugin.instance = plugin; plugin.settings = { baseCurrency: 'USD' }; plugin.dbPath = 'db';
    api.stateManager({ selectedYear: '2026', selectedMonth: '10', selectedCurrency: 'USD' });
    const op = (id, date, amount, type = 'expense', bill = 'a') => ({ id, date, amount, type, bill: { id: bill }, category: { id: 'same' }, comment: 'Coffee' });
    const files = {
        'accounts': { accounts: [{ id: 'a', name: 'Cash', emoji: '', currency: 'USD' }, { id: 'b', name: 'Bank', emoji: '', currency: 'EUR' }] },
        'categories': { categories: { expenditure_plan: [{ id: 'same', name: 'Food', type: 'expense', emoji: '' }], income_plan: [{ id: 'same', name: 'Salary', type: 'income', emoji: '' }] } },
        '2025': { months: { 12: { history: [op('old', '2025-12-31', '0.100000000000000001')] } } },
        '2026': { months: { 1: { history: [op('new', '2026-01-01T23:30:00-05:00', '20', 'income'), op('eur', '2026-01-01', '5', 'expense', 'b')] }, 10: { history: [] } } },
    };
    const reads = [];
    plugin.app = { vault: { adapter: { list: async () => ({ files: ['db/accounts.json', 'db/2025.json', 'db/2026.json', 'db/other.json'] }), read: async path => { reads.push(path); return JSON.stringify(files[path.split('/').pop().replace('.json', '')]); } } } };

    const metadata = (await api.getHistoryMetadata()).json;
    const history = await api.loadAllHistory('USD');
    assert.deepEqual(history.map(x => x.id), ['new', 'old']);
    for (const query of ['Coffee', 'cash', 'expense', 'food', '0.100000000000000001']) {
        assert(api.filterHistory(history, query, metadata).some(x => x.id === 'old'), query);
    }
    const root = new Element('div'); let shown = [];
    const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
    const renderer = async (_, loader) => { const result = await loader(); if (result.status === 'success') shown = result.jsonData; };
    await api.showHistorySearch(root, renderer);
    assert(root.find('Search operations'), 'search exists in empty month'); assert.equal(shown.length, 0);
    assert.equal(root.all().filter(el => el.tag === 'button' && !el.hidden).length, 1);
    assert.equal(root.all().filter(el => el.tag === 'input').length, 1);
    assert(!root.all().some(el => ['select', 'fieldset'].includes(el.tag)));
    const search = root.find('Search operations');
    search.value = 'Coffee'; search.oninput(); await flush(); assert.equal(shown.length, 0);
    const toggle = root.find('Search all history'); toggle.onclick(); await flush();
    assert.equal(toggle.attributes['aria-pressed'], 'true'); assert.equal(shown.length, 2);
    const before = reads.length;
    search.value = 'salary'; search.oninput(); await flush(); assert.equal(shown[0].id, 'new');
    assert.equal(reads.length, before, 'typing uses cache');
    toggle.onclick(); await flush(); assert.equal(shown.length, 0); assert.equal(search.value, 'salary');
    assert.equal(toggle.attributes['aria-pressed'], 'false');
    assert.equal(api.stateManager().selectedMonth, '10');
    files['2026'].months[1].history = Array.from({ length: 205 }, (_, i) => op('row-' + i, '2026-01-01', '1'));
    search.value = ''; search.oninput(); await flush();
    const fullRoot = new Element('div'); await api.showHistorySearch(fullRoot, renderer);
    const more = fullRoot.all().find(el => el.textContent === 'Show more');
    const fullSearch = fullRoot.find('Search operations');
    const fullToggle = fullRoot.find('Search all history');
    assert(fullRoot.all().some(el => el.children.includes(fullSearch) && el.children.includes(fullToggle)), 'search and toggle share a row');
    assert.equal(more.hidden, true);
    fullToggle.onclick(); await flush(); assert.equal(shown.length, 100); assert.equal(more.hidden, false);
    more.onclick(); await flush(); assert.equal(shown.length, 200); assert.equal(more.hidden, false);
    more.onclick(); await flush(); assert.equal(shown.length, 206); assert.equal(more.hidden, true);
    fullSearch.value = '0.100000000000000001'; fullSearch.oninput(); await flush();
    assert.equal(shown.length, 1); assert.equal(more.hidden, true);
    fullSearch.value = ''; fullSearch.oninput(); await flush(); assert.equal(shown.length, 100); assert.equal(more.hidden, false);
    fullToggle.onclick(); assert.equal(more.hidden, true); await flush(); assert.equal(shown.length, 0);
    fullToggle.onclick(); await flush(); assert.equal(shown.length, 100);
    // Reopening after editing reloads data while restoring the current search.
    fullSearch.value = 'Coffee'; fullSearch.oninput(); await flush();
    more.onclick(); await flush();
    const body = fullRoot.children[0];
    body.scrollTop = 700;
    body.scroll({ currentTarget: body });
    assert.equal(api.stateManager().historySearch.scrollTop, 700);
    assert.equal(api.stateManager().historySearch.visibleOperationCount, 200);

    files['2026'].months[1].history[0].comment = 'Edited note';
    files['2026'].months[1].history.splice(1, 1);
    const restoredRoot = new Element('div');
    await api.showHistorySearch(restoredRoot, renderer);
    assert.equal(restoredRoot.find('Search operations').value, 'Coffee');
    assert.equal(restoredRoot.find('Search all history').attributes['aria-pressed'], 'true');
    assert.equal(shown.length, 200);
    assert(!shown.some(operation => operation.id === 'row-0' || operation.id === 'row-1'));
    assert.equal(restoredRoot.children[0].scrollTop, 700);

    const shortenedRoot = new Element('div');
    await api.showHistorySearch(shortenedRoot, async (container, loader) => {
        await renderer(container, loader);
        shortenedRoot.children[0].scrollHeight = 650;
    });
    assert.equal(shortenedRoot.children[0].scrollTop, 150, 'restoration clamps to the shorter list');

    // In Obsidian the scrollable element can be outside the history body.
    const outerRoot = new Element('div');
    await api.showHistorySearch(outerRoot, async (container, loader) => {
        await renderer(container, loader);
        outerRoot.children[0].scrollHeight = 500;
    });
    outerRoot.scrollTop = 800;
    outerRoot.scroll({ currentTarget: outerRoot });
    assert.equal(api.stateManager().historySearch.scrollTop, 800);
    const reopenedOuterRoot = new Element('div');
    await api.showHistorySearch(reopenedOuterRoot, async (container, loader) => {
        await renderer(container, loader);
        reopenedOuterRoot.children[0].scrollHeight = 500;
    });
    assert.equal(reopenedOuterRoot.scrollTop, 800, 'restore the ancestor that actually scrolls');
    assert.equal(reopenedOuterRoot.children[0].scrollTop, 0);

    api.stateManager({ selectedMonth: '9' });
    assert.deepEqual(api.stateManager().historySearch, {
        query: 'Coffee', globalSearchEnabled: true, visibleOperationCount: 100, scrollTop: 0,
    });
    api.stateManager({ selectedMonth: '10', selectedCurrency: 'EUR' });
    assert.equal(api.stateManager().historySearch.query, 'Coffee');
    assert.equal(api.stateManager().historySearch.scrollTop, 0);
    api.stateManager({ selectedCurrency: 'USD', historySearch: {
        query: '', globalSearchEnabled: false, visibleOperationCount: 100, scrollTop: 0,
    } });
    files['2026'].months[1].history = files['2026'].months[1].history.slice(0, 99);
    const exactRoot = new Element('div'); await api.showHistorySearch(exactRoot, renderer);
    exactRoot.find('Search all history').onclick(); await flush(); assert.equal(shown.length, 100);
    assert.equal(exactRoot.all().find(el => el.textContent === 'Show more').hidden, true);
    exactRoot.find('Search all history').onclick(); await flush();
    files['2026'].months[10].history = Array.from({ length: 120 }, (_, i) => op('month-' + i, '2026-10-01', '1'));
    const monthRoot = new Element('div'); await api.showHistorySearch(monthRoot, renderer); assert.equal(shown.length, 120);
    assert.equal(monthRoot.all().find(el => el.textContent === 'Show more').hidden, true);
    plugin.app.vault.adapter.read = async () => { throw new Error('Disk unavailable'); };
    await assert.rejects(api.loadAllHistory('USD'), /Disk unavailable/);
    console.log('History search: minimal controls, empty month, global comments, text matching, currency, cache and complete results passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
