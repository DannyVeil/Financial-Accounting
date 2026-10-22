import { Notice, setIcon } from 'obsidian';
import MainPlugin, {
    BillData,
    PlanData,
    stateManager,
    CardItem,
    YearData,
    DataFileResult,
    HistoryData,
} from '../../main';
import { getAdditionalData, getAllFile, getMainData } from '../controllers/searchData';
import {
    activeCurrency,
    divideByRemainingDays,
    formatNumbers,
    getCurrencySymbol,
    SummarizingDataForTheTrueBills,
    switchBalanceLine,
    getDate,
    inActiveCurrency,
    isSuccess,
    SummarizingData,
    CategorySummary,
    summarizeCategories,
    getAmountPercentage,
} from '../middleware/otherFunc';
import { generationHistoryContent } from './historyView';
import Big from 'big.js';
import { getEmojiColor } from '../middleware/emojiColor';

export const showHome = async (mainContent: HTMLDivElement) => {
    stateManager({ openPageNow: "Home" });

    const bills = await getAdditionalData<BillData>('accounts');
    if (bills.status === "error") {
        new Notice(bills.error.message);
        console.error(bills.error);
        return
    }

    const expensePlan = await getAdditionalData<PlanData>('categories', 'expenditure_plan');
    if (expensePlan.status === "error") {
        new Notice(expensePlan.error.message);
        console.error(expensePlan.error);
        return
    }

    const mainContentHeader = mainContent.createEl("div", {
        cls: "main-content-body",
    });

    const balanceContent = mainContentHeader.createEl("div", {
        cls: "balance-content",
    });

    const balance = balanceContent.createEl("div", {
        cls: "balance",
    });

    const balanceTop = balance.createEl("div", {
        cls: "balance-top",
    });

    balanceTop.createEl("span", {
        text: "Balance",
    });

    balanceTop.createEl("p", {
        text: `${formatNumbers(SummarizingDataForTheTrueBills(bills.jsonData).toString())} ${getCurrencySymbol(activeCurrency())}`,
    });

    balanceTop.createEl("span", {
        text: `~${formatNumbers(divideByRemainingDays(SummarizingDataForTheTrueBills(bills.jsonData)).toString())} for a day`,
    });

    const balanceLine = balance.createEl("div", {
        cls: "balance-line",
    });
    balanceLine.style.setProperty("--after-width", `${switchBalanceLine(bills.jsonData, expensePlan.jsonData)}%`);

    const statsContent = mainContent.createDiv();
    const categoriesContent = mainContent.createDiv({ cls: 'home-categories' });
    await Promise.all([renderStatistics(statsContent), showHomeCategories(categoriesContent, generationHistoryContent)]);
}

type PeriodStatistics = {
    income: Big;
    expense: Big;
    balance: Big;
    operationCount: Big;
};

function calculateYearStatistics(yearData?: YearData): PeriodStatistics {
    let income = new Big(0);
    let expense = new Big(0);
    let operationCount = new Big(0);

    for (const month of Object.values(yearData?.months ?? {})) {
        const operations = month.history.filter(inActiveCurrency);
        operationCount = operationCount.plus(operations.length);

        for (const operation of operations) {
            if (operation.type === 'expense') {
                expense = expense.plus(operation.amount);
            } else if (operation.type === 'income') {
                income = income.plus(operation.amount);
            }
        }
    }

    return { income, expense, operationCount, balance: income.minus(expense) };
}

function createStatisticsCards(
    statistics: PeriodStatistics,
    currency: string,
    period?: string,
): CardItem[] {
    const formatAmount = (amount: Big) => `${formatNumbers(amount.toString())} ${currency}`;
    return [
        {
            title: 'Income',
            value: formatAmount(statistics.income),
            icon: 'arrow-up',
            type: 'income',
            period,
        },
        {
            title: 'Expenses',
            value: formatAmount(statistics.expense),
            icon: 'arrow-down',
            type: 'expense',
            period,
        },
        {
            title: 'Balance',
            value: formatAmount(statistics.balance),
            icon: 'calendar-check',
            type: 'balance',
            period,
        },
        {
            title: 'Operations',
            value: statistics.operationCount.toString(),
            icon: 'list',
            type: 'operations',
            period,
        },
    ];
}

