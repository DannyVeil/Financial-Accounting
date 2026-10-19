import { Modal, Notice, Setting } from 'obsidian';
import MainPlugin, { FinancialAccountingView, stateManager } from '../../main';
import { Backup, backupFolder, backupSummary, createBackup, DEFAULT_BACKUP_FOLDER, parseBackup, restoreBackup } from '../controllers/backupData';
import { assertDataAvailable } from '../controllers/dataAccess';

export function addBackupSettings(container: HTMLElement, plugin: MainPlugin, refresh: () => void): void {
    let draft = plugin.settings.backupFolder;
    new Setting(container).setName('Backup and restore').setHeading();
    new Setting(container).setName('Backup folder')
        .setDesc('Folder inside the vault. Every backup is a new full JSON file; old copies are never deleted automatically.')
        .addText(text => {
            text.setValue(plugin.settings.backupFolder).onChange(value => { draft = value; });
        })
        .addButton(button => button.setButtonText('Save folder').onClick(async () => {
                try {
                    assertDataAvailable();
                    const path = backupFolder(draft);
                    const previous = plugin.settings.backupFolder;
                    plugin.settings.backupFolder = path;
                    try { await plugin.saveSettings(); } catch (error) { plugin.settings.backupFolder = previous; throw error; }
                    new Notice(`Backup folder: ${path}`);
                } catch (error) { showError(error); }
        }));
    new Setting(container).setName('Create a full backup')
        .setDesc('Includes all accounts, categories, years and settings. Copy this folder to another device to protect against disk loss.')
        .addButton(button => button.setButtonText('Create backup').onClick(async () => {
            button.setDisabled(true);
            try { new Notice(`Backup saved: ${await createBackup(plugin)}`, 10000); }
            catch (error) { showError(error); }
            finally { button.setDisabled(false); }
        }));
    new Setting(container).setName('Restore a full backup')
        .setDesc('Choose a backup and review it before replacing current data. A safety copy is created first.')
        .addButton(button => button.setButtonText('Restore backup').onClick(() => new RestoreModal(plugin, refresh).open()));
}
function showError(error: unknown): void { new Notice(error instanceof Error ? error.message : String(error), 12000); }
class RestoreModal extends Modal {
    private busy = false;
    constructor(private plugin: MainPlugin, private refresh: () => void) { super(plugin.app); }
    onOpen(): void { void this.render().catch(showError); }
    private async render(): Promise<void> {
        this.contentEl.createEl('h2', { text: 'Restore financial data' });
        const folder = backupFolder(this.plugin.settings.backupFolder || DEFAULT_BACKUP_FOLDER);
        const adapter = this.app.vault.adapter;
        const paths = await adapter.exists(folder) ? (await adapter.list(folder)).files.filter(path => path.endsWith('.json')).sort().reverse() : [];
        let selected = paths[0];
        if (paths.length) {
            new Setting(this.contentEl).setName('Backup in vault').addDropdown(drop => {
                for (const path of paths) drop.addOption(path, path.slice(path.lastIndexOf('/') + 1));
                drop.setValue(selected).onChange(value => { selected = value; });
            }).addButton(button => button.setButtonText('Review').onClick(async () => {
                try { this.review(parseBackup(await adapter.read(selected))); } catch (error) { showError(error); }
            }));
        } else { this.contentEl.createEl('p', { text: `No JSON backups found in ${folder}.` }); }
        new Setting(this.contentEl).setName('Choose a file from this device').addButton(button => button.setButtonText('Choose JSON file').onClick(() => {
            const input = this.contentEl.createEl('input', { type: 'file', attr: { accept: '.json,application/json', 'aria-label': 'Choose backup JSON file' } });
            input.hidden = true;
            input.onchange = async () => {
                try { const file = input.files?.[0]; if (file) this.review(parseBackup(await file.text())); }
                catch (error) { showError(error); }
                finally { input.remove(); }
            };
            input.click();
        }));
    }
    private review(backup: Backup): void {
        this.contentEl.empty();
        this.contentEl.createEl('h2', { text: 'Confirm full restore' });
        this.contentEl.createEl('p', { text: backupSummary(backup) });
        this.contentEl.createEl('p', { text: 'All current accounts, categories, operations and settings will be replaced. Records added after this backup will be removed. A separate backup of your current data will be saved before any changes.' });
        new Setting(this.contentEl).addButton(button => button.setButtonText('Cancel').onClick(() => { if (!this.busy) this.close(); }))
            .addButton(button => button.setButtonText('Replace data and restore').setWarning().onClick(async () => {
                if (this.busy) return;
                this.busy = true; button.setDisabled(true);
                let safetyPath: string;
                try { safetyPath = await restoreBackup(this.plugin, backup); }
                catch (error) { showError(error); this.busy = false; button.setDisabled(false); return; }
                stateManager({ selectedCurrency: null, selectedMonth: null, selectedYear: null, openPageNow: null });
                new Notice(`Restore complete. Previous data saved: ${safetyPath}`, 15000);
                this.close(); this.refresh();
                try {
                    for (const leaf of this.app.workspace.getLeavesOfType('financial-accounting-view')) {
                        await (leaf.view as FinancialAccountingView).onOpen();
                    }
                } catch { new Notice('Data restored. Reopen the finance panel to refresh its display.'); }
            }));
    }
    onClose(): void { this.contentEl.empty(); }
}
