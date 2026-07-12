# Archivum

Base de conhecimento navegável da sua codebase — estilo "Swagger + mapa de
arquitetura + wiki". App desktop que fica na bandeja, abre por atalho como um
painel lateral, e guarda a documentação como arquivos `.md` numa pasta que você
escolhe (modelo "vault", portátil: copiou a pasta, abriu em outro PC, funciona).

## Stack
- **Tauri 2** (casca + busca em Rust) + **React + TypeScript** (UI e lógica).
- Busca: **Tantivy** (Rust) — BM25, fuzzy, stemming, snippet.
- Toda a lógica de documentos é TypeScript. O Rust é mínimo e está explicado em
  [`RUST_EXPLAINED.md`](./RUST_EXPLAINED.md).

## Pré-requisitos (Windows)
- Node 20+ (este projeto usa NVS: `nvs use 20`).
- Rust (`rustup`, toolchain `stable-x86_64-pc-windows-msvc`).
- Visual Studio com workload **Desktop development with C++** (fornece o linker MSVC).
- WebView2 (já vem no Windows 10/11).

## Rodar em desenvolvimento
```bash
nvs use 20
npm install
npm run tauri dev
```

## Build do instalador
```bash
npm run tauri build
```

## Estrutura
- `src/` — frontend React + lógica de documentos (TypeScript).
- `src-tauri/` — backend Rust (janela, bandeja, atalho, comandos de arquivo, busca).
- `RUST_EXPLAINED.md` — cada parte do Rust explicada em português.