const renderStatistics = async (mainContent: HTMLDivElement) => {
    const [bills, expensePlan, incomePlan, history] = await Promise.all([
        getAdditionalData<BillData>('accounts'),
        getAdditionalData<PlanData>('categories', 'expenditure_plan'),
        getAdditionalData<PlanData>('categories', 'income_plan'),
        getMainData()
    ]);

    if (
        !isSuccess(bills) ||
        !isSuccess(expensePlan) ||
        !isSuccess(incomePlan) ||
        !isSuccess(history)
    ) {
        return;
    }

    const { selectedYear } = stateManager();
    const currentYear = selectedYear ?? getDate().year;
    const nowYear = new Date().getFullYear();
    const startYear = MainPlugin.instance.settings.startYear;

    const years = new Set<number>();
    for (let year = startYear; year <= nowYear; year++) {
        years.add(year);
    }
    years.add(Number(currentYear));
    const yearsToFetch = [...years];

    const yearFilesResults = await Promise.all(yearsToFetch.map(year => getAllFile<YearData>(String(year))));
    const yearFilesMap = new Map<number, YearData>();

    for (let index = 0; index < yearsToFetch.length; index++) {
        const result = yearFilesResults[index];
        if (result.status === "error") {
            new Notice(result.error.message);
            console.error(result.error);
            return;
        }
        yearFilesMap.set(yearsToFetch[index], result.json);
    }


    const selectedYearStats = calculateYearStatistics(yearFilesMap.get(Number(currentYear)));

    let totalAllExpense = new Big(0);
    let totalAllIncome = new Big(0);
    let totalOperationCount = new Big(0);

    for (let year = startYear; year <= nowYear; year++) {
        const stats = calculateYearStatistics(yearFilesMap.get(year));
        totalAllExpense = totalAllExpense.plus(stats.expense);
        totalAllIncome = totalAllIncome.plus(stats.income);
        totalOperationCount = totalOperationCount.plus(stats.operationCount);
    }
    const totalAllBalance = totalAllIncome.minus(totalAllExpense);

    const currency = getCurrencySymbol(activeCurrency());

    const monthData = createStatisticsCards({
        income: SummarizingData(incomePlan.jsonData),
        expense: SummarizingData(expensePlan.jsonData),
        balance: SummarizingDataForTheTrueBills(bills.jsonData),
        operationCount: new Big(history.jsonData.length),
    }, currency);
    const yearData = createStatisticsCards(selectedYearStats, currency, `for ${currentYear}`);
    const allData = createStatisticsCards({
        income: totalAllIncome,
        expense: totalAllExpense,
        balance: totalAllBalance,
        operationCount: totalOperationCount,
    }, currency, 'for all time');

    const gridContainer = mainContent.createDiv({ cls: "stats-grid" });

    const renderCards = (items: CardItem[]) => {
        gridContainer.empty();
        for (const item of items) {
            const card = gridContainer.createDiv({ cls: `stats-card stats-card-${item.type}` });
            const iconContainer = card.createDiv({ cls: "stats-card-icon" });
            setIcon(iconContainer, item.icon);

            const content = card.createDiv({ cls: "stats-card-content" });
            content.createDiv({ cls: "stats-card-title", text: item.title });
            content.createDiv({ cls: "stats-card-value", text: item.value });
            if (item.period) {
                content.createDiv({ cls: "stats-card-period", text: item.period });
            }
        }
    };

    const views = [
        { mode: "month", data: monthData },
        { mode: "year", data: yearData },
        { mode: "all", data: allData },
    ] as const;

    let currentViewIndex = 0;

    const updateView = () => {
        const currentView = views[currentViewIndex];
        gridContainer.dataset.data = currentView.mode;
        renderCards(currentView.data);
    };

    updateView();

    gridContainer.addEventListener("click", () => {
        currentViewIndex = (currentViewIndex + 1) % views.length;
        updateView();
    });
};

