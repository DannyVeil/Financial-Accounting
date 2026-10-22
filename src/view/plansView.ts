import Big from 'big.js';
import { Notice, setIcon } from 'obsidian';
import { PlanData, stateManager } from '../../main';
import { getAdditionalData } from '../controllers/searchData';
import { formatNumbers, SummarizingData } from '../middleware/otherFunc';
import { addPlan } from './addView';
import { editingPlan } from './editingView';

export const showPlans = async (mainContent: HTMLDivElement) => {
	const mainContentBody = mainContent.createEl("div", {
		cls: "main-content-body",
	});

	stateManager({ openPageNow: "Plans" });

	const expensePlan = await getAdditionalData<PlanData>('categories', 'expenditure_plan');
	if (expensePlan.status === 'error') {
		new Notice(expensePlan.error.message)
		console.error(expensePlan.error)
		return
	}

	const incomePlan = await getAdditionalData<PlanData>('categories', 'income_plan');
	if (incomePlan.status === 'error') {
		new Notice(incomePlan.error.message)
		console.error(incomePlan.error)
		return
	}

	const arcivedExpensePlan = expensePlan.jsonData.filter((e: PlanData) => e.archived)
	const arcivedIncomePlan = incomePlan.jsonData.filter((e: PlanData) => e.archived)

	const notArcivedExpensePlan = expensePlan.jsonData.filter((e: PlanData) => !e.archived)
	const notArcivedIncomePlan = incomePlan.jsonData.filter((e: PlanData) => !e.archived)

	const headerPage = mainContentBody.createEl('div', {
		cls: 'header-page'
	})
	headerPage.createEl('h2', {
		text: 'Categories'
	})
	const creatButton = headerPage.createEl('button', {
		cls: 'creat-button',
		attr: { type: 'button', 'aria-label': 'Create category', title: 'Create category' },
	})
	setIcon(creatButton, 'plus')
	creatButton.addEventListener('click', (): void => {
		void addPlan();
	})

	if (!expensePlan.jsonData.length && !incomePlan.jsonData.length) {
		const undefinedContent = mainContentBody.createEl('div', {
			cls: 'undefined-content section-empty'
		})


		undefinedContent.createEl('span', {
			text: '🍕 🎮 👕'
		})

		undefinedContent.createEl('p', {
			text: 'Create your first category to organize income and expenses.'
		})
	} else {
		mainContentBody.removeClass('main-content-body--undefined')



		if (notArcivedExpensePlan.length) {
			const resultExpense = notArcivedExpensePlan.slice().sort((a: PlanData, b: PlanData) => new Big(b.amount).cmp(new Big(a.amount)))
			const expensePlanBlock = mainContentBody.createEl('div', {
				cls: 'plan-block'
			})
			const expenseDateBlock = expensePlanBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = expenseDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Expense'
			})
			const amountBlock = expenseDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingData(resultExpense))),
				cls: 'expense-plan-amount'
			})
			const expenseDataList = expensePlanBlock.createEl('ul', {
				cls: 'data-list'
			})
			resultExpense.forEach((e: PlanData) => {
				const dataItem = expenseDataList.createEl('li', {
					cls: 'data-item',
					attr: {
						'data-id': e.id,
						'data-type': e.type
					}
				})
				dataItem.onclick = (e: MouseEvent) => {
					void editingPlan(e);
				};
				const dataText = dataItem.createEl('div', {
					cls: 'data-link'
				})
				const divEmoji = dataText.createEl('div', {
					cls: 'data-link-emoji'
				})
				const divText = dataText.createEl('div', {
					cls: 'data-link-text'
				})
				divEmoji.createEl('p', {
					text: `${e.emoji}`
				})
				divText.createEl('p', {
					text: `${e.name}`
				})
				dataItem.createEl('p', {
					text: formatNumbers(String(e.amount)),
					cls: 'expense-plan-amount'
				})
			})
		}
		if (arcivedExpensePlan.length) {
			mainContentBody.removeClass('main-content-body--undefined')
			const resultExpense = arcivedExpensePlan.slice().sort((a: PlanData, b: PlanData) => new Big(b.amount).cmp(new Big(a.amount)))
			const expensePlanBlock = mainContentBody.createEl('div', {
				cls: 'plan-block'
			})
			const expenseDateBlock = expensePlanBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = expenseDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Archived expense'
			})
			const amountBlock = expenseDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingData(resultExpense))),
				cls: 'expense-plan-amount'
			})
			const expenseDataList = expensePlanBlock.createEl('ul', {
				cls: 'data-list'
			})
			const showButton = expenseDataList.createEl('li', {
				cls: 'data-item archived-button'
			})
			const showDivEmoji = showButton.createEl('div', {
				cls: 'data-link-emoji'
			})
			const showDivText = showButton.createEl('div', {
				cls: 'data-link-text'
			})
			showDivEmoji.createEl('p', {
				text: '🗃️'
			})
			showDivText.createEl('p', {
				text: `${arcivedExpensePlan.length} archived`,
			})
			showButton.onclick = () => {
				showButton.remove()
				resultExpense.forEach((e: PlanData) => {
					const dataItem = expenseDataList.createEl('li', {
						cls: 'data-item archived-item',
						attr: {
							'data-id': e.id,
							'data-type': e.type
						}
					})
					dataItem.onclick = (e: MouseEvent) => {
						void editingPlan(e);
					};
					const dataText = dataItem.createEl('div', {
						cls: 'data-link'
					})
					const divEmoji = dataText.createEl('div', {
						cls: 'data-link-emoji'
					})
					const divText = dataText.createEl('div', {
						cls: 'data-link-text'
					})
					divEmoji.createEl('p', {
						text: `${e.emoji}`
					})
					divText.createEl('p', {
						text: `${e.name}`
					})
					dataItem.createEl('p', {
						text: formatNumbers(String(e.amount)),
						cls: 'expense-plan-amount'
					})
				})
			}
		}
		if (notArcivedIncomePlan.length) {
			mainContentBody.removeClass('main-content-body--undefined')
			const resultIncome = notArcivedIncomePlan.slice().sort((a: PlanData, b: PlanData) => new Big(b.amount).cmp(new Big(a.amount)))
			const incomePlanBlock = mainContentBody.createEl('div', {
				cls: 'plan-block'
			})
			const incomeDateBlock = incomePlanBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = incomeDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Income'
			})
			const amountBlock = incomeDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingData(resultIncome))),
				cls: 'income-plan-amount'
			})
			const incomeDataList = incomePlanBlock.createEl('ul', {
				cls: 'data-list'
			})
			resultIncome.forEach((e: PlanData) => {
				const dataItem = incomeDataList.createEl('li', {
					cls: 'data-item',
					attr: {
						'data-id': e.id,
						'data-type': e.type
					}
				})
				dataItem.onclick = (e: MouseEvent) => {
					void editingPlan(e);
				};
				const dataText = dataItem.createEl('div', {
					cls: 'data-link'
				})
				const divEmoji = dataText.createEl('div', {
					cls: 'data-link-emoji'
				})
				const divText = dataText.createEl('div', {
					cls: 'data-link-text'
				})
				divEmoji.createEl('p', {
					text: `${e.emoji}`
				})
				divText.createEl('p', {
					text: `${e.name}`
				})
				dataItem.createEl('p', {
					text: formatNumbers(String(e.amount)),
					cls: 'income-plan-amount'
				})
			})
		}
		if (arcivedIncomePlan.length) {
			mainContentBody.removeClass('main-content-body--undefined')
			const resultIncome = arcivedIncomePlan.slice().sort((a: PlanData, b: PlanData) => new Big(b.amount).cmp(new Big(a.amount)))
			const incomePlanBlock = mainContentBody.createEl('div', {
				cls: 'plan-block'
			})
			const incomeDateBlock = incomePlanBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = incomeDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Archived income'
			})
			const amountBlock = incomeDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingData(resultIncome))),
				cls: 'income-plan-amount'
			})
			const incomeDataList = incomePlanBlock.createEl('ul', {
				cls: 'data-list'
			})
			const showButton = incomeDataList.createEl('li', {
				cls: 'data-item archived-button'
			})
			const showDivEmoji = showButton.createEl('div', {
				cls: 'data-link-emoji'
			})
			const showDivText = showButton.createEl('div', {
				cls: 'data-link-text'
			})
			showDivEmoji.createEl('p', {
				text: '🗃️'
			})
			showDivText.createEl('p', {
				text: `${arcivedIncomePlan.length} archived`,
			})
			showButton.onclick = () => {
				showButton.remove()
				resultIncome.forEach((e: PlanData) => {
					const dataItem = incomeDataList.createEl('li', {
						cls: 'data-item archived-item',
						attr: {
							'data-id': e.id,
							'data-type': e.type
						}
					})
					dataItem.onclick = (e: MouseEvent) => {
						void editingPlan(e);
					};
					const dataText = dataItem.createEl('div', {
						cls: 'data-link'
					})
					const divEmoji = dataText.createEl('div', {
						cls: 'data-link-emoji'
					})
					const divText = dataText.createEl('div', {
						cls: 'data-link-text'
					})
					divEmoji.createEl('p', {
						text: `${e.emoji}`
					})
					divText.createEl('p', {
						text: `${e.name}`
					})
					dataItem.createEl('p', {
						text: formatNumbers(String(e.amount)),
						cls: 'income-plan-amount'
					})
				})
			}
		}
	}
}
