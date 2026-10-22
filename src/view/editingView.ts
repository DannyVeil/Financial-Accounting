import { activeCurrency } from '../middleware/otherFunc';
import { attachNoteSuggestions } from './addView';
import { Notice, setIcon } from 'obsidian';
import MainPlugin from '../../main';
import { FinancialAccountingView, ConfirmModal } from '../../main'
import { searchElementById, getAdditionalData, getMainData } from '../controllers/searchData';
import { HistoryData, PlanData, BillData, TransferData, DataItemResult } from '../../main';
import { deleteBill, deletePlan, deleteHistory } from '../controllers/deleteData';
import { editingJsonToHistory, editingJsonToPlan, editingJsonToBill } from '../controllers/editingData';
import { transferBetweenBills } from '../middleware/transferring'
import { generationHistoryContent } from './historyView';
import { fillMonthDates, getCurrencySymbol, formatNumbers } from '../middleware/otherFunc';

export const editingHistory = async (e: MouseEvent, operation?: HistoryData) => {
	if (!(e.target instanceof HTMLElement)) return;

	const li = e.target.closest('li');
	if (!li) return;

	const { id } = li.dataset;
	if (!id) {
		return 'Element not found'
	}

	const expensePlan = await getAdditionalData<PlanData>('categories', 'expenditure_plan')
	if (expensePlan.status === 'error') {
		new Notice(expensePlan.error.message)
		console.error(expensePlan.error)
		return
	}


	const incomePlan = await getAdditionalData<PlanData>('categories', 'income_plan')
	if (incomePlan.status === 'error') {
		new Notice(incomePlan.error.message)
		console.error(incomePlan.error)
		return
	}


	const history: DataItemResult<HistoryData> = operation ? { status: 'success', item: operation } : await searchElementById<HistoryData>(id, 'history') as DataItemResult<HistoryData>;
	if (history.status === 'error') {
		new Notice(history.error.message)
		console.error(history.error)
		return;
	}

	const { contentEl } = FinancialAccountingView.instance;
	contentEl.empty()

	const header = contentEl.createEl('div', {
		cls: 'main-header'
	})
	header.createEl('h1', {
		text: 'Operation'
	})

	const exitButton = contentEl.createEl('div', {
		cls: 'exit-button',
		attr: {
			id: 'exit-button'
		}
	})
	setIcon(exitButton, 'arrow-left')
	exitButton.addEventListener('click', () => {
		FinancialAccountingView.instance.onOpen().catch(console.error)
	})

	const deleteButton = contentEl.createEl('div', {
		cls: 'delete-button',
		attr: {
			id: 'delete-button'
		}
	})
	setIcon(deleteButton, 'trash-2')
	deleteButton.addEventListener('click', () => {
		void deleteHistoryButton(history.item)
	})

	const mainAddForm = contentEl.createEl('form', {
		cls: 'main-add-form',
		attr: {
			id: 'main-add-form'
		}
	})

	// Form input
	const mainFormInput = mainAddForm.createEl('div', {
		cls: 'main-form-input'
	})
	const inputSum = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Sum',
			id: 'input-sum',
			type: 'number',
			value: history.item.amount,
			inputmode: "decimal"
		}
	})

	// inputSum.focus()
	const selectBills = mainFormInput.createEl('select', {
		cls: 'form-selects',
		attr: {
			name: 'select-bills',
			id: 'select-bills'
		}
	})

	const bills = await getAdditionalData<BillData>('accounts');
	if (bills.status === 'error') {
		new Notice(bills.error.message)
		console.error(bills.error)
		return
	}

	// --- Main ---
	if (bills.jsonData.some(i => i.generalBalance === true)) {
		const mainGroup = document.createElement("optgroup");
		mainGroup.label = "Main";

		bills.jsonData.forEach(bill => {
			if (bill.generalBalance) {
				const option = document.createElement("option");
				option.value = bill.id;
				option.textContent = `${bill.emoji} ${bill.name} • ${formatNumbers(bill.balance)} ${getCurrencySymbol(bill.currency)}`;
				mainGroup.appendChild(option);
			}
		})

		selectBills.appendChild(mainGroup);
	}

	// --- Additional ---
	if (bills.jsonData.some(i => i.generalBalance === false)) {
		const additionalGroup = document.createElement("optgroup");
		additionalGroup.label = "Additional";

		bills.jsonData.forEach(bill => {
			if (!bill.generalBalance) {
				const option = document.createElement("option");
				option.value = bill.id;
				option.textContent = `${bill.emoji} ${bill.name} • ${formatNumbers(bill.balance)} ${getCurrencySymbol(bill.currency)}`;
				additionalGroup.appendChild(option);
			}
		})

		selectBills.appendChild(additionalGroup);
	}

	selectBills.value = history.item.bill.id;

	const selectCategory = mainFormInput.createEl('select', {
		cls: 'form-selects',
		attr: {
			name: 'select-category',
			id: 'select-category'
		}
	})
	createOptionCategory()

	function createOptionCategory() {
		if (history.status === 'error') {
			new Notice(history.error.message)
			console.error(history.error)
			return;
		}

		if (history.item.type === 'expense') {
			selectCategory.empty()
			if (expensePlan.status === 'error') return new Notice(expensePlan.error.message)
			expensePlan.jsonData.sort((a, b) => Number(b.amount) - Number(a.amount))
			const categories = expensePlan.jsonData.filter(plan => !plan.archived)
			categories.forEach(plan => {
				if (plan.id === history.item.category.id) {
					selectCategory.createEl('option', {
						text: `${plan.emoji} ${plan.name} • ${formatNumbers(plan.amount.toString())} ${getCurrencySymbol(activeCurrency())}`,
						attr: { value: plan.id, selected: 'selected' }
					})
					return
				}
				selectCategory.createEl('option', {
					text: `${plan.emoji} ${plan.name} • ${formatNumbers(plan.amount.toString())} ${getCurrencySymbol(activeCurrency())}`,
					attr: { value: plan.id }
				})
			})
		} else if (history.item.type === 'income') {
			selectCategory.empty()
			if (incomePlan.status === 'error') return new Notice(incomePlan.error.message)
			incomePlan.jsonData.sort((a, b) => Number(b.amount) - Number(a.amount))
			const categories = incomePlan.jsonData.filter(plan => !plan.archived)
			categories.forEach(plan => {
				if (plan.id === history.item.category.id) {
					selectCategory.createEl('option', {
						text: `${plan.emoji} ${plan.name} • ${formatNumbers(plan.amount.toString())} ${getCurrencySymbol(activeCurrency())}`,
						attr: { value: plan.id, selected: 'selected' }
					})
					return
				}
				selectCategory.createEl('option', {
					text: `${plan.emoji} ${plan.name} • ${formatNumbers(plan.amount.toString())} ${getCurrencySymbol(activeCurrency())}`,
					attr: { value: plan.id }
				})
			})
		} else {
			return 'Error category type'
		}
	}

	const commentInput = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Note',
			id: 'input-comment',
			type: 'text',
			value: history.item.comment ?? '',
		}
	})

	attachNoteSuggestions(mainFormInput, commentInput, selectCategory, () => history.item.type);

	const selectDate = mainFormInput.createEl('select', {
		cls: 'form-selects',
		attr: {
			name: 'select-date',
			id: 'select-date'
		}
	})
	fillMonthDates(selectDate, history.item.date)
	selectDate.value = history.item.date.split('T')[0]

	// const selectDateButtonDiv = mainFormInput.createEl('div', {
	//     cls: 'form-selects-date-buttons'
	// })

	// const selectDateToday = selectDateButtonDiv.createEl('button', {
	//     text: 'Today',
	//     attr: {
	//         type: 'button'
	//     }
	// })
	// selectDateToday.addClass('button-selects-date--active')
	// selectDateToday.addEventListener('click', () => {
	//     selectRelativeDate(selectDate, 0)
	// })
	// const selectDateYesterday = selectDateButtonDiv.createEl('button', {
	//     text: 'Yesterday',
	//     attr: {
	//         type: 'button'
	//     }
	// })
	// selectDateYesterday.addEventListener('click', () => {
	//     selectRelativeDate(selectDate, -1)
	// })
	// const selectDateTheDayBefotreYesterday = selectDateButtonDiv.createEl('button', {
	//     text: 'The day before yesterday',
	//     attr: {
	//         type: 'button'
	//     }    
	// })
	// selectDateTheDayBefotreYesterday.addEventListener('click', () => {
	//     selectRelativeDate(selectDate, -2)
	// })

	const addButton = mainFormInput.createEl('button', {
		text: 'Safe',
		cls: 'add-button',
		attr: {
			type: 'submit'
		}
	})

	addButton.addEventListener('click', (e) => {
		e.preventDefault();

		if (!(Number(inputSum.value) > 0)) {
			inputSum.focus()
			new Notice('Enter the amount')
			return
		}

		if (!selectDate.value) {
			new Notice('Select a date');
			return
		}

		const data: HistoryData = {
			id: history.item.id,
			amount: String(inputSum.value),
			bill: {
				id: selectBills.value
			},
			category: {
				id: selectCategory.value
			},
			comment: commentInput.value,
			date: selectDate.value + (history.item.date.includes('T') ? 'T' + history.item.date.split('T')[1] : ''),
			type: history.item.type,
		}

		void editingHistoryButton(data, history.item, selectBills)
	})
}