interface ChartCategory extends CategorySummary {
    color: string;
    children?: ChartCategory[];
}

type MoneyFormatter = (amount: Big) => string;

type HistoryRenderer = (container: HTMLDivElement, data: DataFileResult<HistoryData>) => Promise<unknown>;

function prepareChartCategories(history: HistoryData[], plans: PlanData[], type: HistoryData['type']): ChartCategory[] {
    return summarizeCategories(history, plans, type).map(category => ({
        ...category,
        color: getEmojiColor(category.emoji)
    }));
}

function sumCategories(categories: ChartCategory[]): Big {
    return categories.reduce((total, category) => total.plus(category.amount), new Big(0));
}

function getSelectedPeriodLabel(): string {
    const { selectedYear, selectedMonth } = stateManager();
    const now = getDate();
    const date = new Date(Number(selectedYear ?? now.year), Number(selectedMonth ?? now.month) - 1, 1);
    return date.toLocaleDateString('en', {
        month: 'long',
        year: 'numeric'
    });
}

export async function showHomeCategories(container: HTMLDivElement, renderHistory: HistoryRenderer): Promise<void> {
    const [expenses, income, history] = await Promise.all([
        getAdditionalData<PlanData>('categories', 'expenditure_plan'),
        getAdditionalData<PlanData>('categories', 'income_plan'),
        getMainData(),
    ]);
    if (!isSuccess(expenses) || !isSuccess(income) || !isSuccess(history)) {
        return;
    }
    const expenseCategories = prepareChartCategories(history.jsonData, expenses.jsonData, 'expense');
    const incomeCategories = prepareChartCategories(history.jsonData, income.jsonData, 'income');
    const currency = getCurrencySymbol(activeCurrency());
    const formatMoney: MoneyFormatter = amount => `${formatNumbers(amount.toString())} ${currency}`;
    new HomeCategoriesView(
        container,
        expenseCategories,
        incomeCategories,
        history.jsonData,
        formatMoney,
        getSelectedPeriodLabel(),
        renderHistory,
    );
}

class HomeCategoriesView {
    private readonly selectedCategoryIds = new Set<string>();
    private readonly elements: ReturnType<typeof createCategoryChartElements>;
    private readonly chartCategories: ChartCategory[];
    private readonly totalExpense: Big;
    private readonly segments: Map<string, SVGGElement>;
    private readonly categoryButtons: Map<string, HTMLButtonElement>;
    private operationsVersion = 0;

    constructor(
        container: HTMLDivElement,
        expenseCategories: ChartCategory[],
        incomeCategories: ChartCategory[],
        private readonly history: HistoryData[],
        private readonly formatMoney: MoneyFormatter,
        private readonly period: string,
        private readonly renderHistory: HistoryRenderer,
    ) {
        this.totalExpense = sumCategories(expenseCategories);
        this.elements = createCategoryChartElements(container);
        this.chartCategories = groupDonutCategories(expenseCategories, this.totalExpense, this.elements.svg);
        createChartSvg(this.elements.svg, 'circle', {
            cx: 160,
            cy: 160,
            r: DONUT_EMOJI_RADIUS,
            fill: 'none',
            'stroke-width': DONUT_OUTER_RADIUS - DONUT_INNER_RADIUS,
            class: 'home-donut-track',
        });
        const onToggle = (id: string) => this.toggleCategory(id);
        this.segments = renderDonutSegments(this.elements.svg, this.chartCategories, this.totalExpense, formatMoney, onToggle);
        if (!expenseCategories.length) {
            this.elements.chartCard.createEl('p', {
                cls: 'home-category-empty',
                text: 'No expenses for this month yet.'
            });
        }
        this.categoryButtons = renderCategoryBlock(container, this.chartCategories, this.totalExpense, 'expense', formatMoney, onToggle);
        renderCategoryBlock(container, incomeCategories, sumCategories(incomeCategories), 'income', formatMoney, onToggle);
        this.elements.clearSelection.addEventListener('click', () => {
            this.selectedCategoryIds.clear();
            this.updateSelection();
        });
        this.elements.showOperations.addEventListener('click', () => this.showSelectedOperations());
        this.updateSelection();
    }

