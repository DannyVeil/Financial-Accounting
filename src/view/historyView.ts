import { Notice } from 'obsidian';
import { DataFileResult, HistoryData, stateManager } from '../../main';
import { filterHistory, getHistoryMetadata, getMainData, HistoryMetadata } from '../controllers/searchData';
import {
    checkExpenceOrIncome,
    getCurrencySymbol,
    humanizeDate,
    SummarizingDataForTheDay,
} from '../middleware/otherFunc';
import { editingHistory } from './editingView';

export const showHistory = async (mainContent: HTMLDivElement) => {
    stateManager({ openPageNow: "History" });

    const mainContentBody = mainContent.createEl("div", {
        cls: "main-content-body",
    });

    const [history, metadata] = await Promise.all([getMainData(), getHistoryMetadata()]);
    if (history.status === 'error') {
        new Notice(history.error.message)
        console.error(history.error)
        return
    }
    if (metadata.status === 'error') {
        new Notice(metadata.error.message);
        console.error(metadata.error);
        return;
    }

    if (!history.jsonData.length) {
        const undefinedContent = mainContentBody.createEl('div', {
            cls: 'undefined-content'
        })
        mainContentBody.addClass('main-content-body--undefined')

        undefinedContent.createEl('span', {
            text: '🍕 🎮 👕'
        })

        undefinedContent.createEl('p', {
            text: 'Enter any income and expenses to see how much money is actually left.'
        })
    } else {
        mainContentBody.removeClass('main-content-body--undefined')
        const searchInput = mainContentBody.createEl('input', {
            cls: 'input-search',
            attr: {
                id: 'input-search',
                type: 'search',
                placeholder: "Search by operations"
            }
        })
        searchInput.addEventListener('input', () => {
            const query = searchInput.value;
            void renderHistoryResults(historyContent, () => Promise.resolve({
                status: 'success', jsonData: filterHistory(history.jsonData, query, metadata.json),
            }), metadata.json);
        });
    }
    const historyContent = mainContentBody.createEl('div', {
        cls: 'history-content'
    })

    if (history.jsonData.length) {
        await renderHistoryResults(historyContent, () => Promise.resolve(history), metadata.json);
    }
}

const historyRenderVersions = new WeakMap<HTMLDivElement, number>();

async function renderHistoryResults(historyContent: HTMLDivElement, loadHistory: () => Promise<DataFileResult<HistoryData>>, metadata: HistoryMetadata) {
    const version = (historyRenderVersions.get(historyContent) ?? 0) + 1;
    historyRenderVersions.set(historyContent, version);
    const isCurrent = () => historyRenderVersions.get(historyContent) === version;
    historyContent.empty();
    historyContent.removeClass('main-content-body--undefined');
    historyContent.setAttribute('aria-busy', 'true');
    try {
        const result = await loadHistory();
        if (!isCurrent()) {
            return;
        }
        if (result.status === 'error') {
            new Notice(result.error.message);
            console.error(result.error);
            return;
        }

        const content = historyContent.ownerDocument.createElement('div');
        if (!result.jsonData.length) {
            const empty = content.createDiv({ cls: 'undefined-content' });
            empty.createEl('span', { text: '🍕 🎮 👕' });
            empty.createEl('p', { text: 'No matching operations found.' });
        } else {
            await generationHistoryContent(content, result, metadata);
        }
        if (!isCurrent()) {
            return;
        }
        historyContent.replaceChildren(...Array.from(content.childNodes));
        historyContent.classList.toggle('main-content-body--undefined', !result.jsonData.length);
    } catch (error) {
        if (isCurrent()) {
            console.error('Failed to render history', error);
            new Notice('Failed to load operations.');
        }
    } finally {
        if (isCurrent()) {
            historyContent.setAttribute('aria-busy', 'false');
        }
    }
}

function groupHistoryByDay(history: HistoryData[]): HistoryData[][] {
    const operationsByDay = new Map<string, HistoryData[]>();
    for (const operation of history) {
        const day = operation.date.split('T')[0];
        const dayOperations = operationsByDay.get(day) ?? [];
        dayOperations.push(operation);
        operationsByDay.set(day, dayOperations);
    }

    const dayGroups = [...operationsByDay.values()];
    dayGroups.sort((firstDay, secondDay) => {
        const firstDate = new Date(firstDay[0].date).getTime();
        const secondDate = new Date(secondDay[0].date).getTime();
        return secondDate - firstDate;
    });

    const now = Date.now();
    for (const operations of dayGroups) {
        operations.sort((first, second) => {
            const firstDistance = Math.abs(new Date(first.date).getTime() - now);
            const secondDistance = Math.abs(new Date(second.date).getTime() - now);
            return firstDistance - secondDistance;
        });
    }
    return dayGroups;
}

export async function generationHistoryContent(historyContent: HTMLDivElement, historyData: DataFileResult<HistoryData>, metadata?: HistoryMetadata) {
    if (historyData.status === 'error') {
        return historyData.error;
    }
    if (!historyData.jsonData.length) {
        return;
    }

    if (!metadata) {
        const result = await getHistoryMetadata();
        if (result.status === 'error') {
            return new Notice(result.error.message);
        }
        metadata = result.json;
    }
    const historyByDay = groupHistoryByDay(historyData.jsonData);

    for (const historyElement of historyByDay) {
        const historyBlock = historyContent.createEl('div', {
            cls: 'history-block'
        })

        const headerBlock = historyBlock.createEl('div', {
            cls: 'header-block'
        })
        const dateBlock = headerBlock.createEl('div', {
            cls: 'header-date-block'
        })
        dateBlock.createEl('p', {
            text: humanizeDate(historyElement[0].date.split("T")[0])
        })
        const amountBlock = headerBlock.createEl('div', {
            cls: 'header-amount-block'
        })
        amountBlock.createEl('span', {
            text: `${SummarizingDataForTheDay(historyElement)}`
        })
        const dataList = historyBlock.createEl('ul', {
            cls: 'data-list'
        })
        for (const element of historyElement) {
            const dataItem = dataList.createEl('li', {
                cls: 'data-item',
                attr: {
                    'data-id': element.id
                }
            })
            dataItem.onclick = (e: MouseEvent) => {
                void editingHistory(e);
            };

            const category = metadata.categories.get(`${element.type}:${element.category.id}`);
            const bill = metadata.bills.get(element.bill.id);

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
                text: category?.emoji ?? '📦'
            })
            divEmoji.createEl('span', {
                text: bill?.emoji ?? '💳'
            })

            if (!element.comment) {
                divText.createEl('p', {
                    text: category?.name ?? 'Uncategorized'
                })
                divText.createEl('span', {
                    text: bill?.name ?? 'Unknown account'
                })
            } else {
                divText.createEl('p', {
                    text: `${element.comment}`
                })
                divText.createEl('span', {
                    text: `${bill?.name ?? 'Unknown account'} • ${category?.name ?? 'Uncategorized'}`
                })
            }

            const dataAmount = dataItem.createEl('div', {
                cls: 'data-link-amount'
            })
            dataAmount.createEl('p', {
                text: `${checkExpenceOrIncome(element.amount, element.type)} ${bill ? getCurrencySymbol(bill.currency) : ''}`.trim()
            })
            if (element.type === 'income') {
                dataAmount.addClass('data-link-amount-income')
            }
        }
    }
}
