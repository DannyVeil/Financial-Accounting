const assert = require('node:assert/strict');
const esbuild = require('esbuild');

class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.children = [];
        this.attributes = {};
        this.events = {};
        this.dataset = {};
        this.hidden = false;
        this.textContent = '';
        this.classes = new Set();
        this.style = { setProperty() {} };
        this.classList = {
            toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
        };
        this.ownerDocument = { createElementNS: (_, tag) => new Element(tag) };
    }
    createEl(tag, options = {}) {
        const element = new Element(tag);
        element.textContent = options.text || '';
        element.classes = new Set((options.cls || '').split(' ').filter(Boolean));
        Object.assign(element.attributes, options.attr);
        this.appendChild(element);
        return element;
    }
    createDiv(options) { return this.createEl('div', options); }
    appendChild(element) { this.children.push(element); element.parent = this; }
    setAttribute(name, value) {
        this.attributes[name] = value;
        if (name === 'class') this.classes = new Set(value.split(' '));
    }
    addEventListener(name, callback) { this.events[name] = callback; }
    fire(name, event = {}) { return this.events[name]?.(event); }
    empty() { this.children = []; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    getBBox() { return { x: -11, y: -13, width: 22, height: 26 }; }
    scrollIntoView() { this.scrolled = true; }
    all(className) {
        const matches = this.classes.has(className) ? [this] : [];
        return matches.concat(this.children.flatMap(child => child.all(className)));
    }
    one(className) { const element = this.all(className)[0]; assert(element, className); return element; }
}