    private toggleCategory(id: string): void {
        if (this.selectedCategoryIds.has(id)) {
            this.selectedCategoryIds.delete(id);
        } else {
            this.selectedCategoryIds.add(id);
        }
        this.updateSelection();
    }

    private updateSelection(): void {
        this.operationsVersion++;
        this.elements.operations.hidden = true;
        this.elements.operations.empty();

        const selectedCategories = this.chartCategories.filter(category => this.selectedCategoryIds.has(category.id));
        this.updateChartCenter(selectedCategories);
        this.updateCategoryHighlights(selectedCategories.length > 0);
        this.renderSelectedChips(selectedCategories);
    }

    private updateChartCenter(categories: ChartCategory[]): void {
        const { center, centerTitle, centerAmount, centerDetail, clearSelection, filter } = this.elements;
        const hasSelection = categories.length > 0;
        const amount = hasSelection ? sumCategories(categories) : this.totalExpense;
        let color = 'var(--text-muted)';
        let title = '';

        if (categories.length === 1) {
            color = categories[0].color;
            title = categories[0].name;
        } else if (hasSelection) {
            color = 'var(--interactive-accent)';
            title = `${categories.length} categories`;
        }

        center.style.setProperty('--category-color', color);
        center.classList.toggle('is-selected', hasSelection);
        centerTitle.textContent = title;
        centerTitle.hidden = !hasSelection;
        centerAmount.textContent = this.formatMoney(amount);
        centerDetail.textContent = hasSelection
            ? `${Math.round(getAmountPercentage(amount, this.totalExpense))}%`
            : `Total for ${this.period}`;
        clearSelection.hidden = !hasSelection;
        filter.hidden = !hasSelection;
    }

    private updateCategoryHighlights(hasSelection: boolean): void {
        for (const category of this.chartCategories) {
            const isSelected = this.selectedCategoryIds.has(category.id);
            const segment = this.segments.get(category.id);
            segment?.classList.toggle('is-selected', isSelected);
            segment?.classList.toggle('is-muted', hasSelection && !isSelected);
            segment?.setAttribute('aria-pressed', String(isSelected));

            const button = this.categoryButtons.get(category.id);
            button?.classList.toggle('is-selected', isSelected);
            button?.setAttribute('aria-pressed', String(isSelected));
        }
    }

    private renderSelectedChips(categories: ChartCategory[]): void {
        this.elements.chips.empty();

        for (const category of categories) {
            const chip = this.elements.chips.createEl('button', {
                text: `${category.emoji} ${category.name} ×`,
                cls: 'home-chart-chip',
                attr: {
                    type: 'button',
                    'aria-label': `Remove ${category.name} filter`
                },
            });
            chip.style.setProperty('--category-color', category.color);
            chip.addEventListener('click', () => this.toggleCategory(category.id));
        }
    }

