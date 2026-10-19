import type { ResultOfExecution } from '../../main';

let active = 0;
let exclusive = false;
let blocked = false;

export function acquireBackupLock(): () => void {
    if (exclusive || active || blocked) throw new Error('Financial data is busy or awaiting recovery. Try again after the operation finishes or restart Obsidian.');
    exclusive = true;
    return () => { exclusive = false; };
}

export function blockForRecovery(value: boolean): void { blocked = value; }

export function assertDataAvailable(): void {
    if (exclusive || blocked) throw new Error('Financial data is being backed up or restored. Please wait or restart Obsidian if recovery failed.');
}

export async function withDataAccess<T>(operation: () => Promise<T>): Promise<T> {
    assertDataAvailable();
    active++;
    try { return await operation(); } finally { active--; }
}

export function protectDataOperation<T extends unknown[]>(operation: (...args: T) => Promise<ResultOfExecution>): (...args: T) => Promise<ResultOfExecution> {
    return async (...args: T) => {
        try { assertDataAvailable(); } catch (error) { return { status: 'error', error: error as Error }; }
        active++;
        try { return await operation(...args); } finally { active--; }
    };
}
