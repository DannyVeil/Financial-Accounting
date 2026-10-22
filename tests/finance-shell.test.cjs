const assert = require('node:assert/strict');
const esbuild = require('esbuild');

class Element {
    constructor(options = {}) {
        this.children = [];
        this.dataset = {};
        this.attributes = { ...options.attr };
        this.events = {};
        this.text = options.text;
        for (const [name, value] of Object.entries(options.attr || {})) {
            if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value);
        }
    }
    createEl(tag, options) {
        const element = new Element(options);
        element.tag = tag;
        this.children.push(element);
        return element;
    }
    createDiv(options) { return this.createEl('div', options); }
    createSpan(options) { return this.createEl('span', options); }
    appendChild(element) { this.children.push(element); }
    empty() { this.children = []; }
    addClass() {}
    removeClass() {}
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    closest() { return this; }
    allMonths() {
        const own = this.dataset.month ? [this] : [];
        return own.concat(this.children.flatMap(child => child.allMonths()));
    }
    findAttribute(name, value) {
        if (this.attributes[name] === value) return this;
        for (const child of this.children) {
            const match = child.findAttribute(name, value);
            if (match) return match;
        }
    }
}

(async () => {
    const calls = [];
    const fixture = {
        state: { selectedMonth: null, selectedYear: null },
        root: new Element(), calls,
        onOpen: async () => { calls.push('reopen'); },
    };
    const previousDocument = global.document;
    global.document = {
        createDocumentFragment: () => new Element(),
        createElement: () => new Element(),
        createTextNode: text => new Element({ text }),
    };
    const result = await esbuild.build({
        entryPoints: ['src/view/initialView.ts'],
        bundle: true, platform: 'node', format: 'cjs', write: false,
        plugins: [{ name: 'home-fixture', setup(build) {
            build.onResolve({ filter: /(^obsidian$|\/main$|\/controllers\/(DB|searchData)$|\/middleware\/otherFunc$|\.\/(homeView|historyView|plansView|accountsView|addView)$)/ }, args => ({ path: args.path, namespace: 'fixture' }));
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
                let contents;
                if (args.path === 'obsidian') contents = 'export class Notice {} export class Menu {} export function setIcon() {}';
                else if (args.path.endsWith('/main')) contents = `
                    export const stateManager = update => { if (update) Object.assign(fixture.state, update); return fixture.state; };
                    export class FinancialAccountingView { static instance = { contentEl: fixture.root, onOpen: fixture.onOpen }; }
                    export default class Plugin { static instance = { settings: { startYear: 2025, baseCurrency: 'USD' } }; }
                `;
                else if (args.path.endsWith('/DB')) contents = `
                    export const initDB = async () => { fixture.calls.push('init'); return { status: 'success' }; };
                    export const generateYearlyFile = async () => { fixture.calls.push('years'); return { status: 'success' }; };
                `;
                else if (args.path.endsWith('/otherFunc')) contents = `
                    export const getDate = () => ({ year: '2026', month: '10' });
                    export const activeCurrency = () => 'USD';
                    export const TheSumOfExpensesAndIncomeForTheYear = () => 0;
                    export const IncomeAndExpensesForTheMonth = async () => {};
                `;
                else if (args.path.endsWith('/searchData')) contents = `export const getAdditionalData = async () => ({ status: 'success', jsonData: [] });`;
                else contents = `
                    export const showHome = async () => { fixture.calls.push('home'); };
                    export const showHistory = async () => { fixture.calls.push('history'); };
                    export const showPlans = async () => { fixture.calls.push('plans'); };
                    export const showBills = async () => { fixture.calls.push('accounts'); };
                    export const addHistory = async () => { fixture.calls.push('add'); };
                `;
                return { contents, loader: 'js' };
            });
        } }],
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'fixture', result.outputFiles[0].text)(require, module, module.exports, fixture);
    const api = module.exports;

    await api.showInitialView();
    assert.deepEqual(calls, ['init', 'years', 'home']);
    assert.equal(fixture.root.attributes['data-page'], 'home');
    assert(fixture.root.findAttribute('id', 'bills-button'));
    fixture.root.findAttribute('id', 'history-button').events.click();
    assert.equal(calls.at(-1), 'history');
    fixture.root.findAttribute('id', 'plan-button').events.click();
    assert.equal(calls.at(-1), 'plans');
    fixture.root.findAttribute('id', 'bills-button').events.click();
    assert.equal(calls.at(-1), 'accounts');
    fixture.root.findAttribute('id', 'add-button').events.click();
    assert.equal(calls.at(-1), 'add');

    fixture.root.findAttribute('aria-label', 'Select month').events.click();
    await new Promise(resolve => setImmediate(resolve));
    let months = fixture.root.allMonths();
    assert.equal(months.length, 24);
    assert.deepEqual(months[0].dataset, { month: '12', year: '2026' });
    const previousMonth = months.find(item => item.dataset.year === '2026' && item.dataset.month === '9');
    await previousMonth.onclick({ target: previousMonth });
    assert.deepEqual(fixture.state, { selectedMonth: '9', selectedYear: '2026' });
    assert.equal(calls.at(-1), 'home');
    assert.equal(fixture.root.findAttribute('id', 'bills-button'), undefined);

    fixture.root.findAttribute('aria-label', 'Select month').events.click();
    await new Promise(resolve => setImmediate(resolve));
    months = fixture.root.allMonths();
    const currentMonth = months.find(item => item.dataset.year === '2026' && item.dataset.month === '10');
    await currentMonth.onclick({ target: currentMonth });
    assert.deepEqual(fixture.state, { selectedMonth: null, selectedYear: null });
    assert.equal(calls.at(-1), 'reopen');

    fixture.state.selectedMonth = '3';
    fixture.state.selectedYear = '2025';
    await api.showAnotherInitialView();
    assert.deepEqual(fixture.state, { selectedMonth: '3', selectedYear: '2025' });
    await api.showInitialView();
    assert.deepEqual(fixture.state, { selectedMonth: null, selectedYear: null });
    global.document = previousDocument;
    console.log('Initial view: initialization, navigation buttons, calendar and month switching checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
