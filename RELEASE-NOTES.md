# Financial Accounting 1.0.5

## Maintenance update and legacy backup compatibility

- Fixed backup creation and restoration for older operations whose dates contain only a calendar date (for example, `2026-10-19`). These dates are preserved without adding a time.
- Improved backup validation messages to identify the file, month, operation and invalid date.
- Reorganized the home, history, accounts, plans and navigation code into separate modules, and simplified backup, export and data-access code for easier maintenance.
- Reordered plugin preferences for clearer navigation.
- Added regression coverage for legacy backup dates, home category charts and month navigation.

Requires Obsidian 1.8.0 or later. Backup format remains version 1; no manual data conversion is required. CSV import remains disabled in this release.

## Release files

Publish the following files from `dist` under the tag `1.0.5`:

- `main.js`
- `manifest.json`
- `styles.css`
- `LICENSE-TWEMOJI.txt`
- `TWEMOJI-NOTICE.md`

Do not include `db/`, `data.json`, or personal backup files in the release.