(async () => {
    const fixture = { expenses: [], income: [], history: [], accounts: [], years: {} };
    const result = await esbuild.build({
        entryPoints: ['src/view/homeView.ts'], bundle: true,
        platform: 'node', format: 'cjs', write: false,
        plugins: [{ name: 'chart-fixture', setup(build) {
            build.onResolve({ filter: /(^obsidian$|\/main$|\/controllers\/searchData$|\/middleware\/emojiColor$|\/historyView$)/ }, args => ({ path: args.path, namespace: 'fixture' }));
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
                let contents;
                if (args.path === 'obsidian') contents = 'export class Notice {} export function setIcon() {}';
                else if (args.path.endsWith('/historyView')) contents = 'export const generationHistoryContent = async () => {};';
                else if (args.path.endsWith('/main')) contents = `
                    export function stateManager() { return { selectedYear: '2026', selectedMonth: '10', selectedCurrency: 'USD' }; }
                    export default class Plugin { static instance = { settings: { baseCurrency: 'USD', startYear: 2025 } }; }
                `;
                else if (args.path.endsWith('/emojiColor')) contents = 'export const getEmojiColor = () => "#123456";';
                else contents = `
                    export const getMainData = async () => ({ status: 'success', jsonData: fixture.history });
                    export const getAdditionalData = async (source, group) => ({ status: 'success', jsonData: source === 'accounts' ? fixture.accounts : group === 'income_plan' ? fixture.income : fixture.expenses });
                    export const getAllFile = async year => ({ status: 'success', json: fixture.years[year] ?? { months: {} } });
                `;
                return { contents, loader: 'js' };
            });
        } }],
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'fixture', result.outputFiles[0].text)(require, module, module.exports, fixture);
    const { showHomeCategories, showHome } = module.exports;
    const category = (id, name, type = 'expense') => ({ id, name, type, emoji: '🍕', amount: '0' });
    const operation = (id, categoryId, amount, type = 'expense') => ({ id, category: { id: categoryId }, amount, type, currency: 'USD' });
    fixture.expenses = [category('food', 'Food'), category('travel', 'Travel')];
    fixture.income = [category('salary', 'Salary', 'income')];
    fixture.history = [operation('a', 'food', '60'), operation('b', 'travel', '40'), operation('c', 'salary', '200', 'income')];
    const root = new Element();
    const rendered = [];
    let finishRender;
    await showHomeCategories(root, (_, data) => {
        rendered.push(data.jsonData.map(row => row.id));
        return new Promise(resolve => { finishRender = resolve; });
    });
    assert.equal(root.one('home-donut-amount').textContent, '100 $');
    assert.equal(root.one('home-chart-filter').hidden, true);
    const buttons = root.all('home-category-name').filter(element => element.tag === 'button');
    assert.equal(buttons.length, 2, 'income categories are not selectable');
    buttons[0].fire('click');
    assert.equal(root.one('home-donut-amount').textContent, '60 $');
    assert.equal(root.one('home-donut-detail').textContent, '60%');
    assert.equal(buttons[0].attributes['aria-pressed'], 'true');
    root.one('home-chart-operations').fire('click');
    assert.deepEqual(rendered[0], ['a']);
    buttons[1].fire('click');
    finishRender();
    await Promise.resolve();
    assert.equal(root.one('home-category-operations').hidden, true);
    assert(!root.one('home-category-operations').scrolled, 'stale rendering must not scroll after selection changes');
    assert.equal(root.one('home-donut-label').textContent, '2 categories');
    root.one('home-chart-chip').fire('click');
    assert.equal(root.one('home-donut-amount').textContent, '40 $');
    root.one('home-chart-clear').fire('click');
    assert.equal(root.one('home-donut-amount').textContent, '100 $');
    let prevented = false;
    root.one('home-donut-segment').fire('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
    assert(prevented);
    assert.equal(root.one('home-donut-amount').textContent, '60 $');

    fixture.expenses = [category('food', 'Food'), category('tiny', 'Tiny')];
    fixture.history = [operation('large', 'food', '999'), operation('small', 'tiny', '1')];
    const grouped = new Element();
    const groupedOperations = [];
    await showHomeCategories(grouped, async (_, data) => { groupedOperations.push(data.jsonData.map(row => row.id)); });
    const other = grouped.all('home-category-name').find(element => element.tag === 'button' && element.textContent.includes('Other'));
    assert(other, 'small slices must remain grouped as Other');
    other.fire('click');
    grouped.one('home-chart-operations').fire('click');
    assert(groupedOperations[0].includes('small'), 'Other retains the underlying category IDs');
    assert(grouped.all('home-category-breakdown-item').length > 0);

    fixture.history = [];
    const empty = new Element();
    await showHomeCategories(empty, async () => {});
    assert.equal(empty.one('home-donut-amount').textContent, '0 $');
    assert.equal(empty.all('home-donut-segment').length, 0);
    assert.equal(empty.one('home-chart-filter').hidden, true);
    fixture.accounts = [{ balance: '50', currency: 'USD', generalBalance: true }];
    fixture.expenses = [{ ...category('food', 'Food'), amount: '10' }];
    fixture.income = [{ ...category('salary', 'Salary', 'income'), amount: '30' }];
    fixture.history = [operation('expense', 'food', '10'), operation('income', 'salary', '30', 'income')];
    fixture.years = {
        2025: { months: { 1: { history: [operation('older', 'salary', '100', 'income')] } } },
        2026: { months: { 10: { history: [
            ...fixture.history,
            { ...operation('other-currency', 'food', '500'), currency: 'EUR' },
        ] } } },
    };
    const home = new Element();
    await showHome(home);
    const statistics = home.one('stats-grid');
    const values = () => statistics.all('stats-card-value').map(element => element.textContent);
    assert.deepEqual(values(), ['30 $', '10 $', '50 $', '2']);
    statistics.fire('click');
    assert.equal(statistics.dataset.data, 'year');
    assert.deepEqual(values(), ['30 $', '10 $', '20 $', '2']);
    statistics.fire('click');
    assert.equal(statistics.dataset.data, 'all');
    assert.deepEqual(values(), ['130 $', '10 $', '120 $', '3']);
    statistics.fire('click');
    assert.equal(statistics.dataset.data, 'month');
    assert.deepEqual(values(), ['30 $', '10 $', '50 $', '2']);
    console.log('Home: category filters, chart rendering and month/year/all-time statistics checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
