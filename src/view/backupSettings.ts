import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import MainPlugin, { FinancialAccountingView, stateManager } from '../../main';
import {
    Backup,
    backupFolder,
    backupSummary,
    createBackup,
    DEFAULT_BACKUP_FOLDER,
    parseBackup,
    restoreBackup,
} from '../controllers/backupData';
import { assertDataAvailable } from '../controllers/dataAccess';

function showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    new Notice(message, 12000);
}

async function saveBackupFolder(plugin: MainPlugin, draftFolder: string): Promise<void> {
    assertDataAvailable();
    const path = backupFolder(draftFolder);
    const previousFolder = plugin.settings.backupFolder;
    plugin.settings.backupFolder = path;

    try {
        await plugin.saveSettings();
    } catch (error) {
        plugin.settings.backupFolder = previousFolder;
        throw error;
    }

    new Notice(`Backup folder: ${path}`);
}

async function createBackupFromSettings(plugin: MainPlugin, button: ButtonComponent): Promise<void> {
    button.setDisabled(true);

    try {
        const path = await createBackup(plugin);
        new Notice(`Backup saved: ${path}`, 10000);
    } catch (error) {
        showError(error);
    } finally {
        button.setDisabled(false);
    }
}

export function addBackupSettings(
    container: HTMLElement,
    plugin: MainPlugin,
    refresh: () => void,
): void {
    let draftFolder = plugin.settings.backupFolder;

    new Setting(container)
        .setName('Backup and restore')
        .setHeading();

    new Setting(container)
        .setName('Backup folder')
        .setDesc('Folder inside the vault. Every backup is a new full JSON file; old copies are never deleted automatically.')
        .addText(text => {
            text.setValue(draftFolder);
            text.onChange(value => {
                draftFolder = value;
            });
        })
        .addButton(button => {
            button.setButtonText('Save folder');
            button.onClick(() => saveBackupFolder(plugin, draftFolder).catch(showError));
        });

    new Setting(container)
        .setName('Create a full backup')
        .setDesc('Includes all accounts, categories, years and settings. Copy this folder to another device to protect against disk loss.')
        .addButton(button => {
            button.setButtonText('Create backup');
            button.onClick(() => createBackupFromSettings(plugin, button));
        });

    new Setting(container)
        .setName('Restore a full backup')
        .setDesc('Choose a backup and review it before replacing current data. A safety copy is created first.')
        .addButton(button => {
            button.setButtonText('Restore backup');
            button.onClick(() => new RestoreModal(plugin, refresh).open());
        });
}

class RestoreModal extends Modal {
    private busy = false;

    constructor(private plugin: MainPlugin, private refresh: () => void) {
        super(plugin.app);
    }

    onOpen(): void {
        void this.render().catch(showError);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async render(): Promise<void> {
        this.contentEl.createEl('h2', { text: 'Restore financial data' });

        const configuredFolder = this.plugin.settings.backupFolder || DEFAULT_BACKUP_FOLDER;
        const folder = backupFolder(configuredFolder);
        const adapter = this.app.vault.adapter;
        let backupPaths: string[] = [];

        if (await adapter.exists(folder)) {
            const listing = await adapter.list(folder);
            backupPaths = listing.files
                .filter(path => path.endsWith('.json'))
                .sort()
                .reverse();
        }

        if (backupPaths.length > 0) {
            this.renderVaultBackupPicker(backupPaths);
        } else {
            this.contentEl.createEl('p', { text: `No JSON backups found in ${folder}.` });
        }

        new Setting(this.contentEl)
            .setName('Choose a file from this device')
            .addButton(button => {
                button.setButtonText('Choose JSON file');
                button.onClick(() => this.chooseLocalBackup());
            });
    }

    private renderVaultBackupPicker(paths: string[]): void {
        let selectedPath = paths[0];

        new Setting(this.contentEl)
            .setName('Backup in vault')
            .addDropdown(dropdown => {
                for (const path of paths) {
                    const filename = path.slice(path.lastIndexOf('/') + 1);
                    dropdown.addOption(path, filename);
                }

                dropdown.setValue(selectedPath);
                dropdown.onChange(value => {
                    selectedPath = value;
                });
            })
            .addButton(button => {
                button.setButtonText('Review');
                button.onClick(async () => {
                    try {
                        const text = await this.app.vault.adapter.read(selectedPath);
                        this.review(parseBackup(text));
                    } catch (error) {
                        showError(error);
                    }
                });
            });
    }

    private chooseLocalBackup(): void {
        const input = this.contentEl.createEl('input', {
            type: 'file',
            attr: {
                accept: '.json,application/json',
                'aria-label': 'Choose backup JSON file',
            },
        });
        input.hidden = true;

        input.onchange = async () => {
            try {
                const file = input.files?.[0];
                if (file) {
                    const text = await file.text();
                    this.review(parseBackup(text));
                }
            } catch (error) {
                showError(error);
            } finally {
                input.remove();
            }
        };

        input.click();
    }

    private review(backup: Backup): void {
        this.contentEl.empty();
        this.contentEl.createEl('h2', { text: 'Confirm full restore' });
        this.contentEl.createEl('p', { text: backupSummary(backup) });
        this.contentEl.createEl('p', {
            text: 'All current accounts, categories, operations and settings will be replaced. '
                + 'Records added after this backup will be removed. '
                + 'A separate backup of your current data will be saved before any changes.',
        });

        new Setting(this.contentEl)
            .addButton(button => {
                button.setButtonText('Cancel');
                button.onClick(() => {
                    if (!this.busy) {
                        this.close();
                    }
                });
            })
            .addButton(button => {
                button.setButtonText('Replace data and restore')
                    .setWarning();
                button.onClick(() => this.confirmRestore(backup, button));
            });
    }

    private async confirmRestore(backup: Backup, button: ButtonComponent): Promise<void> {
        if (this.busy) {
            return;
        }

        this.busy = true;
        button.setDisabled(true);

        let safetyPath: string;
        try {
            safetyPath = await restoreBackup(this.plugin, backup);
        } catch (error) {
            showError(error);
            this.busy = false;
            button.setDisabled(false);
            return;
        }

        stateManager({
            selectedCurrency: null,
            selectedMonth: null,
            selectedYear: null,
            openPageNow: null,
        });
        new Notice(`Restore complete. Previous data saved: ${safetyPath}`, 15000);
        this.close();
        this.refresh();

        try {
            const leaves = this.app.workspace.getLeavesOfType('financial-accounting-view');
            for (const leaf of leaves) {
                await (leaf.view as FinancialAccountingView).onOpen();
            }
        } catch {
            new Notice('Data restored. Reopen the finance panel to refresh its display.');
        }
    }
}
