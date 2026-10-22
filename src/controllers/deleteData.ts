import { protectDataOperation } from './dataAccess';
import { getAllFile } from "./searchData";
import { updateFile } from "./editingData";
import { checkForDeletionData } from "../middleware/checkData";
import { HistoryData, PlanData, BillData, ResultOfExecution, YearData, categoriesData, PlanDataWithoutAmount, accountsData } from "../../main";
import { expenditureTransaction, incomeTransaction } from "../middleware/transferring"

const deleteHistoryImpl = async (element: HistoryData): Promise<ResultOfExecution> => {
	const year = element.date.slice(0, 4);
    const month = String(Number(element.date.slice(5, 7)));
    const stored = await getAllFile<YearData>(year);
    if (stored.status === 'error') return stored;
    if (!stored.json.months[month]?.history.some(item => item.id === element.id)) {
        return { status: 'error', error: new Error('Operation no longer exists. Reopen history.') };
    }


	if (element.type === 'expense') {
		const result = await expenditureTransaction(element, 'remove')
		if (result.status === 'error') return { status: 'error', error: result.error }
	} else if (element.type === 'income') {
		const result = await incomeTransaction(element, 'remove')
		if (result.status === 'error') return { status: 'error', error: result.error }
	} else {
		return { status: 'error', error: new Error('Unknown transaction type') }
	}

	const allData = await getAllFile<YearData>(year)
	if (allData.status === 'error') return { status: 'error', error: allData.error };

	try {
		const newHistory = allData.json.months[month].history.filter((item: HistoryData) => item.id !== element.id);
		allData.json.months[month].history = newHistory;

		const result = await updateFile(`${allData.json.year}`, allData.json);
		if (result.status === 'error') return { status: 'error', error: result.error };

		return { status: 'success' };
	} catch (error) {
		return { status: 'error', error: error instanceof Error ? error : new Error(`Error deleting item: ${String(error)}`) }
	}
}

const deletePlanImpl = async (data: PlanData): Promise<ResultOfExecution> => {
	if (await checkForDeletionData(data.id, 'plan')) return { status: 'error', error: new Error(`The category ${data.emoji} • ${data.name} cannot be deleted because it is used in history.`) }

	const additionalData = await getAllFile<categoriesData>('categories');
	if (additionalData.status === 'error') return { status: 'error', error: additionalData.error };

	try {

		if (data.type === 'expense') {
			const newPlan = additionalData.json.categories.expenditure_plan.filter((item: PlanDataWithoutAmount) => item.id !== data.id);
			additionalData.json.categories.expenditure_plan = newPlan;
		} else if (data.type === 'income') {
			const newPlan = additionalData.json.categories.income_plan.filter((item: PlanDataWithoutAmount) => item.id !== data.id);
			additionalData.json.categories.income_plan = newPlan;
		} else {
			return { status: 'error', error: new Error('The plan has an invalid type.') }
		}

		const result = await updateFile('categories', additionalData.json);
		if (result.status === 'error') return { status: 'error', error: result.error };

		return { status: 'success' }
	} catch (error) {
		return { status: 'error', error: error instanceof Error ? error : new Error(`Error checking for deletion: ${String(error)}`) }
	}
}

const deleteBillImpl = async (item: BillData): Promise<ResultOfExecution> => {
	const { id, name, emoji } = item;
	if (!id) return { status: 'error', error: new Error('Element not found') }

	const allData = await getAllFile<accountsData>('accounts')
	if (allData.status === 'error') return { status: 'error', error: allData.error };

	try {
		if (await checkForDeletionData(id, 'bill')) return { status: 'error', error: new Error(`The account ${emoji} • ${name} cannot be deleted because it is used in history.`) }

		const newBills = allData.json.accounts.filter((item: BillData) => item.id !== id);
		allData.json.accounts = newBills;

		const result = await updateFile('accounts', allData.json);
		if (result.status === 'error') return { status: 'error', error: result.error };

		return { status: 'success' }
	} catch (error) {
		return { status: 'error', error: error instanceof Error ? error : new Error(`Error checking for deletion: ${String(error)}`) }
	}
}

export const deleteHistory = protectDataOperation(deleteHistoryImpl);

export const deletePlan = protectDataOperation(deletePlanImpl);

export const deleteBill = protectDataOperation(deleteBillImpl);
