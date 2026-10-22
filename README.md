# Financial Accounting

Track personal income, expenses, and account balances inside [Obsidian](https://obsidian.md/). Financial Accounting keeps your records in your vault and works offline, without registration or a connection to your bank.

## Features

- **Finance dashboard:** review your balance, income and expense summaries, and a monthly expense chart. Select chart categories to inspect the related operations.
- **Transaction history:** record income and expenses with an account, category, date, and optional note. Search the selected month by amount, transaction type, account, category, or note.
- **Categories:** organize income and expenses with names and emoji<!-- , and optional parent categories -->. Review totals calculated from recorded transactions.
- **Currency switching:** view one currency at a time. The header selector filters accounts, history, category totals, charts, and statistics without converting or adding different currencies together.
- **Multiple accounts:** track cash, cards, and other balances. Choose which accounts contribute to the general balance and archive accounts you no longer use.
- **Transfers:** move money between accounts in the same currency or enter separate source and target amounts for a cross-currency transfer.
- **Monthly navigation:** use the calendar to revisit earlier months and their transaction records.
- **Local storage:** financial records are saved as JSON files in your vault's configuration folder.
- **Reusable notes:** select a previously used note for the current category when the note field is empty.
- **CSV export:** export operation history for all years and currencies from plugin settings to a new CSV file in the vault root, including category and account names with emoji.
- **Full JSON backups:** save all accounts, categories, years and settings in a configurable vault folder. Restore a validated backup with a safety copy and recovery after interrupted writes.

Requires **Obsidian 1.8.0 or later**. The plugin supports desktop and mobile layouts. The account section is titled **Accounts**; some internal names still use **Bills**.

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, `styles.css`, `LICENSE-TWEMOJI.txt`, and `TWEMOJI-NOTICE.md` from a release on the [releases page](https://github.com/DannyVeil/Financial-Accounting/releases).
2. Create the following folder in your vault:

   ```text
   <vault>/.obsidian/plugins/financial-accounting/
   ```

3. Copy these files into that folder. The Twemoji license and notice accompany the bundled flag graphics.
4. Restart Obsidian, enable community plugins if needed, and enable **Financial Accounting** in **Settings → Community plugins**.

If you use a custom Obsidian configuration folder, replace `.obsidian` with that folder's name.

### Community plugins

Once the plugin is available in the community catalog, open **Settings → Community plugins → Browse**, search for **Financial Accounting**, then select **Install** and **Enable**. Until then, use manual installation.

## Getting started

### 1. Choose your settings

Open **Settings → Financial Accounting** and configure:

| Setting | Purpose | Default |
| --- | --- | --- |
| Initial year of accounting | First year to make available for accounting records | Current year |
| Main currency | Default currency selected when the plugin starts | USD |

On first launch, the plugin saves default settings and creates its database automatically. You do not need to open Settings first. Changing the main currency does not convert existing amounts.

### 2. Open the finance panel

Run **Financial Accounting: Open the finance panel** from the command palette, or select the dollar-sign ribbon icon, whose tooltip is **Add operation**. The panel opens in the right sidebar on desktop and in a workspace tab on mobile.

### 3. Add an account

Open **Accounts** and use the **+** button, which is also available when the list is empty. Enter a name, emoji, currency, starting balance, and optional note.

Enable **Take into account in the general balance** for accounts you want to include in your total. Accounts in any currency can use this option; the displayed total includes only the currently selected currency.

### 4. Create categories

Open **Categories** and use the **+** button to create income and expense categories, such as Salary and Groceries. Give each category a name and emoji; optionally add a note<!-- or parent category -->.

Create a category for the type of operation you want to record. You can create your first category from the empty Categories section. Transfers do not require categories.

Categories are shared across currencies. Their totals show actual transactions for the selected month and currency; editable budget targets are not supported.

### 5. Record an operation

Use the add-operation button. The form has three tabs: **Expense**, **Income**, and **Transfer**. For income or expenses, choose the corresponding tab. Enter the amount, choose an account and category, set the date, and optionally add a note. Select **Add** to save the operation and update the account balance.

Income and expenses use the currency of the selected account. Switch the currency in the panel header to work with other accounts. Select an entry in **History** to edit or delete it.

## Exploring your finances

| Section | What you can do |
| --- | --- |
| Home | Review balance and summary cards, explore the expense chart, and inspect category breakdowns and filtered operations. |
| History | Browse the selected month's operations grouped by day, search them, and open entries for editing. |
| Categories | Review monthly income and expense totals by category, edit category details, and archive or restore categories. |
| Accounts | Review account balances, edit account details, and archive or restore accounts. |

Use the month selector at the top of the panel to open the calendar and choose a period. Use the adjacent flag-and-currency button to change currency without changing the selected month or section. The selection lasts for the current plugin session. Account balances represent current balances, including when you browse an earlier month.

### Transfers between accounts

Open the operation form and select **Transfer**, then choose the source and destination accounts. At least two non-archived accounts are required. This form can access accounts in different currencies regardless of the header filter.

- For accounts in the same currency, enter one amount.
- For accounts in different currencies, enter both the source amount and the target amount. Exchange rates are not downloaded or calculated automatically.

Transfers update account balances directly. They do **not** create entries in transaction history or count toward income and expense totals.

## Data storage and privacy

The plugin does not make network requests, collect analytics, or send financial records to an external service. It has no built-in bank connection or synchronization service. Any backup or synchronization software you configure separately may copy these files according to its own settings.

Financial records are stored here by default:

```text
<vault>/.obsidian/plugins/financial-accounting/db/
├── accounts.json
├── categories.json
└── YYYY.json
```

| File | Contents |
| --- | --- |
| `accounts.json` | Account details, currencies, balances, and archive status |
| `categories.json` | Income and expense category definitions |
| `YYYY.json` | Transaction records organized by month for that year |

Plugin settings are saved separately in `data.json` in the plugin folder. A custom Obsidian configuration folder replaces `.obsidian` in these paths.

**Include the plugin's `db` folder and `data.json` in your backups.** These are plain JSON files, not encrypted by the plugin or stored as Markdown notes. Back them up before uninstalling the plugin or replacing its folder; copying only your notes will not preserve these records. When updating manually, replace the release files and retain your data files.

## Backup and restore

Open **Settings → Financial Accounting → Backup and restore**. The default folder is **Financial Accounting Backups** in the vault root. To change it, enter a visible vault-relative folder and select **Save folder**. Existing backups stay in their original folder.

**Create backup** saves one complete JSON file, for example `financial-accounting-backup-2026-10-19_14-35-22.json`. Names use local time; collisions receive a numeric suffix. Each copy contains all accounts and their balances, categories, all recorded years, settings, original IDs, creation time, plugin version and backup format version. The saved file is read back and verified. Existing copies are never overwritten or automatically deleted.

**Restore backup** lets you select a JSON file from the configured folder or from your device. After validation, review its date and record counts and explicitly confirm replacement. This replaces the full dataset and settings; it does not merge records or replay transactions against balances. Current year files absent from the backup are removed. The finance panel may generate empty years required by the restored initial-year setting when reopened.

Before replacement, a verified `financial-accounting-before-restore-…json` safety copy is saved in the current backup folder. If this fails, the restore does not start. If replacement fails, the previous files and settings are restored. A recovery journal retained after interruption allows the next plugin startup to retry rollback before opening financial views. If recovery itself fails, the plugin stops loading; retain the journal and safety copy and resolve the storage error before restarting.

Backups are plain JSON and contain private financial data. A copy in the same vault protects against accidental changes, but not loss of the vault or disk: copy the backup folder to another device or your separately configured backup service.

<!-- CSV history import disabled.
## CSV history import

Open **Settings → Financial Accounting → Import CSV**. Choose a CSV with a header row (UTF-8 or Windows-1251), then select an existing account and map the date, amount, and optional type, note, and currency columns. Comma, semicolon, and tab separators are supported, including quoted multiline notes. The limit is 5 MB and 10,000 data rows per import.

Choose the date order and decimal separator explicitly. Amounts may use spaces as thousands separators. Without a type column, negative amounts mean expenses and positive amounts mean income. With a type column, use `Expense` / `Income`, `Расход` / `Доход`, or `Debit` / `Credit`. A currency column, when selected, must match the account. Dates must fall between the initial accounting year in settings and the current year.

In the preview, assign existing categories individually or to all income/expense rows. Uncheck rows to exclude them. Possible duplicates match account, calendar date, type, and amount; they are unchecked initially but may be included explicitly. Invalid rows cannot be imported. No accounts, categories, or internal IDs are taken from the file.

**Import does not change current balances.** It creates ordinary operations with fresh IDs in the appropriate year and month. Later edits and deletions affect account balances exactly as they do for manually entered operations. Transfers between accounts are unchanged; the importer does not create or match transfers.

Writes are verified. If an import fails, its history changes are rolled back. A persistent recovery journal lets the next startup roll back an interrupted import. The CSV itself is only read.

-->

## Current limitations

- No exchange-rate feed, automatic conversion, or combined total across currencies.
- Changing the main currency does not recalculate past transactions or balances.
- Account balances are current, not historical snapshots for the selected month.
- Search is limited to the selected month.
- Transfers have no transaction history entries.
- Categories and accounts referenced by transaction history cannot be deleted. Archive them to retain their records.

## Development

Clone the repository and install its dependencies with Node.js and npm:

```sh
git clone https://github.com/DannyVeil/Financial-Accounting.git
cd Financial-Accounting
npm ci
npm test
npm run build
```

The build checks TypeScript and writes the plugin files and Twemoji license notices to `dist/`. Copy the contents of `dist/` into the plugin folder of a test vault to try the build. Flags are embedded in `main.js`; no separate image downloads are needed at runtime.

For development, `npm run dev` watches the TypeScript source and writes `main.js` to the repository root. The build copies the existing `styles.css`; it does not compile `styles.scss`.

### Checks before publishing

`npm test` runs isolated tests against an in-memory vault: first launch without settings or database, reopening without data loss, currency filtering, category totals, operation creation/editing/deletion, same- and cross-currency transfers, exact decimal arithmetic, invalid amounts, transfer write failures, CSV export, backup validation and round trips, safety-copy failures, restore rollback, startup recovery, and backup concurrency protection. Tests do not touch your financial records.

These tests mock the Obsidian API. Before a release, also check the interface in an actual desktop and mobile vault: create the first account and category, switch currencies and months, use all three operation tabs, and verify the layout in light and dark themes. In a test vault, also create a backup, review and cancel a restore, restore a backup, and choose a JSON file from the device.

Do not include `data.json` or `db/` in a release. Keep the package version, manifest version, and `versions.json` consistent when publishing a new version.

## Feedback and contributions

Report bugs and suggest improvements through [GitHub Issues](https://github.com/DannyVeil/Financial-Accounting/issues). For bug reports, include your Obsidian version, plugin version, platform, and steps to reproduce the problem. Use sample records instead of sharing private financial data.

Pull requests are welcome. For publishing requirements, see Obsidian's [plugin submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).

## License

[MIT](LICENSE) © 2026 [Bugayev Daniil](https://github.com/DannyVeil).

Flag artwork: Twemoji v17.0.3, © Twitter, Inc. and other contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [graphics license](src/assets/LICENSE-TWEMOJI.txt) and [attribution](src/assets/README.md).