    private showSelectedOperations(): void {
        const selectedCategories = this.chartCategories.filter(category => this.selectedCategoryIds.has(category.id));
        const categoryIds = new Set(selectedCategories.flatMap(category => category.categoryIds));
        const filtered = this.history.filter(transaction => transaction.type === 'expense' && categoryIds.has(transaction.category.id));
        this.elements.operations.empty();
        this.elements.operations.hidden = false;
        this.elements.operations.createEl('h3', {
            cls: 'home-section-title',
            text: `Selected operations · ${filtered.length}`
        });
        const list = this.elements.operations.createDiv({ cls: 'history-content' });
        const version = ++this.operationsVersion;
        void this.renderHistory(list, {
            status: 'success',
            jsonData: filtered
        }).then(() => {
            if (version === this.operationsVersion) {
                this.elements.operations.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }).catch(error => {
            console.error('Failed to show category operations', error);
        });
    }
}

function createCategoryChartElements(container: HTMLDivElement) {
    const chartCard = container.createDiv({ cls: 'home-chart-card' });
    chartCard.createEl('h3', {
        text: 'Expenses by category',
        cls: 'home-section-title'
    });
    const chart = chartCard.createDiv({ cls: 'home-donut' });
    const svg = createChartSvg(chart, 'svg', {
        viewBox: '0 0 320 320',
        class: 'home-donut-svg',
        role: 'group',
        'aria-label': 'Expenses by category'
    });
    const center = chart.createDiv({
        cls: 'home-donut-center',
        attr: {
            'aria-live': 'polite',
            'aria-atomic': 'true'
        }
    });
    const centerTitle = center.createDiv({ cls: 'home-donut-label' });
    const centerAmount = center.createDiv({ cls: 'home-donut-amount' });
    const centerDetail = center.createDiv({ cls: 'home-donut-detail' });
    const clearSelection = center.createEl('button', {
        cls: 'home-chart-clear',
        text: 'Clear selection',
        attr: { type: 'button' }
    });
    const filter = chartCard.createDiv({ cls: 'home-chart-filter' });
    const showOperations = filter.createEl('button', {
        cls: 'home-chart-operations',
        text: 'Show filtered operations →',
        attr: { type: 'button' }
    });
    const chips = filter.createDiv({ cls: 'home-chart-chips' });
    const operations = container.createDiv({ cls: 'home-category-operations' });
    operations.hidden = true;
    return {
        chartCard,
        svg,
        center,
        centerTitle,
        centerAmount,
        centerDetail,
        clearSelection,
        filter,
        showOperations,
        chips,
        operations
    };
}

function renderDonutSegments(
    svg: SVGSVGElement,
    categories: ChartCategory[],
    total: Big,
    formatMoney: MoneyFormatter,
    onToggle: (id: string) => void
): Map<string, SVGGElement> {
    const segments = new Map<string, SVGGElement>();
    let startAngle = -Math.PI / 2;
    for (const category of categories) {
        const sweep = getAmountPercentage(category.amount, total) / 100 * Math.PI * 2;
        const middle = startAngle + sweep / 2;
        const group = createChartSvg(svg, 'g', {
            class: 'home-donut-segment',
            role: 'button',
            tabindex: 0,
            'aria-pressed': 'false',
            'aria-label': `${category.name}: ${formatMoney(category.amount)}, ${Math.round(getAmountPercentage(category.amount, total))}%`,
        });
        group.style.setProperty('--segment-x', `${Math.cos(middle) * 6}px`);
        group.style.setProperty('--segment-y', `${Math.sin(middle) * 6}px`);
        createChartSvg(group, 'path', {
            d: donutSegmentPath(startAngle, sweep),
            fill: category.color
        });
        createChartSvg(group, 'title', {}).textContent = `${category.name}: ${formatMoney(category.amount)}`;
        createChartSvg(group, 'text', {
            x: 160 + Math.cos(middle) * DONUT_EMOJI_RADIUS,
            y: 160 + Math.sin(middle) * DONUT_EMOJI_RADIUS,
            class: 'home-donut-emoji',
            'aria-hidden': 'true'
        }).textContent = category.emoji;
        group.addEventListener('click', () => onToggle(category.id));
        group.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onToggle(category.id);
            }
        });
        segments.set(category.id, group);
        startAngle += sweep;
    }
    return segments;
}

