# Financial Accounting 1.0.7

## Preserve History Search Context

- Return from an operation without losing your search text, **All history** mode, or expanded results.
- Restore your scroll position after returning from editing or deleting an operation, including when the outer Obsidian panel handles scrolling.
- Reload results on return so edits and deletions are reflected immediately. If the list becomes shorter, the restored position stays within the available content.
- Reset scrolling and the global result limit to 100 when switching the month or currency, while retaining your query and search mode.
- Keep search context in memory for the current plugin session without writing interface state to financial data or settings.

Requires **Obsidian 1.8.0 or later**. No data migration is required. The backup format remains unchanged.

## Release files

Create the GitHub Release with tag `1.0.7` and attach these files from `dist` directly as release assets:

- `main.js`
- `manifest.json`
- `styles.css`
- `LICENSE-TWEMOJI.txt`
- `TWEMOJI-NOTICE.md`

Committing the files to the repository is not sufficient for release installation or automated release checks. Do not include `db/`, `data.json`, or personal backup files.
