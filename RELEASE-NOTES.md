# Financial Accounting 1.0.4

## Full backups and safe restore

- Added a **Backup and restore** section in plugin settings with a configurable folder inside the vault.
- **Create backup** saves all accounts, balances, categories, operations for every year, and plugin settings in one JSON file. Original IDs and decimal precision are preserved.
- Each backup has a timestamped filename. Existing copies are never overwritten or automatically deleted, and saved content is read back for verification.
- **Restore backup** accepts a file from the backup folder or your device. The plugin validates the format, IDs, references, amounts and dates, then shows the creation date and record counts before asking for confirmation.
- Restoring replaces the complete dataset and settings without replaying operations against account balances. A separate safety copy of the current data is saved before replacement starts.
- Added rollback after restore write failures and a recovery journal for interrupted restores. On the next startup, recovery runs before financial views open.
- Added protection against starting a backup or restore while financial data is being saved, plus regression tests for validation, rollback and recovery.

## Using backups

Open **Settings → Financial Accounting → Backup and restore**. The default folder is **Financial Accounting Backups** in your vault. Backups are plain JSON; copy them to another device or your backup service to protect against loss of the vault or disk.

Restoring an older copy removes newer records from the active dataset. Those records remain in the automatically created `financial-accounting-before-restore-…json` safety copy.

## Compatibility and release files

Requires Obsidian 1.8.0 or later. Existing financial data remains compatible; no manual conversion is needed. Backup format version: 1.

Publish these files from `dist` under the tag `1.0.4`:

- `main.js`
- `manifest.json`
- `styles.css`
- `LICENSE-TWEMOJI.txt`
- `TWEMOJI-NOTICE.md`

Do not include `db/`, `data.json`, or personal backup files in the release.
