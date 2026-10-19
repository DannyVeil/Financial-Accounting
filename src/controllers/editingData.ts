import { protectDataOperation } from './dataAccess';
import { getAllFile } from "./searchData";
import { getDate, normalizeMoneyField } from "../middleware/otherFunc";
import { checkBill, validateHistory } from "../middleware/checkData";
import { expenditureTransaction, incomeTransaction } from "../middleware/transferring";
import { HistoryData, PlanData, BillData, ResultOfExecution, stateManager, accountsData, categoriesData, YearData, PlanDataWithoutAmount } from "../../main";
import MainPlugin from "../../main";

const editingJsonToHistoryImpl = async (data: HistoryData, oldData: HistoryData): Promise<ResultOfExecution> => {
    const validation = await validateHistory(data);
    if (validation.status === 'error') return validation;
    if(data.type === 'expense') {
        const resultCheckBill  = await checkBill(data, oldData)
        if(resultCheckBill.status === 'error') return { status: 'error', error: resultCheckBill.error }
    }

    const { selectedYear, selectedMonth } = stateManager();
    const { year, month } =
    selectedYear && selectedMonth
        ? { year: selectedYear, month: selectedMonth }
        : getDate();

    if(data.type === 'expense') {
        const result = await expenditureTransaction(data, 'edit', oldData)
        if(result.status === 'error') return { status: 'error', error: result.error} 
    } else if (data.type === 'income') {
        const result = await incomeTransaction(data, 'edit', oldData)
        if(result.status === 'error') return { status: 'error', error: result.error} 
    } else {
        return { status: 'error', error: new Error('The specified type is not suitable')}
    }

    const allData = await getAllFile<YearData>(year);
    if (allData.status === 'error') return { status: 'error', error: allData.error };

    try {
        allData.json.months[month].history = allData.json.months[month].history.map((item: HistoryData) => item.id === data.id ? {...item, ...data} : item);

        const result = await updateFile(`${allData.json.year}`, allData.json);
        if (result.status === 'error') return { status: 'error', error: result.error };

        return { status: "success"}
    } catch (error) {
        return {status: 'error', error: error instanceof Error ? error : new Error(`Failed to editing JSON to history: ${String(error)}`)}
    }
}

const editingJsonToPlanImpl = async (data: PlanData): Promise<ResultOfExecution> => {
    const allCategories = await getAllFile<categoriesData>('categories');
    if (allCategories.status === 'error') return { status: 'error', error: allCategories.error };
    
    try {         
        const plan = data.type === 'expense' ? allCategories.json.categories.expenditure_plan : allCategories.json.categories.income_plan;
        const updatedPlan = plan.map((item: PlanDataWithoutAmount) => item.id === data.id ? {...item, ...data} : item);
        if(data.type === 'expense') {
            allCategories.json.categories.expenditure_plan = updatedPlan;
        } else if (data.type === 'income') {
            allCategories.json.categories.income_plan = updatedPlan;
        } else {
            return { status: 'error', error: new Error('The specified type is not suitable')}
        }
        const result = await updateFile('categories', allCategories.json);
        if (result.status === 'error') return { status: 'error', error: result.error };

        return { status: "success" }
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error : new Error(`Failed to editing JSON to plan: ${String(error)}`) }
    }
}

const editingJsonToBillImpl = async (data: BillData): Promise<ResultOfExecution> => {
    if (data.balance === '') {
        data.balance = '0'
    }

    const allData = await getAllFile<accountsData>('accounts')
    if (allData.status === 'error') return { status: 'error', error: allData.error };
    
    try {
        allData.json.accounts = allData.json.accounts.map((item: BillData) => item.id === data.id ? {...item, ...data} : item);

        const result = await updateFile('accounts', allData.json);
        if (result.status === 'error') return { status: 'error', error: result.error };

        return { status: "success" }
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error : new Error(`Failed to editing JSON to bill: ${String(error)}`) }
    }
}

export const updateFile = async (file: string, data: BillData[] | HistoryData[] | PlanData[] | accountsData | categoriesData | YearData): Promise<ResultOfExecution> => {
    try {
        const fileExists = await MainPlugin.instance.app.vault.adapter.exists(`${MainPlugin.instance.dbPath}/${file}.json`);
        if(!fileExists) { return { status: 'error', error: new Error(`File not found: ${MainPlugin.instance.dbPath}/${file}.json`) }; }
        
        await MainPlugin.instance.app.vault.adapter.write(
            `${MainPlugin.instance.dbPath}/${file}.json`,
            JSON.stringify(data, normalizeMoneyField, 4)
        );

        return { status: 'success' };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error : new Error(`Error update data: ${String(error)}`) };
    }
}

export const editingJsonToHistory = protectDataOperation(editingJsonToHistoryImpl);

export const editingJsonToPlan = protectDataOperation(editingJsonToPlanImpl);

export const editingJsonToBill = protectDataOperation(editingJsonToBillImpl);