async function deleteHistoryButton(history: HistoryData): Promise<void> {
	const redultOfDelete = await deleteHistory(history);
	if (redultOfDelete.status === "success") {
		setTimeout(() => {
			FinancialAccountingView.instance.onOpen().catch(console.error)
			new Notice('The operation is remote.')
		}, 100)
	} else {
		new Notice(redultOfDelete.error.message)
		console.error(redultOfDelete.error)
	}
}

async function editingHistoryButton(data: HistoryData, oldData: HistoryData, selectBills: HTMLSelectElement): Promise<void> {
	const billOption = await searchElementById<BillData>(selectBills.value, 'accounts');
	if (billOption.status === 'error') {
		new Notice(billOption.error.message)
		console.error(billOption.error)
		return
	}
	data.currency = billOption.item.currency;

	const resultOfEditing = await editingJsonToHistory(data, oldData)
	if (resultOfEditing.status === "success") {
		setTimeout(() => {
			FinancialAccountingView.instance.onOpen().catch(console.error)
			new Notice('Operation changed')
		}, 100)
	} else {
		new Notice(resultOfEditing.error.message)
		console.error(resultOfEditing.error)
	}
}

export const editingPlan = async (e: MouseEvent) => {
	if (!(e.target instanceof HTMLElement)) return;

	const li = e.target.closest('li');
	if (!li) return;

	if (!li.dataset.id || !li.dataset.type) {
		throw new Error("Missing id or type in dataset");
	}

	const id = li.dataset.id;
	const type = li.dataset.type as "expense" | "income";

	if (!id) {
		return 'Element not found'
	}

	const sourceMap = {
		expense: () => getAdditionalData<PlanData>('categories', 'expenditure_plan'),
		income: () => getAdditionalData<PlanData>('categories', 'income_plan')
	} as const;

	const loader = sourceMap[type];
	if (!loader) return { status: 'error', error: new Error('Element not found') };

	const result = await loader();
	if (result.status === 'error') {
		new Notice(result.error.message)
		console.error(result.error)
		return
	}

	const plan = result.jsonData.find((item: PlanData) => item.id === id);
	if (!plan) {
		new Notice('Plan not found')
		return
	}

	const { contentEl } = FinancialAccountingView.instance;
	contentEl.empty()

	const exitButton = contentEl.createEl('div', {
		cls: 'exit-button',
		attr: {
			id: 'exit-button'
		}
	})
	setIcon(exitButton, 'arrow-left')
	exitButton.addEventListener('click', () => {
		FinancialAccountingView.instance.onOpen().catch(console.error)
	})

	const deleteButton = contentEl.createEl('div', {
		cls: 'delete-button',
		attr: {
			id: 'delete-button'
		}
	})
	setIcon(deleteButton, 'trash-2')
	deleteButton.addEventListener('click', () => {
		void deletePlanButton(plan)
	})

	const header = contentEl.createEl('div', {
		cls: 'main-header'
	})
	header.createEl('h1', {
		text: 'Categories'
	})

	const mainAddForm = contentEl.createEl('form', {
		cls: 'main-add-form',
		attr: {
			id: 'main-add-form'
		}
	})

	// Form input
	const mainFormInput = mainAddForm.createEl('div', {
		cls: 'main-form-input'
	})
	const inputName = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Name',
			id: 'input-name',
			type: 'text',
			value: plan.name,
		}
	})

	const inputEmoji = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Emoji',
			id: 'input-emoji',
			type: 'text',
			value: plan.emoji ?? ''
		}
	})
	inputEmoji.addEventListener('input', () => {
		const value = inputEmoji.value;
		const chars = Array.from(value);
		const emojiOnly = chars.filter(ch =>
			/\p{Extended_Pictographic}/u.test(ch)
		);
		inputEmoji.value = emojiOnly.slice(0, 1).join('');
	});

	/* Parent category selection is disabled.
	const parentSelect = mainFormInput.createEl('select', {
		cls: 'form-selects',
		attr: {
			name: 'select-parent',
			id: 'select-parent'
		}
	})
	await selectParent();

	async function selectParent() {
		if (type === 'expense') {
			parentSelect.empty()

			const expensePlan = await getAdditionalData<PlanData>('categories', 'expenditure_plan')
			if (expensePlan.status === 'error') {
				new Notice(expensePlan.error.message)
				console.error(expensePlan.error)
				return
			}
			if (expensePlan.jsonData.length === 0) return new Notice('Add a expenditure plan')

			parentSelect.createEl('option', {
				text: 'Do not specify a parent',
				attr: {
					value: null,
				},
			})

			const categories = expensePlan.jsonData.filter(plan => !plan.archived)
			categories.forEach(plan => {
				parentSelect.createEl('option', {
					text: `${plan.emoji} ${plan.name}`,
					attr: {
						value: plan.id
					}
				})
			})

		} else if (type === 'income') {
			parentSelect.empty()

			const incomePlan = await getAdditionalData<PlanData>('categories', 'income_plan')
			if (incomePlan.status === 'error') {
				new Notice(incomePlan.error.message)
				console.error(incomePlan.error)
				return
			}
			if (incomePlan.jsonData.length === 0) return new Notice('Add a income plan')

			parentSelect.createEl('option', {
				text: 'Do not specify a parent',
				attr: {
					value: null,
				},
			})

			if (incomePlan && incomePlan.status === 'success') {
				const categories = incomePlan.jsonData.filter(plan => !plan.archived)
				categories.forEach(plan => {
					parentSelect.createEl('option', {
						text: `${plan.emoji} ${plan.name}`,
						attr: {
							value: plan.id
						}
					})
				})
			}
		} else {
			return 'Error category type'
		}
	}

	*/
	const commentInput = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Note',
			id: 'input-comment',
			type: 'text',
			value: plan.comment ?? '',
		}
	})

	const archiveButtonDiv = mainFormInput.createEl('div', {
		cls: 'form-archive-div'
	})
	setIcon(archiveButtonDiv, plan.archived ? 'archive-x' : 'archive')
	archiveButtonDiv.createEl('span', {
		text: plan.archived ? 'Unarchive' : 'Archive',
	})
	archiveButtonDiv.addEventListener('click', () => {
		const handleArchive = async () => {
			const modal = new ConfirmModal(MainPlugin.instance.app, `Are you sure you want to ${plan.archived ? 'unarchive' : 'archive'} ${plan.emoji} • ${plan.name}?`);

			const result = await modal.openAndWait();
			if (!result) return;

			const data: PlanData = {
				id: plan.id,
				name: inputName.value.trim(),
				emoji: inputEmoji.value,
				amount: plan.amount,
				// parentId: parentSelect.value,
				comment: commentInput.value.trim(),
				type: plan.type,
				archived: !plan.archived,
			};

			void editingPlanButton(data);
		};

		handleArchive().catch(console.error);
	});

	const addButton = mainFormInput.createEl('button', {
		text: 'Add',
		cls: 'add-button',
		attr: {
			type: 'submit'
		}
	})

	addButton.addEventListener('click', (e) => {
		e.preventDefault();

		if (!inputName.value) {
			inputName.focus()
			new Notice('Enter the name')
			return
		}

		if (!inputEmoji.value) {
			inputEmoji.focus()
			new Notice('Enter the emoji')
			return
		}

		const data: PlanData = {
			id: plan.id,
			name: inputName.value.trim(),
			emoji: inputEmoji.value,
			amount: plan.amount,
			// parentId: parentSelect.value,
			comment: commentInput.value.trim(),
			type: plan.type,
			archived: plan.archived,
		}

		void editingPlanButton(data)
	})

	const history = await getMainData();
	if (history.status === 'error') {
		new Notice(history.error.message)
		console.error(history.error)
		return
	}
	const filteredHistory = history.jsonData.filter(
		item => item.category.id === plan.id
	);
	if (filteredHistory.length !== 0) {
		contentEl.createEl('h1', {
			text: 'History of the plan'
		})

		const historyPlan = contentEl.createEl('div', {
			cls: 'history-item'
		})

		void generationHistoryContent(historyPlan, { status: 'success', jsonData: filteredHistory })
	}
}

