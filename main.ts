import { Plugin, ItemView, WorkspaceLeaf, Platform, PluginSettingTab, Setting, Notice, App, Modal } from 'obsidian';
import { showInitialView, showAnotherInitialView } from './src/view/initialView';
import { getDate } from './src/middleware/otherFunc';
import { getCurrencyGroups } from './src/middleware/otherFunc';
// import { getAdditionalData } from './src/controllers/searchData';
import { generateYearlyFile } from './src/controllers/DB';
import { exportHistoryCsv } from './src/controllers/exportData';
import { DEFAULT_BACKUP_FOLDER, recoverInterruptedRestore } from './src/controllers/backupData';
import { addBackupSettings } from './src/view/backupSettings';
// import { ImportHistoryModal } from './src/view/importSettings';
// import { recoverInterruptedImport } from './src/controllers/importData';
import { assertDataAvailable, withDataAccess } from './src/controllers/dataAccess';

const FINANCIAL_ACCOUNTING_VIEW = "financial-accounting-view";
const { year } = getDate();

/* =========== Main Types =========== */

export interface BillData {
	readonly id: string;
	name: string;
	emoji: string;
	balance: string;
	currency: string;
	generalBalance: boolean;
	comment?: string;
	archived: boolean;
}

export interface PlanData {
	readonly id: string;
	name: string;
	emoji: string;
	amount: string;
	// parentId: null | string;
	comment?: string;
	type: 'expense' | 'income';
	archived: boolean;
}

export type PlanDataWithoutAmount = Omit<PlanData, 'amount'>;

export interface HistoryData {
	currency?: string;
	readonly id: string;
	amount: string;
	bill: { id: string };
	category: { id: string };
	comment?: string;
	date: string;
	type: 'expense' | 'income';
}

export interface CurrencyType {
	readonly flagEmoji: string;
	readonly code: string;
	readonly name: string;
	readonly symbol: string;
}

export interface YearData {
	year: string;
	months: {
		[month: string]: monthData;
	};
}

export interface monthData {
	income_plan: PlanData[];
	expenditure_plan: PlanData[];
	history: HistoryData[];
}

export interface accountsData {
	accounts: BillData[];
}

type categoriesType = {
	expenditure_plan: PlanDataWithoutAmount[];
	income_plan: PlanDataWithoutAmount[];
}

export interface categoriesData {
	categories: categoriesType;
}

/* =========== Result Types =========== */

export type ResultOfAllData<T> =
	| {
		status: 'success';
		json: T;
	}
	| {
		status: 'error';
		error: Error;
	};

export type ResultOfExecution =
	| {
		status: 'success';
	}
	| {
		status: 'error';
		error: Error;
	};

export interface ErrorResult {
	status: "error";
	error: { message: string };
}

export interface SuccessResult<T> {
	status: "success";
	jsonData: T;
}

export type Result<T> = SuccessResult<T> | ErrorResult;

export type TransferData =
	| {
		readonly type: 'same-currency';
		readonly fromBillId: string;
		readonly toBillId: string;
		amount: string;
	}
	| {
		readonly type: 'cross-currency';
		readonly fromBillId: string;
		readonly toBillId: string;
		sourceAmount: string;
		targetAmount: string;
	};

export type DataFileResult<T> =
	| {
		status: 'success';
		readonly jsonData: T[];
	}
	| {
		status: 'error';
		error: Error;
	};

export type DataItemResult<T> =
	| {
		status: 'success';
		item: T;
	}
	| {
		status: 'error';
		error: Error;
	};

export interface CardItem {
	title: string;
	value: string;
	icon: string;
	type: "income" | "expense" | "balance" | "operations";
	period?: string;
}

export default class MainPlugin extends Plugin {
	static instance: MainPlugin;
	settings: DefaultSettings = new DefaultSettings();
	private unregisterTracking?: () => void;