function renderCategoryBlock(
    container: HTMLDivElement,
    categories: ChartCategory[],
    total: Big,
    type: HistoryData['type'],
    formatMoney: MoneyFormatter,
    onToggle: (id: string) => void
): Map<string, HTMLButtonElement> {
    const categoryButtons = new Map<string, HTMLButtonElement>();
    const block = container.createDiv({ cls: `home-category-card home-category-card--${type}` });
    const header = block.createDiv({ cls: 'home-category-header' });
    header.createEl('h3', {
        cls: 'home-section-title',
        text: type === 'expense' ? 'Expense categories' : 'Income categories'
    });
    header.createEl('span', {
        cls: 'home-category-count',
        text: String(categories.length)
    });
    if (!categories.length) {
        block.createEl('p', {
            cls: 'home-category-empty',
            text: type === 'expense' ? 'No expenses for this month yet.' : 'No income for this month yet.'
        });
        return categoryButtons;
    }
    for (const category of categories) {
        const row = block.createDiv({ cls: 'home-category-row' });
        row.style.setProperty('--category-color', category.color);
        const details = row.createDiv({ cls: 'home-category-details' });
        const label = `${category.emoji} ${category.name}`;
        if (type === 'expense') {
            const button = details.createEl('button', {
                cls: 'home-category-name',
                text: label,
                attr: {
                    type: 'button',
                    'aria-pressed': 'false'
                }
            });
            button.addEventListener('click', () => onToggle(category.id));
            categoryButtons.set(category.id, button);
        } else {
            details.createEl('span', {
                cls: 'home-category-name',
                text: label
            });
        }
        details.createEl('span', {
            cls: 'home-category-amount',
            text: formatMoney(category.amount)
        });
        renderCategoryPercentage(row, category.amount, total);
        if (category.children) {
            const breakdown = row.createEl('details', { cls: 'home-category-breakdown' });
            breakdown.createEl('summary', { text: `Show ${category.children.length} categories` });
            for (const child of category.children) {
                const item = breakdown.createDiv({ cls: 'home-category-breakdown-item' });
                item.style.setProperty('--category-color', child.color);
                const details = item.createDiv({ cls: 'home-category-details' });
                details.createEl('span', {
                    cls: 'home-category-name',
                    text: `${child.emoji} ${child.name}`
                });
                details.createEl('span', {
                    cls: 'home-category-amount',
                    text: formatMoney(child.amount)
                });
                renderCategoryPercentage(item, child.amount, total);
            }
        }
    }

    return categoryButtons;
}

function renderCategoryPercentage(container: HTMLDivElement, amount: Big, total: Big): void {
    const percentage = getAmountPercentage(amount, total);
    const progress = container.createDiv({
        cls: 'home-category-progress',
        attr: { 'aria-hidden': 'true' }
    });
    progress.createDiv().style.width = `${percentage}%`;
    container.createEl('span', {
        cls: 'home-category-percent',
        text: `${Math.round(percentage)}%`
    });
}

const DONUT_INNER_RADIUS = 86;

const DONUT_OUTER_RADIUS = 148;

const DONUT_EMOJI_RADIUS = (DONUT_INNER_RADIUS + DONUT_OUTER_RADIUS) / 2;

const DONUT_EMOJI_PADDING = 3;

function createChartSvg<K extends keyof SVGElementTagNameMap>(
    parent: Element,
    tag: K,
    attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
    const element = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
    parent.appendChild(element);
    return element;
}