async function deletePlanButton(plan: PlanData): Promise<void> {
	const redultOfDelete = await deletePlan(plan);
	if (redultOfDelete.status === "success") {
		setTimeout(() => {
			FinancialAccountingView.instance.onOpen().catch(console.error)
			new Notice(`${plan.emoji} • ${plan.name} has been removed.`)
		}, 100)
	} else {
		new Notice(redultOfDelete.error.message)
		console.error(redultOfDelete.error)
	}
}

async function editingPlanButton(data: PlanData): Promise<void> {
	const resultOfadd = await editingJsonToPlan(data)
	if (resultOfadd.status === "success") {
		setTimeout(() => {
			FinancialAccountingView.instance.onOpen().catch(console.error)
			new Notice(`${data.emoji} • ${data.name} has been edited.`)
		}, 100)
	} else {
		new Notice(resultOfadd.error.message)
		console.error(resultOfadd.error)
	}
}

export const editingBill = async (e: MouseEvent) => {
	if (!(e.target instanceof HTMLElement)) return;

	const li = e.target.closest('li');
	if (!li) return;

	const { id } = li.dataset;

	if (!id) {
		return 'Element not found'
	}

	const bill = await searchElementById<BillData>(id, 'accounts')
	if (bill.status === 'error') {
		new Notice(bill.error.message)
		console.error(bill.error)
		return
	}

	const { contentEl } = FinancialAccountingView.instance
	contentEl.empty()

	const exitButton = contentEl.createEl('div', {
		cls: 'exit-button',
		attr: {
			id: 'exit-button'
		}
	});
	setIcon(exitButton, 'arrow-left')
	exitButton.addEventListener('click', () => {
		FinancialAccountingView.instance.onOpen().catch(console.error)
	})

	const deleteButton = contentEl.createEl('div', {
		cls: 'delete-button',
		attr: {
			id: 'delete-button'
		}
	})
	setIcon(deleteButton, 'trash-2')
	deleteButton.addEventListener('click', () => {
		void deleteBillButton(bill.item)
	})

	const header = contentEl.createEl('div', {
		cls: 'main-header'
	})
	header.createEl('h1', {
		text: 'Categories'
	})
	const mainAddForm = contentEl.createEl('form', {
		cls: 'main-add-form',
		attr: {
			id: 'main-add-form'
		}
	})

	// Form input
	const mainFormInput = mainAddForm.createEl('div', {
		cls: 'main-form-input'
	})
	const inputName = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Name',
			id: 'input-name',
			type: 'text',
			value: bill.item.name,
		}
	})

	const inputEmoji = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Emoji',
			id: 'input-emoji',
			type: 'text',
			value: bill.item.emoji ?? ''
		}
	})
	inputEmoji.addEventListener('input', () => {
		const value = inputEmoji.value;
		const chars = Array.from(value);
		const emojiOnly = chars.filter(ch =>
			/\p{Extended_Pictographic}/u.test(ch)
		);
		inputEmoji.value = emojiOnly.slice(0, 1).join('');
	});

	const currentBalance = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Current balance',
			id: 'input-current-balance',
			type: 'number',
			value: bill.item.balance,
			inputmode: "decimal"
		}
	})

	const commentInput = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Note',
			id: 'input-comment',
			type: 'text',
			value: bill.item.comment ?? '',
		}
	})

	const chechboxDiv = mainFormInput.createEl('div', {
		cls: 'form-checkbox-div'
	})



	const checkboxInput = chechboxDiv.createEl('input', {
		cls: 'form-checkbox',
		attr: {
			id: 'input-checkbox',
			type: 'checkbox',
			checked: bill.item.generalBalance ? 'checked' : null,
		}
	})
	chechboxDiv.createEl('span', {
		text: 'Take into account in the general balance',
		cls: 'form-text',
	})

	const archiveButtonDiv = mainFormInput.createEl('div', {
		cls: 'form-archive-div'
	})
	setIcon(archiveButtonDiv, bill.item.archived ? 'archive-x' : 'archive')
	archiveButtonDiv.createEl('span', {
		text: bill.item.archived ? 'Unarchive' : 'Archive',
	})
	archiveButtonDiv.addEventListener('click', () => {
		const handleArchive = async () => {
			const modal = new ConfirmModal(MainPlugin.instance.app, `Are you sure you want to ${bill.item.archived ? 'unarchive' : 'archive'} ${bill.item.emoji} • ${bill.item.name}?`);
			const result = await modal.openAndWait();
			if (!result) return;
			const data: BillData = {
				id: bill.item.id,
				name: inputName.value.trim(),
				emoji: inputEmoji.value,
				balance: String(currentBalance.value.trim()),
				currency: bill.item.currency,
				generalBalance: checkboxInput.checked,
				comment: commentInput.value.trim(),
				archived: !bill.item.archived,
			};

			void editingBillButton(data);
		};

		handleArchive().catch(console.error);
	});

	const addButton = mainFormInput.createEl('button', {
		text: 'Add',
		cls: 'add-button',
		attr: {
			type: 'submit'
		}
	})
	addButton.addEventListener('click', () => {
		e.preventDefault();

		if (!inputName.value) {
			inputName.focus()
			new Notice('Enter the name')
			return
		}

		if (!inputEmoji.value) {
			inputEmoji.focus()
			new Notice('Enter the emoji')
			return
		}

		const data: BillData = {
			id: bill.item.id,
			name: inputName.value.trim(),
			emoji: inputEmoji.value,
			balance: String(currentBalance.value.trim()),
			currency: bill.item.currency,
			generalBalance: checkboxInput.checked,
			comment: commentInput.value.trim(),
			archived: bill.item.archived,
		}

		void editingBillButton(data)
	})

	const history = await getMainData();
	if (history.status === 'error') {
		new Notice(history.error.message)
		console.error(history.error)
		return
	}
	const filteredHistory = history.jsonData.filter(
		item => item.bill.id === bill.item.id
	);
	if (filteredHistory.length !== 0) {
		contentEl.createEl('h1', {
			text: 'History of the bill'
		})

		const historyBill = contentEl.createEl('div', {
			cls: 'history-item'
		})

		void generationHistoryContent(historyBill, { status: 'success', jsonData: filteredHistory })
	}
}