	async onload(): Promise<void> {
		MainPlugin.instance = this;

		try {
            // if (await recoverInterruptedImport(this)) new Notice('Interrupted history import rolled back.');
            if (await recoverInterruptedRestore(this)) new Notice('Interrupted restore recovered. Your previous financial data is intact.', 10000);
        } catch (error) {
            new Notice('Financial Accounting recovery failed. No finance views were opened. Keep the backup files and restart Obsidian to retry.', 15000);
            throw error;
        }
        await this.loadSettings();

		this.registerView(
			FINANCIAL_ACCOUNTING_VIEW,
			(leaf: WorkspaceLeaf) => new FinancialAccountingView(leaf)
		);

		this.app.workspace.onLayoutReady(() => {
			this.addSettingTab(new SettingsTab(this.app, this));

			const ribbonIcon = this.addRibbonIcon("badge-dollar-sign", "Add operation", async () => {
				await this.activateView();
			});
			this.registerInterval(
				window.setInterval(() => {
					const ribbon = document.querySelector(".workspace-ribbon.mod-left");
					if (!ribbon || !ribbonIcon) return;

					if (Platform.isMobile && ribbon.firstChild !== ribbonIcon) {
						ribbon.append(ribbonIcon);
					}
				}, 1000)
			);

			this.unregisterTracking = trackActiveFinancialAccountingView(
				this.app,
				() => {
					waitForMobileNavBar((mobileNavBar) => {
						mobileNavBar.classList.add('disable-mobile-nav-bar');
					});
				},
				() => {
					waitForMobileNavBar((mobileNavBar) => {
						mobileNavBar.classList.remove('disable-mobile-nav-bar');
					});
				}
			);

			this.addCommand({
				id: "view-finance",
				name: "Open the finance panel",
				callback: () => this.activateView(),
			});
		});
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(FINANCIAL_ACCOUNTING_VIEW)[0];

		if (!leaf) {
			if (Platform.isDesktop) {
				leaf = workspace.getRightLeaf(false);
			} else {
				leaf = workspace.getLeaf(true);
			}

			if (leaf) {
				await leaf.setViewState({
					type: FINANCIAL_ACCOUNTING_VIEW,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf).catch(console.error);
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData();
		const defaults = new DefaultSettings();
		this.settings = Object.assign({}, defaults, loaded || {});
		if (loaded == null) await this.saveSettings();
	}
	async saveSettings(): Promise<void> {
		await withDataAccess(() => this.saveData(this.settings));
	}

	get dbPath(): string {
		return `${this.app.vault.configDir}/plugins/financial-accounting/db`;
	}

	onunload(): void {
		this.unregisterTracking?.();
	}
}

export class FinancialAccountingView extends ItemView {
	static instance: FinancialAccountingView;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return FINANCIAL_ACCOUNTING_VIEW;
	}

	getDisplayText(): string {
		return "Financial accounting view";
	}

	getIcon(): string {
		return "chart-pie";
	}

	async onOpen(): Promise<void> {
		FinancialAccountingView.instance = this;

		const { selectedYear, selectedMonth } = stateManager();
		if (selectedMonth === null && selectedYear === null) {
			await showInitialView();
		} else {
			await showAnotherInitialView();
		}
	}

	async onClose(): Promise<void> {
	}
}

class DefaultSettings {
	backupFolder = DEFAULT_BACKUP_FOLDER;
	startYear: number;
	baseCurrency: string;
	constructor() {
		this.startYear = Number(year);
		this.baseCurrency = "USD";
	}
}

class SettingsTab extends PluginSettingTab {
	plugin: MainPlugin;
	constructor(app: App, plugin: MainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Preferences")
			.setHeading();

		// Selecting the base currency
		const settingEl = new Setting(containerEl)
			.setName("Main currency")
			.setDesc("Select the currency from which the conversion will be performed")
			.settingEl;

		const selectEl = settingEl.createEl("select", { cls: "currency-select" });

		const { popularCurrencies, otherCurrencies } = getCurrencyGroups();
		// --- Popular ---
		const popularGroup = document.createElement("optgroup");
		popularGroup.label = "Popular";

		popularCurrencies.forEach((cur: CurrencyType) => {
			const option = document.createElement("option");
			option.value = cur.code;
			option.textContent = `${cur.code} • ${cur.name} • ${cur.symbol}`;
			popularGroup.appendChild(option);
		});

		// --- Other ---
		const otherGroup = document.createElement("optgroup");
		otherGroup.label = "All currencies";

		otherCurrencies.forEach((cur: CurrencyType) => {
			const option = document.createElement("option");
			option.value = cur.code;
			option.textContent = `${cur.code} ${cur.name} • ${cur.symbol}`;
			otherGroup.appendChild(option);
		});

		selectEl.appendChild(popularGroup);
		selectEl.appendChild(otherGroup);

		selectEl.value = this.plugin.settings.baseCurrency;

		selectEl.addEventListener("change", (event: Event) => {
			const result = SelectingTheBaseCurrency({ event, plugin: this.plugin })
			if (result instanceof Promise) {
				result.catch(console.error);
			}
		});

		// Selecting the initial year of accounting
		new Setting(containerEl)
			.setName("Initial year of accounting")
			.setDesc("Select the year from which financial accounting has been conducted")
			.addDropdown((drop) => {
				const currentYear = new Date().getFullYear();
				for (let year = currentYear - 100; year <= currentYear; year++) {
					drop.addOption(String(year), String(year));
				}

				drop.setValue(String(this.plugin.settings.startYear));

				drop.onChange(async (value) => {
					try { assertDataAvailable(); } catch (error) { new Notice((error as Error).message); return; }
					this.plugin.settings.startYear = Number(value);
					await this.plugin.saveSettings();
					await generateYearlyFile();
					new Notice(`The starting year has been changed to ${value}`);
				});
			});

		addBackupSettings(containerEl, this.plugin, () => this.display());

// 		new Setting(containerEl)
// 			.setName('Import operation history')
// 			.setDesc('Import CSV into an existing account. Current balances remain unchanged.')
// 			.addButton(button => button.setButtonText('Import CSV').onClick(() => new ImportHistoryModal(this.plugin).open()));

		new Setting(containerEl)
			.setName('Export operation history')
			.setDesc('Export all years and currencies to a CSV file in the vault root, with category and account names and emoji.')
			.addButton(button => button
				.setButtonText('Export CSV')
				.onClick(async () => {
					button.setDisabled(true);
					try {
						const path = await exportHistoryCsv(this.plugin);
						new Notice(`History exported: ${path}`);
					} catch (error) {
						console.error('CSV export failed', error);
						new Notice(`CSV export failed: ${error instanceof Error ? error.message : String(error)}`);
					} finally {
						button.setDisabled(false);
					}
				}));
	}
}

async function SelectingTheBaseCurrency({ event, plugin }: { event: Event; plugin: MainPlugin }): Promise<ResultOfExecution> {
	const target = event.target as HTMLSelectElement;
	const newCurrency = target.value;

	// const bills = await getAdditionalData<BillData>('accounts');
	// if (bills.status === 'error') {
	// 	new Notice(`Error fetching archive bills: ${bills.error.message}`);
	// 	return { status: 'error', error: bills.error };
	// }

	// const generalBalanceBills = bills.jsonData?.filter(
	// 	bill => bill.generalBalance && bill.currency !== newCurrency
	// );

	try {
		// if (generalBalanceBills && generalBalanceBills.length > 0) {
		// 	const bill = generalBalanceBills[0];

		// 	selectEl.value = plugin.settings.baseCurrency;

		// 	new Notice(
		// 		`Cannot change base currency. Bill "${bill.name}" is set to general balance with currency ${bill.currency}. Please change or disable general balance on this bill first.`
		// 	);
		// 	return { status: 'error', error: new Error(`General balance bill "${bill.name}" has currency ${bill.currency}`) };
		// }

		assertDataAvailable();
		plugin.settings.baseCurrency = newCurrency;
		await plugin.saveSettings().catch(console.error);
		new Notice(`Base currency changed to ${newCurrency}`);
		return { status: 'success' };
	} catch (error) {
		console.error("Error changing base currency:", error);
		new Notice(`Error changing base currency: ${error instanceof Error ? error.message : String(error)}`);
		return { status: 'error', error: error instanceof Error ? error : new Error(String(error)) };
	}
}

type State = {
	selectedCurrency: string | null;
	openPageNow: string | null;
	selectedYear: string | null;
	selectedMonth: string | null;
};

const createStateManager = () => {
	let state: State = {
		selectedCurrency: null,
		openPageNow: null,
		selectedYear: null,
		selectedMonth: null,
	};

	return function updateState(newState?: Partial<State>): State {
		if (newState) {
			state = { ...state, ...newState };
		}
		return state;
	};
}

export const stateManager = createStateManager();

function trackActiveFinancialAccountingView(
	app: App,
	onActive: () => void,
	onInactive: () => void
) {
	const check = () => {
		const activeView = app.workspace.getActiveViewOfType(FinancialAccountingView);
		if (activeView) {
			onActive();
		} else {
			onInactive();
		}
	};

	app.workspace.on('active-leaf-change', check);
	app.workspace.on('layout-change', check);

	check();

	return () => {
		app.workspace.off('active-leaf-change', check);
		app.workspace.off('layout-change', check);
	};
}

function waitForMobileNavBar(callback: (el: HTMLElement) => void) {
	const observer = new MutationObserver(() => {
		const el = document.querySelector('.mobile-navbar');
		if (el) {
			callback(el as HTMLElement);
			observer.disconnect();

			document.styleSheets[0].insertRule(
				'.add-button { margin: 0 12px 10px 12px !important; }',
				document.styleSheets[0].cssRules.length
			);
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });
}

export class ConfirmModal extends Modal {
	private resolve!: (result: boolean) => void;

	constructor(app: App, private message: string = "Are you sure?") {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass("confirm-modal");

		contentEl.createEl("h2", { text: this.message });

		const buttonsDiv = contentEl.createEl("div", { cls: "confirm-buttons" });
		const yesBtn = buttonsDiv.createEl("button", { text: "Yes", cls: "btn-yes" });
		const noBtn = buttonsDiv.createEl("button", { text: "No", cls: "btn-no" });

		yesBtn.onclick = () => { this.resolve(true); this.close(); };
		noBtn.onclick = () => { this.resolve(false); this.close(); };
	}

	onClose() {
		this.contentEl.empty();
	}

	openAndWait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
}
