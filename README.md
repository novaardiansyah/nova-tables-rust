# Nova Tables

Hi Future Developer,

Welcome to **Nova Tables**, a modern, high-performance desktop SQL client for **Microsoft SQL Server** built with **Tauri v2** and **Rust 2021**. It brings your connections, databases, tables, queries and results together in one calm workspace, so you can focus on the work instead of the tooling.

Nova Tables is made for people who work with Microsoft SQL Server every day and simply want a tidy place to look something up, write a query and read the answer. By moving from Electron to Tauri and Rust, it delivers lightweight binary sizes, lower memory consumption (~60–80MB), and instant native startup.

> **Note:** Nova Tables works with Microsoft SQL Server only. It is a local desktop application — nothing is uploaded anywhere, and neither your data nor your credentials ever leave your computer.

---

## Screenshots

Every image below is captured from Nova Tables 2.1.0 connected to a local SQL Server test database.

### Your connections, recent sessions and folders in one place

The connection screen keeps the whole tree together: a recent-connection card for one-click access, environment badges, collapsible folders and a quick connect button that jumps straight into a session.

![Connections](./public/demo/connections.png)

### Select several connections for bulk actions

Ticking rows reveals a floating action bar, so a group of connections — or a whole folder with everything inside it — can be exported, moved or deleted in one go.

![Connection selection](./public/demo/connections-selection.png)

### Export connections and their folders as one encrypted file

The export dialog previews exactly what will be written, including nested folders, before you set the passphrase.

![Export connections](./public/demo/export-connections.png)

### Import the file on another machine with the same password

Importing asks only for the passphrase; folders are recreated and duplicate names get a safe suffix.

![Import connections](./public/demo/import-connections.png)

### A new connection, tested before it is saved

Connection details, environment and TLS options live in a single form with a test button that reports the server version before the connection is stored.

![New connection](./public/demo/new-connection.png)

### A calm workspace: editor above, results below

The Monaco SQL editor keeps syntax highlighting, completion and line numbers, while the resizable results grid stays in view. The header holds the database picker, execution guard, estimated plan and the run button.

![Workspace](./public/demo/workspace.png)

### Right-click a table for object actions

Opening a new tab, scripting a table as `CREATE`, inspecting its structure, renaming, cloning, truncating or dropping it all start from the sidebar context menu.

![Table context menu](./public/demo/table-menu.png)

### Inspect and change table structure in the table designer

Columns, lengths, defaults, nullability, identity, primary keys, unique keys and foreign keys are editable side by side, with generated DDL ready to review before it is applied.

![Table designer](./public/demo/table-designer.png)

### Edit a whole block of cells at once

Browse a table and type directly into the grid; changed cells stay highlighted, and a counter keeps track of how many edits are pending.

![Editing cells](./public/demo/cell-editing.png)

### Ready-to-run UPDATE statements from your edits

No edit is written silently. Reviewing changes shows the exact `UPDATE` statements generated per row, with the primary key in the `WHERE` clause, and lets you discard or apply them.

![Generated UPDATE statements](./public/demo/changes.png)

### Read a row as a JSON record

The inspect dialog formats any row or selection as JSON, with raw, wrapped and XML views for long values.

![JSON viewer](./public/demo/json-viewer.png)

### Right-click a cell for inspect, copy and export actions

The cell menu covers value inspection, filtering by the cell value, copying as text, JSON or `INSERT`, and exporting just the current selection.

![Cell context menu](./public/demo/cell-menu.png)

### Revisit what you ran with query history

Every execution is logged locally with row count, duration and errors, scoped to the active database and searchable.

![Query history](./public/demo/query-history.png)

### Customise themes, fonts and editor typography

Preferences cover light and dark palettes, app, grid, JSON and editor fonts, sizes, timezone and editor wrapping — persisted to the local SQLite store.

![Settings dialog](./public/demo/settings.png)

---

## Dazzling Tech Stack

