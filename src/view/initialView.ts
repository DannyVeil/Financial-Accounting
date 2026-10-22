import { Notice, Menu, setIcon } from 'obsidian';
import MainPlugin, { FinancialAccountingView, stateManager, BillData } from '../../main';
import { generateYearlyFile, initDB } from '../controllers/DB';
import {
    getDate,
    activeCurrency,
    IncomeAndExpensesForTheMonth,
    TheSumOfExpensesAndIncomeForTheYear,
} from '../middleware/otherFunc';
import currencies from '../../currencies.json';
import flags from '../assets/currency-flags.json';
import { getAdditionalData } from '../controllers/searchData';
import { showBills } from './accountsView';
import { addHistory } from './addView';
import { showHome } from './homeView';
import { showHistory } from './historyView';
import { showPlans } from './plansView';

export const showInitialView = async (): Promise<void> => {
    const initDBResult = await initDB();
    if (initDBResult.status === "error") {
        new Notice(initDBResult.error.message);
        console.error(initDBResult.error);
        return;
    }

    const generateYearlyFileResult = await generateYearlyFile();
    if (generateYearlyFileResult.status === "error") {
        new Notice(generateYearlyFileResult.error.message);
        console.error(generateYearlyFileResult.error);
        return;
    }

    if (!FinancialAccountingView.instance || !MainPlugin.instance) {

        return;

    }

    stateManager({ selectedMonth: null, selectedYear: null });

    const { contentEl } = FinancialAccountingView.instance;


    contentEl.empty();
    contentEl.addClass("finance-content");

    await renderFinanceHeader('home', () => showAllMonths(initOtherMonth));

    contentEl.setAttribute("data-page", "home");

    await renderNavigation(true);
}

export const showAnotherInitialView = async (): Promise<void> => {
    if (!FinancialAccountingView.instance || !MainPlugin.instance) {
        return;
    }

    const { contentEl } = FinancialAccountingView.instance;
    contentEl.empty();

    await renderFinanceHeader('home', () => showAllMonths(initOtherMonth));
    contentEl.setAttribute("data-page", "home");

    await renderNavigation(false);
}

export const initOtherMonth = async (e: MouseEvent): Promise<void> => {
    const { year, month } = getDate();

    const target = (e.target as HTMLElement)?.closest<HTMLElement>("[data-month]") ?? (e.target as HTMLElement);
    const dataMonth = target?.dataset?.month;
    const dataYear = String(target?.dataset?.year);

    if (dataMonth === month && dataYear === year) {
        stateManager({ selectedMonth: null, selectedYear: null });
        return FinancialAccountingView.instance?.onOpen();
    }

    stateManager({ selectedMonth: dataMonth, selectedYear: dataYear });

    await showAnotherInitialView();
}

async function renderFinanceHeader(page: 'home' | 'calendar', openCalendar: () => Promise<void>): Promise<void> {
    const { contentEl } = FinancialAccountingView.instance;
    const { selectedMonth, selectedYear } = stateManager();
    const currentDate = getDate();
    const isCalendar = page === 'calendar';
    const header = contentEl.createDiv({ cls: 'finance-header finance-header--currency' });

    const backButton = header.createEl('button', {
        cls: 'finance-back',
        attr: { type: 'button', 'aria-label': 'Back', title: 'Back' },
    });
    setIcon(backButton, 'chevron-left');
    backButton.disabled = !isCalendar && !selectedMonth;
    backButton.addEventListener('click', () => {
        if (!isCalendar) {
            stateManager({ selectedMonth: null, selectedYear: null });
        }
        void FinancialAccountingView.instance.onOpen();
    });

    const monthLabels = [
        '☃️ January', '🌨️ February', '🌷 March', '🌱 April',
        '☀️ May', '🌳 June', '🏖️ July', '🌾 August',
        '🍁 September', '🍂 October', '☔ November', '❄️ December',
    ];
    const monthIndex = Number(selectedMonth ?? currentDate.month) - 1;
    const yearLabel = selectedYear && selectedYear !== currentDate.year ? ' ' + selectedYear : '';
    const monthButton = header.createEl('button', {
        cls: 'finance-month',
        attr: { type: 'button', 'aria-label': 'Select month' },
    });
    monthButton.createSpan({ text: monthLabels[monthIndex] + yearLabel });
    monthButton.addEventListener('click', () => {
        void openCalendar();
    });

    const currencyButton = header.createEl('button', {
        cls: 'finance-currency',
        attr: {
            type: 'button',
            'aria-label': 'Select currency',
            'aria-haspopup': 'menu',
            title: 'Currency',
        },
    });
    const label = currencyButton.createSpan({ cls: 'finance-currency-label' });
    label.appendChild(currencyLabel(activeCurrency()));
    const chevron = currencyButton.createSpan({ cls: 'finance-header-chevron' });
    setIcon(chevron, 'chevron-down');

    const accounts = await getAdditionalData<BillData>('accounts', undefined, true);
    const currencyCodes = new Set([MainPlugin.instance.settings.baseCurrency, activeCurrency()]);
    if (accounts.status === 'success') {
        for (const account of accounts.jsonData) {
            currencyCodes.add(account.currency);
        }
    } else {
        new Notice(accounts.error.message);
    }

    currencyButton.addEventListener('click', event => {
        const menu = new Menu();
        for (const code of [...currencyCodes].sort()) {
            menu.addItem(item => {
                item.setTitle(currencyLabel(code));
                item.setChecked(code === activeCurrency());
                item.onClick(() => {
                    stateManager({ selectedCurrency: code });
                    if (isCalendar) {
                        void openCalendar();
                    } else {
                        void FinancialAccountingView.instance.onOpen();
                    }
                });
            });
        }
        menu.showAtMouseEvent(event);
    });
}

