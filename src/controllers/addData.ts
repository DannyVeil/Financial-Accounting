import { protectDataOperation } from './dataAccess';
import { getAllFile } from "./searchData";
import { checkBill, validateHistory } from "../middleware/checkData";
import { updateFile } from "../controllers/editingData";
import { expenditureTransaction, incomeTransaction } from "../middleware/transferring";
import { HistoryData, PlanData, BillData, ResultOfExecution, stateManager, YearData, categoriesData, accountsData } from "../../main";
import { getDate } from '../middleware/otherFunc';

const addJsonToHistoryImpl = async (data: HistoryData): Promise<ResultOfExecution> => {
	const validation = await validateHistory(data);
	if (validation.status === 'error') return validation;
	if (data.type === 'expense') {
		const resultCheckBill = await checkBill(data)
		if (resultCheckBill.status === 'error') {
			return { status: 'error', error: resultCheckBill.error }
		}
	}

	const { selectedYear, selectedMonth } = stateManager();
	const { year, month } =
		selectedYear && selectedMonth
			? { year: selectedYear, month: selectedMonth }
			: getDate();

	if (data.type === 'expense') {
		const result = await expenditureTransaction(data, 'add')
		if (result.status === 'error') return { status: 'error', error: result.error };
	} else if (data.type === 'income') {
		const result = await incomeTransaction(data, 'add')
		if (result.status === 'error') return { status: 'error', error: result.error };
	} else {
		return { status: 'error', error: new Error('The specified type is not suitable') }
	}

	const allData = await getAllFile<YearData>(year)
	if (allData.status === 'error') return { status: 'error', error: allData.error };

	try {
		allData.json.months[month].history.push(data);

		const result = await updateFile(`${allData.json.year}`, allData.json);
		if (result.status === 'error') return { status: 'error', error: result.error };

		return { status: 'success' };
	} catch (error) {
		return { status: 'error', error: error instanceof Error ? error : new Error(`Failed to add JSON to history: ${String(error)}`) }
	}
}

const addJsonToPlanImpl = async (data: PlanData): Promise<ResultOfExecution> => {
	const additionalData = await getAllFile<categoriesData>('categories');
	if (additionalData.status === 'error') return { status: 'error', error: additionalData.error };

	try {
		if (data.type === 'income') {
			additionalData.json.categories.income_plan.push({ id: data.id, name: data.name, emoji: data.emoji, comment: data.comment, /* parentId: data.parentId, */ type: data.type, archived: data.archived });
		} else if (data.type === 'expense') {
			additionalData.json.categories.expenditure_plan.push({ id: data.id, name: data.name, emoji: data.emoji, comment: data.comment, /* parentId: data.parentId, */ type: data.type, archived: data.archived });
		} else {
			return { status: 'error', error: new Error('The specified type is not suitable') }
		}

		const result = await updateFile('categories', additionalData.json);
		if (result.status === 'error') return { status: 'error', error: result.error };

		return { status: 'success' };
	} catch (error) {
		return { status: 'error', error: error instanceof Error ? error : new Error(`Error creating expediture plans: ${String(error)}`) }
	}
}

const addJsonToBillsImpl = async (data: BillData): Promise<ResultOfExecution> => {
	if (data.balance === '') {
		data.balance = '0'
	}

	const allData = await getAllFile<accountsData>('accounts')
	if (allData.status === 'error') return { status: 'error', error: allData.error };

	try {
		allData.json.accounts.push(data);

		const result = await updateFile('accounts', allData.json);
		if (result.status === 'error') return { status: 'error', error: result.error };

		return { status: 'success' }
	} catch (error) {
		return { status: 'error', error: error instanceof Error ? error : new Error(`Error creating bills: ${String(error)}`) }
	}
}

export const addJsonToHistory = protectDataOperation(addJsonToHistoryImpl);

export const addJsonToPlan = protectDataOperation(addJsonToPlanImpl);

export const addJsonToBills = protectDataOperation(addJsonToBillsImpl);
