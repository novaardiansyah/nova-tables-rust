# Nova Tables

Hi Future Developer,

Welcome to **Nova Tables**, a modern, high-performance desktop SQL client for **Microsoft SQL Server** and **MySQL** built with **Tauri v2** and **Rust 2021**, backed by a synchronized companion API. It brings your connections, databases, tables, queries, and results together in one calm workspace, so you can focus on the work instead of the tooling.

Nova Tables is crafted for developers and database administrators who work with Microsoft SQL Server and MySQL every day and simply want a fast, tidy place to explore schemas, write queries, and inspect results. Built natively with Tauri and Rust, it delivers ultra-lightweight binaries, minimal memory consumption (~60–80MB), instant startup, and bank-grade client-side encryption.

> **Note:** Nova Tables supports Microsoft SQL Server and MySQL (including MariaDB). Database queries and connections communicate directly from your local machine to your database instances database credentials are encrypted with AES-256-GCM on the client before synchronization, ensuring your database credentials remain entirely private.

---

## Screenshots

Every screenshot below illustrates Nova Tables running live across authentication, connection management, query execution, and preferences.

### Secure Authentication & Google OAuth 2.0

Sign in smoothly using your email and password or authenticate with one click via Google OAuth 2.0. The desktop app securely listens on an ephemeral loopback port for the OAuth callback, with single-flight access token rotation and seamless background refresh.

![Desktop Login Page](./public/demo/v2.2.4/desktop-login-page.png)

### Branded Google OAuth Flow

OAuth authentication opens directly in your browser with immediate visual confirmation upon authorization, cleanly redirecting your session back into the desktop client.

<img src="./public/demo/v2.2.4/google-login-succes.png" alt="Google Login Success" width="200px">

### Your Connections, Folders, and Sessions

The connection screen organizes your databases into a structured tree with environment tags (`Production`, `Staging`, `Development`), folder hierarchies, and one-click quick connect.

![Connection Existing State](./public/demo/v2.2.4/connection-existing-state.png)

### A New Connection, Tested Before It Is Saved

Configure host, port, credentials, default database, and TLS encryption in a single, intuitive dialog. The live test button verifies connection parameters and confirms the database engine version before saving.

![Add New Connection](./public/demo/v2.2.4/connection-add-new.png)

### Starting Clean: Empty Connection State

When setting up Nova Tables for the first time or onboarding a new environment, a clean empty state offers quick actions to create your first connection or import an existing configuration file.

![Empty Connection State](./public/demo/v2.2.4/connection-empty-state.png)

### Encrypted Configuration Export

Export your connection trees, folders, and saved configurations into an encrypted JSON package protected by PBKDF2 (SHA-256, 100,000 iterations) and AES-256-GCM encryption.

![Export Configuration](./public/demo/v2.2.4/settings-export-configuration.png)

### Seamless Configuration Import

Import configuration files onto any workstation with your passphrase. Folders are automatically reconstructed, duplicate names are safely disambiguated, and connection credentials are restored.

![Import Configuration](./public/demo/v2.2.4/settings-import-configuration.png)

### A Calm Workspace: Editor, Tabs, and Results

The Monaco SQL editor features dialect-aware syntax highlighting, autocomplete, and horizontal drag-and-drop tab reordering. Query tabs can be rearranged freely while preserving editor contents, unsaved markers, and execution state.

![Workspace Form Viewer](./public/demo/v2.2.4/workspace-form-viewer.png)

### Query Execution Safeguards

Protect against unintentional modifications on critical production databases using execution guard modes (`Silent`, `Alert (Read-Only)`, and `Alert`). The execution guard prompts you to review and confirm write operations before they run.

![Query Confirmation Modal](./public/demo/v2.2.4/workspace-query-confirmation.png)

### Execution Guard Modes

Switch execution guard modes quickly right from the workspace header to balance execution speed during development with safety during production maintenance.

![Workspace Secure Options](./public/demo/v2.2.4/workspace-secure-options.png)

### Form Viewer for Detailed Records

Inspect single records as an editable vertical form with column data types and auto-resizing textareas that make reading multiline text and JSON values easy.

![Form Viewer](./public/demo/v2.2.4/workspace-form-viewer.png)

### Dedicated JSON Viewer

Analyze structured JSON values with collapsible syntax highlighting, formatted indentation, and one-click copying.

![JSON Viewer](./public/demo/v2.2.4/workspace-json-viewer.png)

### Contextual Cell Actions & Fast Exports

Right-click any cell in the results grid to inspect values, copy text, export selections as JSON or SQL `INSERT` statements, or delete rows with generated preview statements.

![Cell Actions Menu](./public/demo/v2.2.4/workspace-cell-actions.png)

### Save Queries for Quick Reuse

Save frequently executed queries with custom names and database associations, accessible directly from the workspace sidebar.