async function deleteBillButton(bill: BillData): Promise<void> {
	const redultOfDelete = await deleteBill(bill);
	if (redultOfDelete.status === "success") {
		setTimeout(() => {
			FinancialAccountingView.instance.onOpen().catch(console.error)
			new Notice(`${bill.emoji} • ${bill.name} has been removed.`)
		}, 100)
	} else {
		new Notice(redultOfDelete.error.message)
		console.error(redultOfDelete.error)
	}
}

async function editingBillButton(data: BillData): Promise<void> {
	const resultOfadd = await editingJsonToBill(data)
	if (resultOfadd.status === "success") {
		setTimeout(() => {
			FinancialAccountingView.instance.onOpen().catch(console.error)
			new Notice(`${data.emoji} • ${data.name} has been edited.`)
		}, 100)
	} else {
		new Notice(resultOfadd.error.message)
		console.error(resultOfadd.error)
	}
}

export const transferBetweenBillsView = async (billId: string, container?: HTMLDivElement) => {

	const bills = await getAdditionalData<BillData>('accounts', undefined, true)
	if (bills.status === 'error') {
		new Notice(bills.error.message)
		console.error(bills.error)
		return
	}
	if (!bills.jsonData) return 'Bill is null or undifined'
	if (bills.jsonData.filter(b => !b.archived).length < 2) {
		if (container) container.createEl('p', { text: 'Create at least two accounts to make a transfer.' });
		return;
	}
	bills.jsonData.splice(0, bills.jsonData.length, ...bills.jsonData.filter(b => !b.archived));

	const contentEl = container ?? FinancialAccountingView.instance.contentEl;
	if (!container) {
	contentEl.empty()

	const exitButton = contentEl.createEl('div', {
		cls: 'exit-button',
		attr: {
			id: 'exit-button'
		}
	});
	setIcon(exitButton, 'arrow-left')
	exitButton.addEventListener('click', () => {
		FinancialAccountingView.instance.onOpen().catch(console.error)
	})

	const header = contentEl.createEl('div', {
		cls: 'main-header'
	})
	header.createEl('h1', {
		text: 'Transfer'
	})

	}
	const mainAddForm = container ?? contentEl.createEl('form', {
		cls: 'main-add-form',
		attr: {
			id: 'main-add-form'
		}
	})

	// Form input
	const mainFormInput = mainAddForm.createEl('div', {
		cls: 'main-form-input'
	})

	const selectFromBill = mainFormInput.createEl('select', {
		cls: 'form-selects',
		attr: {
			name: 'select-from-bill',
			id: 'select-from-bill'
		}
	})

	// --- Main ---
	if (bills.jsonData.some(i => i.generalBalance === true)) {
		const fromBillMainGroup = document.createElement("optgroup");
		fromBillMainGroup.label = "Main";

		bills.jsonData.forEach(bill => {
			if (bill.generalBalance) {
				const option = document.createElement("option");
				option.value = bill.id;
				option.textContent = `${bill.name} • ${bill.balance} ${getCurrencySymbol(bill.currency)}`;
				option.dataset.currency = bill.currency;
				fromBillMainGroup.appendChild(option);
			}
		})

		selectFromBill.appendChild(fromBillMainGroup);
	}

	// --- Additional ---
	if (bills.jsonData.some(i => i.generalBalance === false)) {
		const fromBillAdditionalGroup = document.createElement("optgroup");
		fromBillAdditionalGroup.label = "Additional";

		bills.jsonData.forEach(bill => {
			if (!bill.generalBalance) {
				const option = document.createElement("option");
				option.value = bill.id;
				option.textContent = `${bill.name} • ${bill.balance} ${getCurrencySymbol(bill.currency)}`;
				option.dataset.currency = bill.currency;
				fromBillAdditionalGroup.appendChild(option);
			}
		})

		selectFromBill.appendChild(fromBillAdditionalGroup);
	}
	selectFromBill.value = billId;

	const sourceAmount = mainFormInput.createEl('input', {
		cls: 'form-inputs disable-element',
		attr: {
			placeholder: 'Source amount',
			id: 'input-source-amount',
			type: 'number',
			inputmode: "decimal",
		}
	})

	const selectToBill = mainFormInput.createEl('select', {
		cls: 'form-selects',
		attr: {
			name: 'select-to-bill',
			id: 'select-to-bill'
		}
	})
	selectToBill.createEl('option', {
		text: 'Select an account',
		attr: {
			value: '',
			selected: '',
			disabled: '',
			hidden: '',
		},
	})

	// --- Main ---
	if (bills.jsonData.some(i => i.generalBalance === true)) {
		const toBillmainGroup = document.createElement("optgroup");
		toBillmainGroup.label = "Main";

		bills.jsonData.forEach(bill => {
			if (bill.generalBalance) {
				const option = document.createElement("option");
				option.value = bill.id;
				option.textContent = `${bill.name} • ${bill.balance} ${getCurrencySymbol(bill.currency)}`;
				option.dataset.currency = bill.currency;
				toBillmainGroup.appendChild(option);
			}
		})

		selectToBill.appendChild(toBillmainGroup);
	}

	// --- Additional ---
	if (bills.jsonData.some(i => i.generalBalance === false)) {
		const toBilladditionalGroup = document.createElement("optgroup");
		toBilladditionalGroup.label = "Additional";

		bills.jsonData.forEach(bill => {
			if (!bill.generalBalance) {
				const option = document.createElement("option");
				option.value = bill.id;
				option.textContent = `${bill.name} • ${bill.balance} ${getCurrencySymbol(bill.currency)}`;
				option.dataset.currency = bill.currency;
				toBilladditionalGroup.appendChild(option);
			}
		})

		selectToBill.appendChild(toBilladditionalGroup);
	}

	const targetAmount = mainFormInput.createEl('input', {
		cls: 'form-inputs disable-element',
		attr: {
			placeholder: 'Target amount',
			id: 'input-target-amount',
			type: 'number',
			inputmode: "decimal",
		}
	})


	const inputSum = mainFormInput.createEl('input', {
		cls: 'form-inputs',
		attr: {
			placeholder: 'Sum',
			id: 'input-sum',
			type: 'number',
			inputmode: "decimal"
		}
	})

	selectFromBill.addEventListener('change', () => {
		const selectedOptionFrom = selectFromBill.options[selectFromBill.selectedIndex];
		const selectedOptionTo = selectToBill.options[selectToBill.selectedIndex];

		if (selectedOptionTo.value === '') {
			sourceAmount.classList.add('disable-element')
			targetAmount.classList.add('disable-element')
			inputSum.classList.remove('disable-element')
			return
		}

		if (selectedOptionFrom.dataset.currency === selectedOptionTo.dataset.currency) {
			sourceAmount.classList.add('disable-element')
			targetAmount.classList.add('disable-element')
			inputSum.classList.remove('disable-element')
		} else {
			sourceAmount.classList.remove('disable-element')
			targetAmount.classList.remove('disable-element')
			inputSum.classList.add('disable-element')
		}
	})
	selectToBill.addEventListener('change', () => {
		const selectedOptionFrom = selectFromBill.options[selectFromBill.selectedIndex];
		const selectedOptionTo = selectToBill.options[selectToBill.selectedIndex];

		if (selectedOptionTo.dataset.currency === selectedOptionFrom.dataset.currency) {
			sourceAmount.classList.add('disable-element')
			targetAmount.classList.add('disable-element')
			inputSum.classList.remove('disable-element')
		} else {
			sourceAmount.classList.remove('disable-element')
			targetAmount.classList.remove('disable-element')
			inputSum.classList.add('disable-element')
		}
	})

	const addButton = mainFormInput.createEl('button', {
		text: 'Transfer',
		cls: 'add-button',
		attr: {
			type: 'submit'
		}
	})
	addButton.addEventListener('click', (e) => {
		e.preventDefault();

		if (!selectToBill.value) {
			new Notice('Select an account');
			return
		}

		const fromOption = selectFromBill.options[selectFromBill.selectedIndex];
		const toOption = selectToBill.options[selectToBill.selectedIndex];

		const isSameCurrency =
			fromOption.dataset.currency === toOption.dataset.currency;

		let transferData: TransferData;

		if (isSameCurrency) {
			if (!inputSum.value) {
				inputSum.focus();
				new Notice('Enter the amount');
				return
			}

			transferData = {
				type: 'same-currency',
				fromBillId: selectFromBill.value,
				toBillId: selectToBill.value,
				amount: inputSum.value,
			};
		} else {
			if (!sourceAmount.value || !targetAmount.value) {
				(!sourceAmount.value ? sourceAmount : targetAmount).focus();
				new Notice('Enter both amounts');
				return
			}

			transferData = {
				type: 'cross-currency',
				fromBillId: selectFromBill.value,
				toBillId: selectToBill.value,
				sourceAmount: sourceAmount.value,
				targetAmount: targetAmount.value,
			};
		}

		void transferBetweenBillsButton(transferData)
	});
}

async function transferBetweenBillsButton(transferData: TransferData): Promise<void> {
	const result = await transferBetweenBills(transferData);

	if (result.status === 'success') {
		setTimeout(() => {
			FinancialAccountingView.instance.onOpen().catch(console.error);
			new Notice('Transfer completed');
		}, 100);
	} else {
		new Notice(result.error.message);
		console.error(result.error)
	}
}