/** Local artwork avoids reliance on the operating system's flag emoji font. */
function currencyLabel(code: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const emoji = currencies[code as keyof typeof currencies]?.flagEmoji ?? '🌐';
    const svg = (flags as Record<string, string>)[emoji];
    if (svg) {
        const image = document.createElement('img');
        image.className = 'finance-currency-flag';
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.width = 22;
        image.height = 22;
        image.draggable = false;
        fragment.appendChild(image);
    }
    fragment.appendChild(document.createTextNode(code));
    return fragment;
}

type NavigationPage = {
    name: string;
    buttonId: string;
    icon: string;
    render: (container: HTMLDivElement) => Promise<unknown>;
};

async function renderNavigation(includeAccounts: boolean): Promise<void> {
    const { contentEl } = FinancialAccountingView.instance;
    const { openPageNow } = stateManager();
    const navigation = contentEl.createDiv({ cls: 'home-nav' });
    const pageButtons = navigation.createDiv({ cls: 'main-nav' });
    const actionButtons = navigation.createDiv({ cls: 'add-nav' });
    const content = contentEl.createDiv({ cls: 'main-content' });

    const addButton = actionButtons.createEl('a', {
        attr: { id: 'add-button', href: '#' },
    });
    setIcon(addButton, 'plus');
    addButton.addEventListener('click', () => {
        void addHistory();
    });

    const pages: NavigationPage[] = [
        { name: 'Home', buttonId: 'home-button', icon: 'home', render: showHome },
        { name: 'History', buttonId: 'history-button', icon: 'list', render: showHistory },
        { name: 'Plans', buttonId: 'plan-button', icon: 'square-chart-gantt', render: showPlans },
    ];
    if (includeAccounts) {
        pages.push({ name: 'Bills', buttonId: 'bills-button', icon: 'wallet', render: showBills });
    }

    const buttonsByPage = new Map<string, HTMLAnchorElement>();
    const activatePage = (page: NavigationPage) => {
        for (const [name, button] of buttonsByPage) {
            if (name === page.name) {
                button.addClass('home_button--active');
            } else {
                button.removeClass('home_button--active');
            }
        }
        content.empty();
        void page.render(content);
    };

    for (const page of pages) {
        const button = pageButtons.createEl('a', {
            attr: { id: page.buttonId, href: '#' },
        });
        setIcon(button, page.icon);
        button.addEventListener('click', () => activatePage(page));
        buttonsByPage.set(page.name, button);
    }

    const initialPage = pages.find(page => page.name === openPageNow) ?? pages[0];
    activatePage(initialPage);
}

export const showAllMonths = async (selectMonth: (event: MouseEvent) => Promise<void>): Promise<void> => {
    const { contentEl } = FinancialAccountingView.instance;
    contentEl.empty();

    const { year } = getDate();

    await renderFinanceHeader('calendar', () => showAllMonths(selectMonth));

    const calendarHead = contentEl.createEl("div", {
        cls: "calendar-header",
    });
    calendarHead.createEl("h1", { text: "Calendar" });

    const calendarMain = contentEl.createEl("div", {
        cls: "calendar-main",
    });

    const allMonths = [
        "☃️ January",
        "🌨️ February",
        "🌷 March",
        "🌱 April",
        "☀️ May",
        "🌳 June",
        "🏖️ July",
        "🌾 August",
        "🍁 September",
        "🍂 October",
        "☔ November",
        "❄️ December",
    ];

    for (let i = Number(year); i >= MainPlugin.instance.settings.startYear; i--) {
        const calendarUlTitle = calendarMain.createEl("div", {
            cls: "calendar-list-title",
        });
        calendarUlTitle.createEl("span", { text: String(i) });
        TheSumOfExpensesAndIncomeForTheYear(String(i), calendarUlTitle).toString();

        const calendarUl = calendarMain.createEl("ul", {
            cls: "calendar-list",
            attr: {
                "data-year": i,
            },
        });

        for (let k = allMonths.length - 1; k >= 0; k--) {
            const calendarItem = calendarUl.createEl("li", {
                attr: {
                    "data-month": `${k + 1}`,
                    "data-year": `${i}`,
                },
            });
            calendarItem.onclick = async (ev: MouseEvent) => {
                await selectMonth(ev);
            };
            calendarItem.createEl("p", {
                text: allMonths[k],
            });
            const storyMonth = calendarItem.createEl("div", {
                cls: "story-month",
            });
            await IncomeAndExpensesForTheMonth(`${k + 1}`, String(i), storyMonth);
        }
    }
}
