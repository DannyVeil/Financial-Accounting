import { Notice } from 'obsidian';
import { DataFileResult, HistoryData, stateManager } from '../../main';
import { filterHistory, getMainData, loadAllHistory, getHistoryMetadata, HistoryMetadata } from '../controllers/searchData';
import {
    activeCurrency,
    checkExpenceOrIncome,
    getCurrencySymbol,
    humanizeDate,
    SummarizingDataForTheDay,
} from '../middleware/otherFunc';
import { editingHistory } from './editingView';

export const showHistory = async (mainContent: HTMLDivElement) => {
    stateManager({ openPageNow: 'History' });
    await showHistorySearch(mainContent, renderHistoryResults);
};

const GLOBAL_HISTORY_PAGE_SIZE = 100;

type HistoryRenderer = (
    container: HTMLDivElement,
    loadHistory: () => Promise<DataFileResult<HistoryData>>,
    metadata: HistoryMetadata,
) => Promise<void>;

export async function showHistorySearch(
    mainContent: HTMLDivElement,
    render: HistoryRenderer,
): Promise<void> {
    const body = mainContent.createDiv({ cls: 'main-content-body' });
    const searchBar = body.createDiv({ cls: 'history-search-bar' });
    const searchInput = searchBar.createEl('input', {
        cls: 'input-search',
        attr: {
            type: 'search',
            placeholder: 'Search by operations',
            'aria-label': 'Search operations',
        },
    });
    const globalSearchButton = searchBar.createEl('button', {
        cls: 'history-global-toggle',
        text: 'All history',
        attr: {
            type: 'button',
            'aria-label': 'Search all history',
            'aria-pressed': 'false',
            title: 'Search across all years in the selected currency',
        },
    });
    const errorMessage = body.createDiv({
        cls: 'history-search-status',
        attr: { role: 'status', 'aria-live': 'polite' },
    });
    const historyContent = body.createDiv({ cls: 'history-content' });
    const showMoreButton = body.createEl('button', {
        cls: 'history-show-more',
        text: 'Show more',
        attr: { type: 'button' },
    });
    showMoreButton.hidden = true;

    const currency = activeCurrency();
    let globalSearchEnabled = false;
    let visibleOperationCount = GLOBAL_HISTORY_PAGE_SIZE;
    let searchRequestVersion = 0;
    let allHistoryPromise: Promise<HistoryData[]> | undefined;
    let monthHistoryPromise: Promise<HistoryData[]> | undefined;

    // Cache each scope while this view is open. Failed reads can be retried.
    function loadSearchHistory(): Promise<HistoryData[]> {
        if (globalSearchEnabled) {
            if (!allHistoryPromise) {
                allHistoryPromise = loadAllHistory(currency).catch(error => {
                    allHistoryPromise = undefined;
                    throw error;
                });
            }
            return allHistoryPromise;
        }

        if (!monthHistoryPromise) {
            monthHistoryPromise = getMainData()
                .then(result => {
                    if (result.status === 'error') {
                        throw result.error;
                    }
                    return result.jsonData;
                })
                .catch(error => {
                    monthHistoryPromise = undefined;
                    throw error;
                });
        }
        return monthHistoryPromise;
    }

    function setShowMoreAvailable(available: boolean): void {
        showMoreButton.hidden = !available;
        showMoreButton.disabled = !available;
    }

    async function refreshSearchResults(
        metadata: HistoryMetadata,
        keepVisibleCount = false,
    ): Promise<void> {
        if (!keepVisibleCount) {
            visibleOperationCount = GLOBAL_HISTORY_PAGE_SIZE;
        }
        setShowMoreAvailable(false);
        errorMessage.textContent = '';

        const requestVersion = ++searchRequestVersion;
        const query = searchInput.value;
        const searchAllYears = globalSearchEnabled;
        const resultLimit = visibleOperationCount;
        let hasMoreResults = false;

        async function loadMatchingOperations(): Promise<DataFileResult<HistoryData>> {
            try {
                const history = await loadSearchHistory();
                const matches = filterHistory(history, query, metadata);
                hasMoreResults = searchAllYears && matches.length > resultLimit;
                const visibleMatches = searchAllYears
                    ? matches.slice(0, resultLimit)
                    : matches;

                return { status: 'success', jsonData: visibleMatches };
            } catch (error) {
                const failure = error instanceof Error
                    ? error
                    : new Error('Failed to load operations.');
                if (requestVersion === searchRequestVersion) {
                    errorMessage.textContent = failure.message;
                }
                return { status: 'error', error: failure };
            }
        }

        // Start rendering immediately to invalidate any older pending render.
        await render(historyContent, loadMatchingOperations, metadata);
        if (requestVersion === searchRequestVersion) {
            setShowMoreAvailable(hasMoreResults);
        }
    }

    try {
        const metadataResult = await getHistoryMetadata();
        if (metadataResult.status === 'error') {
            throw metadataResult.error;
        }
        const metadata = metadataResult.json;

        showMoreButton.onclick = () => {
            if (!globalSearchEnabled || showMoreButton.hidden || showMoreButton.disabled) {
                return;
            }
            visibleOperationCount += GLOBAL_HISTORY_PAGE_SIZE;
            void refreshSearchResults(metadata, true);
        };
        searchInput.oninput = () => {
            void refreshSearchResults(metadata);
        };
        globalSearchButton.onclick = () => {
            globalSearchEnabled = !globalSearchEnabled;
            globalSearchButton.setAttribute('aria-pressed', String(globalSearchEnabled));
            searchInput.placeholder = globalSearchEnabled
                ? 'Search all history'
                : 'Search by operations';
            void refreshSearchResults(metadata);
        };

        await refreshSearchResults(metadata);
    } catch (error) {
        errorMessage.textContent = error instanceof Error
            ? error.message
            : 'Failed to load search.';
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
            text: `${humanizeDate(historyElement[0].date.split("T")[0])} · ${historyElement[0].date.slice(0, 4)}`
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
                void editingHistory(e, element);
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