![Save Query](./public/demo/v2.2.4/workspace-save-query.png)

### Searchable Query History

Every executed query is logged with execution duration, row counts, timestamps, and error messages, scoped to your active database and searchable for auditing.

![Query History](./public/demo/v2.2.4/workspace-query-history.png)

### User Profile and Secure Sign-Out

Your full name and user profile are prominently shown in the application interface, with an explicit confirmation dialog when signing out to prevent accidental session termination.

![Sign Out Confirmation](./public/demo/v2.2.4/desktop-signout-confirmation.png)

### Customise Preferences, Typography, and Themes

Fine-tune typography, editor font sizes, results grid fonts, timezone alignment (Asia/Jakarta UTC+7), and theme palettes to tailor the environment to your workstation.

![Preferences](./public/demo/v2.2.4/settings-preferences.png)

### Keyboard Shortcuts at Your Fingertips

A comprehensive shortcut sheet lets you master keyboard navigation for running queries (<kbd>Ctrl</kbd>+<kbd>Enter</kbd> / <kbd>Cmd</kbd>+<kbd>Enter</kbd>), switching tabs, navigating results, and formatting code.

![Keyboard Shortcuts](./public/demo/v2.2.4/help-keyboard-shortcut.png)

---

## Dazzling Tech Stack

- [Tauri v2](https://v2.tauri.app/) - High-performance desktop application runtime and security framework
- [Rust 2021](https://www.rust-lang.org/) - Direct database networking and local OS integrations
- [React 18](https://react.dev/) - Sandboxed reactive UI with component modularity
- [TypeScript](https://www.typescriptlang.org/) - Strict typing with explicit data models and zero `any` types
- [Vite 5](https://vitejs.dev/) - Lightning-fast frontend build system and HMR
- [Tailwind CSS](https://tailwindcss.com/) - Consistent semantic styling tokens
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code's robust code editing engine with SQL dialect support
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) - Client-side AES-256-GCM and PBKDF2 encryption for connection passwords
- [Laravel 13 Companion API](https://laravel.com/) - Persistent synchronization for connections, folders, query history, and user settings via Laravel Sanctum & Socialite
- [Tiberius](https://github.com/prisma/tiberius) & [tokio](https://tokio.rs/) - Direct asynchronous TDS protocol driver for Microsoft SQL Server
- [Mysql Async](https://github.com/blackbeam/mysql_async) - Direct asynchronous driver for MySQL and MariaDB
- [Microsoft SQL Server](https://www.microsoft.com/en-us/sql-server/) & [MySQL](https://www.mysql.com/) - Supported database engines

---

## What You Can Do

- **Connection Management**: Organize SQL Server and MySQL connections with driver badges, environment badges, and collapsible folders.
- **Client-Side Encryption**: Protect database credentials locally with client-side AES-256-GCM encryption before persistence or synchronization.
- **Google OAuth 2.0 & Email Authentication**: Authenticate via Google OAuth or email credentials with automatic token rotation and transparent refresh.
- **Drag-and-Drop Query Tabs**: Reorder query tabs horizontally while keeping active buffers, cursor positions, and result sets intact.
- **Database Navigation**: Explore schemas, tables, views, stored procedures, functions, and table relationships in a fast sidebar tree.
- **Monaco SQL Editor**: Write queries with syntax highlighting, autocomplete, line wrapping, execution guards (`Silent`, `Alert (Read-Only)`, `Alert`), and estimated plan analysis.
- **Table Designer**: Inspect and alter table structures visually with column types, nullability, defaults, primary keys, and foreign key references.
- **Interactive Results Grid**: Filter results with dual-driver query filtering (bracket vs. backtick quoting, Unicode string escapes), column sorting, and cell inspector.
- **Verifiable In-Grid Editing**: Edit cells or mark rows for deletion directly in the grid. Generate verifiable `UPDATE` and `DELETE` SQL statements without silent background modifications.
- **Execution Plan Inspection**: Inspect query performance with visual estimated execution plans on Microsoft SQL Server.
- **Exporting & Query History**: Export query results directly to CSV or JSON, and review detailed query execution logs anytime.
- **Preferences & Themes**: Customize dark and light themes, typography, display scaling, and timezone settings.

---

## Good to Know

- Direct database connections (`tiberius` for SQL Server and `mysql_async` for MySQL) are established directly from your local machine to your target servers.
- Database passwords are encrypted client-side using AES-256-GCM with PBKDF2 key derivation and are decrypted only in memory when establishing direct database sessions.
- Application state (connections, folders, query history, and preferences) is synchronized securely through the companion Laravel API with Sanctum access token rotation.
- In-place grid edits never write directly to the database without review; they generate verifiable SQL statements with primary key `WHERE` clauses.
- Estimated execution plans are supported natively for Microsoft SQL Server connections.

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
![MySQL](https://img.shields.io/badge/MySQL-^8.0-blue)
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