function groupDonutCategories(categories: ChartCategory[], total: Big, svg: SVGSVGElement): ChartCategory[] {
    const visible = [...categories];
    const other: ChartCategory = {
        id: '__other__',
        name: 'Other',
        emoji: '📦',
        color: '#81818b',
        amount: new Big(0),
        categoryIds: [],
        children: []
    };
    const boundsByEmoji = new Map<string, DOMRect>();
    const fits = (category: ChartCategory, start: number) => {
        let bounds = boundsByEmoji.get(category.emoji);
        if (!bounds) {
            const label = createChartSvg(svg, 'text', {
                x: 0,
                y: 0,
                class: 'home-donut-emoji',
                visibility: 'hidden',
                'aria-hidden': 'true'
            });
            label.textContent = category.emoji;
            bounds = label.getBBox();
            label.remove();
            // A hidden Obsidian pane may not provide text metrics until it is shown.
            if (!bounds.width || !bounds.height) {
                bounds = new DOMRect(-11, -13, 22, 26);
            }
            boundsByEmoji.set(category.emoji, bounds);
        }
        const sweep = getAmountPercentage(category.amount, total) / 100 * Math.PI * 2;
        return donutEmojiFits(bounds, start, sweep);
    };
    const moveToOther = (index: number) => {
        const [category] = visible.splice(index, 1);
        other.amount = other.amount.plus(category.amount);
        other.categoryIds.push(...category.categoryIds);
        other.children?.push(category);
    };
    while (visible.length) {
        let start = -Math.PI / 2;
        const tooSmall = visible.findIndex(category => {
            if (!fits(category, start)) {
                return true;
            }
            start += getAmountPercentage(category.amount, total) / 100 * Math.PI * 2;
            return false;
        });
        if (tooSmall !== -1) {
            moveToOther(tooSmall);
            // Removing a slice moves the following horizontal emoji to new angles.
            continue;
        }
        if (other.categoryIds.length && !fits(other, start)) {
            // Other must also have enough space for its icon; keep exact proportions.
            moveToOther(visible.length - 1);
            continue;
        }
        break;
    }
    if (other.categoryIds.length) {
        other.children?.sort((a, b) => b.amount.cmp(a.amount));
        visible.push(other);
    }
    return visible;
}

function donutEmojiFits(bounds: DOMRect, start: number, sweep: number): boolean {
    const middle = start + sweep / 2;
    const x = Math.cos(middle) * DONUT_EMOJI_RADIUS;
    const y = Math.sin(middle) * DONUT_EMOJI_RADIUS;
    const left = x + bounds.x - DONUT_EMOJI_PADDING;
    const right = x + bounds.x + bounds.width + DONUT_EMOJI_PADDING;
    const top = y + bounds.y - DONUT_EMOJI_PADDING;
    const bottom = y + bounds.y + bounds.height + DONUT_EMOJI_PADDING;
    const nearestRadius = Math.hypot(Math.max(left, 0, -right), Math.max(top, 0, -bottom));
    if (nearestRadius < DONUT_INNER_RADIUS) {
        return false;
    }
    const halfAngle = sweep / 2 - donutSegmentGap(sweep);
    return [[left, top], [right, top], [left, bottom], [right, bottom]].every(([px, py]) => {
        const angle = Math.atan2(py, px) - middle;
        const difference = Math.atan2(Math.sin(angle), Math.cos(angle));
        return Math.hypot(px, py) <= DONUT_OUTER_RADIUS && Math.abs(difference) <= halfAngle;
    });
}

function donutSegmentGap(sweep: number): number {
    return sweep < Math.PI * 2 - 0.001 ? Math.min(0.016, sweep / 4) : 0;
}

function donutSegmentPath(start: number, sweep: number): string {
    // Two arcs also cover a full ring when the month has just one category.
    const gap = donutSegmentGap(sweep);
    const from = start + gap;
    const to = start + sweep - gap;
    const middle = (from + to) / 2;
    const point = (radius: number, angle: number) => `${160 + Math.cos(angle) * radius} ${160 + Math.sin(angle) * radius}`;
    const outer = DONUT_OUTER_RADIUS;
    const inner = DONUT_INNER_RADIUS;
    return [
        `M ${point(outer, from)}`,
        `A ${outer} ${outer} 0 0 1 ${point(outer, middle)}`,
        `A ${outer} ${outer} 0 0 1 ${point(outer, to)}`,
        `L ${point(inner, to)}`,
        `A ${inner} ${inner} 0 0 0 ${point(inner, middle)}`,
        `A ${inner} ${inner} 0 0 0 ${point(inner, from)}`,
        'Z',
    ].join(' ');
}
