import type { ResultOfExecution } from '../../main';

type DataOperation<Arguments extends unknown[]> = (
    ...args: Arguments
) => Promise<ResultOfExecution>;

let activeOperationCount = 0;
let backupLockHeld = false;
let recoveryPending = false;

export function acquireBackupLock(): () => void {
    const dataIsBusy = backupLockHeld || activeOperationCount > 0 || recoveryPending;
    if (dataIsBusy) {
        throw new Error(
            'Financial data is busy or awaiting recovery. '
            + 'Try again after the operation finishes or restart Obsidian.',
        );
    }

    backupLockHeld = true;

    return () => {
        backupLockHeld = false;
    };
}

export function blockForRecovery(value: boolean): void {
    recoveryPending = value;
}

export function assertDataAvailable(): void {
    if (backupLockHeld || recoveryPending) {
        throw new Error(
            'Financial data is being backed up or restored. '
            + 'Please wait or restart Obsidian if recovery failed.',
        );
    }
}

export async function withDataAccess<T>(operation: () => Promise<T>): Promise<T> {
    assertDataAvailable();
    activeOperationCount++;

    try {
        return await operation();
    } finally {
        activeOperationCount--;
    }
}

export function protectDataOperation<Arguments extends unknown[]>(
    operation: DataOperation<Arguments>,
): DataOperation<Arguments> {
    return async (...args: Arguments) => {
        try {
            assertDataAvailable();
        } catch (error) {
            return { status: 'error', error: error as Error };
        }

        activeOperationCount++;

        try {
            return await operation(...args);
        } finally {
            activeOperationCount--;
        }
    };
}
