# Archivum

A desktop knowledge base for your codebase — part Swagger, part architecture map,
part wiki. Archivum lives in the system tray, pops up as a slide-in side panel
via a global shortcut, and stores your docs as plain `.md` files in a folder you
choose (a portable "vault" — zip it, hand it to a teammate, open it on another
machine, everything just works).

## Features

- **Tray-first workflow** — global shortcut or tray click opens a frameless,
  always-on-top side panel. Pin it, expand it to a full window, or tuck it back
  away without ever closing the app.
- **Plain-Markdown vault** — every document is a `.md` file with YAML
  frontmatter (`id`, `title`, `type`, `tags`, `links`). No database, no lock-in;
  the vault is just a folder.
- **Fast full-text search** — powered by [Tantivy](https://github.com/quickwit-oss/tantivy)
  (Rust): BM25 ranking, fuzzy matching, PT/EN stemming, field boosting, and
  highlighted snippets.
- **Wikilinks & backlinks** — link documents with `[[id|alias]]`, autocomplete
  while typing, and see backlinks/related docs automatically.
- **Graph view** — an Obsidian-style force-directed graph of the whole vault,
  plus a per-document "ego graph" of direct connections.
- **Smart folder scanning** — build/VCS noise (`node_modules`, `.git`,
  `target`, `dist`, …) is pruned automatically so pointing Archivum at a large
  repo stays instant. Folders can also be favorited or manually ignored.
- **Split-view editor** — CodeMirror-based markdown editor with a formatting
  toolbar and a live preview pane, side by side or full width.
- **Portable by design** — per-vault settings (ignored/favorite folders) are
  stored inside the vault itself (`.archivum/config.json`), so the whole thing
  travels with the folder.

## Tech stack

- **[Tauri 2](https://tauri.app/)** for the native shell — window management,
  system tray, global shortcuts, and file I/O.
- **React + TypeScript** for the UI and all document/vault logic.
- **Rust** only where it earns its keep: the app shell and the Tantivy search
  index. Every Rust module is commented and explained (in Portuguese) in
  [`RUST_EXPLAINED.md`](./RUST_EXPLAINED.md).

## Getting started

### Prerequisites (Windows)

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (`stable-x86_64-pc-windows-msvc` toolchain)
- Visual Studio Build Tools with the **Desktop development with C++** workload
  (provides the MSVC linker)
- WebView2 (preinstalled on Windows 10/11)

### Run in development

```bash
npm install
npm run tauri dev
```

### Build the installer

```bash
npm run tauri build
```

Produces an NSIS `.exe` and an `.msi` installer under
`src-tauri/target/release/bundle/`. See [`build.ps1`](./build.ps1) for a
one-shot script that also bumps the version and copies the installer to the
project root.

## Project structure

```
Archivum/
├─ src/                  React + TypeScript frontend
│  ├─ components/        UI components (sidebar, editor, graph, viewer…)
│  ├─ store/             Zustand stores (vault, navigation, context menu)
│  └─ lib/                Vault/document/search logic, Tauri API wrappers
├─ src-tauri/             Rust backend
│  └─ src/
│     ├─ lib.rs           App setup: tray, global shortcut, window behavior
│     ├─ fs_commands.rs   Sandboxed vault file I/O
│     └─ search.rs        Tantivy index + query engine
└─ RUST_EXPLAINED.md      Every Rust module explained in Portuguese
```

## License

No license has been set for this project yet.