- [Tauri v2](https://v2.tauri.app/) — Native desktop application framework
- [Rust 2021](https://www.rust-lang.org/) — High-performance native backend
- [React 18](https://react.dev/) — Sandboxed reactive UI
- [TypeScript](https://www.typescriptlang.org/) — Strict TypeScript frontend with explicit data contracts
- [Vite 5](https://vitejs.dev/) — Fast frontend build tool and dev server
- [Tailwind CSS](https://tailwindcss.com/) — Clean, semantic styling tokens
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — Editor engine, the same one behind VS Code
- [rusqlite](https://github.com/rusqlite/rusqlite) — Embedded SQLite store with WAL journal mode
- [tiberius](https://github.com/prisma/tiberius) & [tokio](https://tokio.rs/) — Native asynchronous TDS protocol for SQL Server
- [Microsoft SQL Server](https://www.microsoft.com/en-us/sql-server/) — Supported database engine

---

## What You Can Do

- **Connection Management**: Organize SQL Server connections with environment badges and collapsible, nested folders.
- **Recent Sessions & Quick Connect**: Jump back into recent connections with timestamp badges and dedicated quick-connect actions.
- **Encrypted Export & Import**: Password-protect your connection tree using AES-256-GCM and PBKDF2 encryption.
- **Tree Deletion Safety**: Safely delete entire folders and connection subtrees with atomic cascading in SQLite.
- **Database Navigation**: Browse databases with searchable filtering, and explore tables, views, stored procedures, and functions in a fast sidebar tree.
- **Monaco SQL Editor**: Write queries with syntax highlighting, auto-completion, line wrapping, execution guards (`silent`, `alert-readonly`, `alert`), and `Ctrl+R` re-run shortcut.
- **Table Designer**: Inspect and alter table structures visually with column drag-and-drop reordering, searchable data types, and foreign key reference pickers.
- **Interactive Results Grid**: View results with three-state column sorting, quick filtering by cell value, and foreign key link navigation.
- **In-Grid Row Editing & Deletion**: Edit cells or mark rows for deletion directly in the grid. Generate verifiable `UPDATE` and `DELETE` SQL statements without silent background modifications.
- **Execution Plan Inspection**: Analyze query performance with estimated visual execution plan trees (cost analysis and XML).
- **Exporting & History**: Export query results directly to RFC 4180 CSV or formatted JSON, and review query history anytime.
- **Theme & Typography**: Switch between dark and light themes (default: `Light Nova`), with responsive auto-detected font sizes (12px laptop / 14px large displays) persisted directly to SQLite.

---

## Quick Start & Development

### Prerequisites

- Node.js (v18+) & `npm`
- Rust toolchain (`cargo`, `rustc` 2021 edition)
- System libraries for Tauri on Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### Development Commands

```bash
# Install frontend dependencies
npm install

# Run Vite dev server with Tauri desktop window and HMR
make dev

# Build frontend assets with Vite
make compile

# Build and package the release binary (AppImage, deb, rpm)
make build

# Build the Windows NSIS installer from Linux (cargo-xwin + makensis)
make build-win

# Copy the generated installers into build/<version>/
make artifacts

# Install locally to ~/.local/opt/nova-tables and add desktop launcher
make deploy
```

---

## Good to Know

- Saved connections live strictly on your computer inside the OS application data directory (`~/.local/share/nova-tables/connections.sqlite` on Linux or `%APPDATA%\nova-tables\connections.sqlite` on Windows).
- Passwords stored locally are isolated within the SQLite database.
- Several connections can stay open at once, and the one on screen owns the tree and tabs.
- Editing and row deletion are available for tables with a primary key, ensuring generated SQL statements accurately target primary key columns.
- Query execution and history remain 100% offline and local.

---

## Let's Connect

Need to chat? Feel free to drop me a line via [Email](mailto:novaardiansyah78@gmail.com) or hit me up on [WhatsApp](https://wa.me/6289506668480). I'm just a message away, ready to groove with you!

---

## Project Status

![stages](https://img.shields.io/badge/stages-production-informational)
![Tauri](https://img.shields.io/badge/Tauri-v2-blue)
![Rust](https://img.shields.io/badge/Rust-2021-orange)
![React](https://img.shields.io/badge/React-18-blue)
![SQL Server](https://img.shields.io/badge/SQL%20Server-^2022-blue)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Code of Conduct

We believe in fostering a welcoming and inclusive environment for everyone. Please be respectful, considerate, and constructive in all interactions. By participating in this project, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Let's collaborate and make this community awesome together!

---

## Licensing Groove

This project is grooving to the rhythm of the [MIT License](LICENSE).

Feel free to use, modify, and share it with the world. Just remember to keep the original license intact. Let's spread the joy of coding together!

---

**Happy coding and collaborating!**  
- Nova Ardiansyah
