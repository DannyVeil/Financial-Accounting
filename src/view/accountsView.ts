import { Notice, setIcon } from 'obsidian';
import { BillData, stateManager } from '../../main';
import { getAdditionalData } from '../controllers/searchData';
import {
    formatNumbers,
    getCurrencySymbol,
    SummarizingDataForTheFalseBills,
    SummarizingDataForTheTrueBills,
} from '../middleware/otherFunc';
import { addBills } from './addView';
import { editingBill } from './editingView';

export const showBills = async (mainContent: HTMLDivElement) => {
	const mainContentBody = mainContent.createEl("div", {
		cls: "main-content-body",
	});

	stateManager({ openPageNow: "Bills" });
	const bills = await getAdditionalData<BillData>('accounts');
	if (bills.status === 'error') {
		new Notice(bills.error.message)
		console.error(bills.error)
		return
	}

	const notArcivedMainBills = bills.jsonData.filter((e: BillData) => !e.archived && e.generalBalance)
	const notArcivedAdditionalBills = bills.jsonData.filter((e: BillData) => !e.archived && !e.generalBalance)
	const arcivedMainBills = bills.jsonData.filter((e: BillData) => e.archived && e.generalBalance)
	const arcivedAdditionalBills = bills.jsonData.filter((e: BillData) => e.archived && !e.generalBalance)

	const headerPage = mainContentBody.createEl('div', {
		cls: 'header-page'
	})
	headerPage.createEl('h2', {
		text: 'Accounts'
	})
	const creatButton = headerPage.createEl('button', {
		cls: 'creat-button',
		attr: { type: 'button', 'aria-label': 'Create account', title: 'Create account' },
	})
	setIcon(creatButton, 'plus')
	creatButton.addEventListener('click', (): void => {
		void addBills();
	})

	if (!bills.jsonData.length) {
		const undefinedContent = mainContentBody.createEl('div', {
			cls: 'undefined-content section-empty'
		})


		undefinedContent.createEl('span', {
			text: '💳🏦👛'
		})

		undefinedContent.createEl('p', {
			text: 'No accounts in this currency yet. Create an account to get started.'
		})
	} else {
		mainContentBody.removeClass('main-content-body--undefined')



		if (notArcivedMainBills.length >= 1) {

			const trueBillBlock = mainContentBody.createEl('div', {
				cls: 'bill-block'
			})
			const trueDateBlock = trueBillBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = trueDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Main'
			})
			const amountBlock = trueDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingDataForTheTrueBills(notArcivedMainBills)))
			})
			const trueDataList = trueBillBlock.createEl('ul', {
				cls: 'data-list'
			})

			notArcivedMainBills.forEach((e: BillData) => {
				const dataItem = trueDataList.createEl('li', {
					cls: 'data-item',
					attr: {
						'data-id': e.id
					}
				})
				dataItem.onclick = async (e: MouseEvent) => {
					await editingBill(e);
				}
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
					text: `${formatNumbers(String(e.balance))} ${getCurrencySymbol(e.currency)}`
				})
			})
		}

		if (arcivedMainBills.length >= 1) {
			mainContentBody.removeClass('main-content-body--undefined')
			const trueBillBlock = mainContentBody.createEl('div', {
				cls: 'bill-block'
			})
			const trueDateBlock = trueBillBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = trueDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Archived main'
			})
			const amountBlock = trueDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingDataForTheTrueBills(arcivedMainBills)))
			})
			const trueDataList = trueBillBlock.createEl('ul', {
				cls: 'data-list'
			})

			const showButton = trueDataList.createEl('li', {
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
				text: `${arcivedMainBills.length} archived`,
			})

			showButton.onclick = () => {
				showButton.remove()
				arcivedMainBills.forEach((e: BillData) => {
					const dataItem = trueDataList.createEl('li', {
						cls: 'data-item archived-item',
						attr: {
							'data-id': e.id
						}
					})
					dataItem.onclick = async (e: MouseEvent) => {
						await editingBill(e);
					}
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
						text: `${formatNumbers(String(e.balance))} ${getCurrencySymbol(e.currency)}`
					})
				})
			}
		}

		if (notArcivedAdditionalBills.length >= 1) {
			mainContentBody.removeClass('main-content-body--undefined')
			const falseBillBlock = mainContentBody.createEl('div', {
				cls: 'bill-block'
			})
			const falseDateBlock = falseBillBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = falseDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Additional'
			})
			const amountBlock = falseDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingDataForTheFalseBills(notArcivedAdditionalBills)))
			})
			const falseDataList = falseBillBlock.createEl('ul', {
				cls: 'data-list'
			})

			notArcivedAdditionalBills.forEach((e: BillData) => {
				const dataItem = falseDataList.createEl('li', {
					cls: 'data-item',
					attr: {
						'data-id': e.id
					}
				})
				dataItem.onclick = async (e: MouseEvent) => {
					await editingBill(e);
				}
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
					text: `${formatNumbers(String(e.balance))} ${getCurrencySymbol(e.currency)}`
				})
			})
		}

		if (arcivedAdditionalBills.length >= 1) {
			mainContentBody.removeClass('main-content-body--undefined')
			const trueBillBlock = mainContentBody.createEl('div', {
				cls: 'bill-block'
			})
			const trueDateBlock = trueBillBlock.createEl('div', {
				cls: 'header-block'
			})
			const typeBlock = trueDateBlock.createEl('div', {
				cls: 'header-type-block'
			})
			typeBlock.createEl('span', {
				text: 'Archived main'
			})
			const amountBlock = trueDateBlock.createEl('div', {
				cls: 'header-amount-block'
			})
			amountBlock.createEl('span', {
				text: formatNumbers(String(SummarizingDataForTheTrueBills(arcivedAdditionalBills)))
			})
			const trueDataList = trueBillBlock.createEl('ul', {
				cls: 'data-list'
			})

			const showButton = trueDataList.createEl('li', {
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
				text: `${arcivedMainBills.length} archived`,
			})

			showButton.onclick = () => {
				showButton.remove()
				arcivedAdditionalBills.forEach((e: BillData) => {
					const dataItem = trueDataList.createEl('li', {
						cls: 'data-item archived-item',
						attr: {
							'data-id': e.id
						}
					})
					dataItem.onclick = async (e: MouseEvent) => {
						await editingBill(e);
					}
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
						text: `${formatNumbers(String(e.balance))} ${getCurrencySymbol(e.currency)}`
					})
				})
			}
		}
	}
}
