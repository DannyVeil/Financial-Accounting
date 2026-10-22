# Financial Accounting 1.0.6

## Global History Search

- Added **All history** beside the search field to find operations across every recorded year, including personal notes from previous years.
- Search by note, account, category, amount, or transaction type in the selected currency. Switch back to the selected month without losing your query.
- Search is now available even when the selected month has no operations.
- Global results load in groups of 100. **Show more** appears only while additional matches remain; monthly history continues to display all results.
- Fixed editing and deletion of operations found in other months so changes apply to the original period. Editing older date-only records preserves their date format.
- Added year labels to history dates and styled **Show more** with the theme's accent color and spacing above the button.

Requires **Obsidian 1.8.0 or later**. No data migration is required. The backup format remains unchanged.

## Release files

Publish these files from `dist` under the tag `1.0.6`:

- `main.js`
- `manifest.json`
- `styles.css`
- `LICENSE-TWEMOJI.txt`
- `TWEMOJI-NOTICE.md`

Do not include `db/`, `data.json`, or personal backup files.
