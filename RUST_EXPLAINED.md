# RUST_EXPLAINED — o backend do Archivum, explicado em português

Você não precisa saber Rust pra mexer no Archivum. A lógica do dia a dia
(documentos, UI, vínculos) é toda **TypeScript**. O Rust faz só:

1. a **casca** do app (janela, ícone na bandeja, atalho global);
2. uns **comandos de arquivo** curtos (ler/escrever/listar `.md`);
3. o **motor de busca** (Tantivy), que é em Rust por velocidade.

Este arquivo explica cada pedaço de Rust conforme ele é criado, fase a fase.

---

## Conceitos rápidos de Rust (o mínimo)

- **`fn nome(args) -> Tipo { ... }`** — declara função. `-> Tipo` é o retorno.
- **`#[algo]`** — um "atributo": metadado que liga um comportamento extra.
  Ex.: `#[tauri::command]` marca a função como chamável pelo TypeScript.
- **`let x = ...;`** — variável (imutável por padrão; `let mut x` p/ mutável).
- **`format!("... {var} ...")`** — monta string (tipo template string do JS).
- **`.expect("msg")`** — se der erro, encerra mostrando a msg. Usado no boot.
- **`pub`** — torna algo público (visível fora do arquivo/módulo).
- **`mod nome;`** — importa outro arquivo Rust como módulo.
- **`//`** — comentário de linha.

Como TS chama Rust: no TS você faz `invoke("nome_do_comando", { args })`;
no Rust existe uma `fn nome_do_comando(...)` marcada com `#[tauri::command]`
e registrada em `invoke_handler`. É essa a ponte entre os dois mundos.

---

## Fase 0 — esqueleto

Arquivos Rust criados:

### `src-tauri/src/main.rs`
Ponto de entrada do executável.
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { archivum_lib::run() }
```
- A 1ª linha: **em release no Windows**, esconde a janela de console preta que
  apareceria atrás do app. Em modo dev ela fica visível (útil p/ ver logs).
- `main` só chama `run()` da nossa biblioteca (próximo arquivo).

### `src-tauri/src/lib.rs`
O coração. Hoje tem só um comando de teste e o boot do app.
```rust
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Olá, {name}! O backend Rust do Archivum está rodando.")
}
```
- `greet` recebe um texto e devolve outro. O `&str` é "uma referência a texto"
  (não precisa entender a fundo agora: é uma string de entrada).
- O frontend chama assim: `invoke("greet", { name: "Vitor" })`.

```rust
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app Archivum");
}
```
- `Builder::default()` começa a configurar o app.
- `.invoke_handler(generate_handler![greet])` registra **quais** comandos o TS
  pode chamar. Cada comando novo entra nessa lista.
- `generate_context!()` lê o `tauri.conf.json` na hora de compilar.
- `.run(...)` sobe a janela e fica rodando. `.expect(...)` aborta com mensagem
  se algo falhar no boot.

### `src-tauri/Cargo.toml`
É o "package.json do Rust": nome, versão e dependências (crates).
Hoje: `tauri`, `serde`, `serde_json`. Mais crates entram nas próximas fases
(`tauri-plugin-global-shortcut`, `tantivy`, etc.).
O bloco `[profile.release]` deixa o binário final menor e mais leve — importante
porque o app fica sempre aberto na bandeja.

### `src-tauri/tauri.conf.json`
Config do app (JSON, não Rust): nome, identificador, tamanho da janela, ícones,
e os comandos de build do frontend. Hoje a janela é normal (com borda) só para
validar; na Fase 1 ela vira o painel lateral sem borda.

### `src-tauri/capabilities/default.json`
Sistema de **permissões** do Tauri 2. Por segurança, o frontend só pode usar o
que estiver liberado aqui. Hoje: `core:default` (o básico da janela). Quando
entrarem atalho global, diálogo de pasta e arquivos, novas permissões são
adicionadas nesta lista.

---

---

## Fase 1 — painel na bandeja (tray + atalho + janela sem borda)

Tudo isso está em `src-tauri/src/lib.rs`. Conceitos novos:

### `use ...;`
Importa tipos prontos do Tauri (menu, bandeja, posição) e do plugin de atalho.
É como `import { ... }` no TS.

### `toggle_painel(app)`
Função que mostra OU esconde a janela "main".
```rust
if win.is_visible().unwrap_or(false) { win.hide() } else { win.show(); win.set_focus() }
```
- `unwrap_or(false)`: se não der pra saber se está visível, assume "não".
- Antes de mostrar, reposiciona no canto (função abaixo).

### `posicionar_canto_superior_direito(win)`
Calcula onde colar a janela: pega o monitor atual, seu tamanho e fator de DPI,
e põe a janela encostada à direita, um pouco abaixo do topo. Funciona com vários
monitores porque soma `monitor.position()` (o canto daquele monitor).

### `run()` — agora com 4 blocos novos

1. **Atalho global** (`.plugin(global_shortcut::Builder...)`)
   - `Shortcut::new(Some(CONTROL | SHIFT), Code::Space)` = Ctrl+Shift+Space.
   - `with_handler(|app, _, event| { if event.state()==Pressed { toggle_painel(app) } })`
     roda toda vez que o atalho é apertado.
   - O registro de fato acontece no `setup` (`app.global_shortcut().register(atalho)`).

2. **Eventos de janela** (`.on_window_event`)
   - `WindowEvent::Focused(false)` → perdeu foco → `window.hide()` (hide-on-blur).
   - `WindowEvent::CloseRequested { api, .. }` → `api.prevent_close()` cancela o
     fechamento e em vez disso esconde. É o que mantém o app vivo na bandeja.

3. **Setup → bandeja** (`TrayIconBuilder`)
   - `MenuItem::with_id(app, "mostrar", "Mostrar Archivum", true, None)` cria um
     item de menu com um id ("mostrar") que reconhecemos depois.
   - `Menu::with_items(app, &[&item1, &item2])` junta os itens.
   - `.icon(app.default_window_icon().unwrap().clone())` usa o ícone do app.
   - `.show_menu_on_left_click(false)` → clique esquerdo NÃO abre menu (ele alterna
     o painel); o menu sai no clique direito.
   - `.on_menu_event(... match event.id() ...)` → trata "mostrar"/"sair".
   - `.on_tray_icon_event(...)` → no clique esquerdo (`MouseButton::Left` +
     `MouseButtonState::Up`) chama `toggle_painel`.

4. **Mostra uma vez** no fim do setup, pra você ver que subiu.

### Mudanças fora do Rust nesta fase
- `tauri.conf.json`: a janela agora é `decorations:false` (sem borda),
  `visible:false` (começa escondida, mora na bandeja), `alwaysOnTop:true`,
  `skipTaskbar:true`.
- `capabilities/default.json`: liberadas permissões `core:window:allow-hide/show/
  set-focus/start-dragging` e `global-shortcut:default` (o frontend pode esconder
  a janela no Esc e arrastar pelo header `data-tauri-drag-region`).
- `Cargo.toml`: `tauri` ganhou a feature `tray-icon` e entrou o crate
  `tauri-plugin-global-shortcut`.

---

---

## Fase 2 — arquivos do vault (comandos fs) + diálogo de pasta

### Arquivo novo: `src-tauri/src/fs_commands.rs`
São 7 funções curtas que o TypeScript chama para mexer nos `.md`. Nenhuma
entende de "documento"/frontmatter — isso é trabalho do TS. Aqui é só I/O.

- `#[derive(Serialize)]` nas structs `DocFile`/`VaultScan`: ensina o Rust a
  converter esses dados para JSON automaticamente (pro frontend receber).
- `safe_join(root, rel)`: **barreira de segurança**. Junta a pasta do vault com
  um caminho relativo e RECUSA `..` ou caminhos absolutos. Assim o frontend nunca
  consegue ler/escrever fora do vault.
- `scan_vault(root)`: usa `WalkDir` pra varrer tudo recursivamente; separa pastas
  de arquivos `.md`; pula a pasta interna `.archivum`. Devolve a lista pronta.
- `read_doc_file` / `write_doc_file` / `create_dir` / `rename_path` /
  `remove_path`: ler, gravar (criando pastas-pai), criar pasta, mover/renomear,
  apagar. `write` e `rename` chamam `create_dir_all` pra garantir a pasta destino.
- `Result<T, String>`: cada comando devolve "deu certo (T)" **ou** "deu erro
  (texto)". No TS isso vira Promise que resolve ou rejeita.

Como o TS chama (ex.): `invoke("scan_vault", { root })`. Os nomes dos argumentos
no objeto JS (`root`, `rel`, `content`, `from`, `to`, `recursive`) batem com os
nomes dos parâmetros da função Rust.

### `lib.rs` — o que mudou
- `mod fs_commands;` "puxa" o arquivo acima como módulo.
- `.plugin(tauri_plugin_dialog::init())` liga o diálogo nativo de pasta
  (o frontend abre com `open({ directory: true })`).
- Os 6 comandos de arquivo entraram no `generate_handler![...]`.

### Auto-hide controlável (consertando o sumiço no diálogo)
Problema: ao abrir o diálogo de pasta, o painel perdia o foco e se escondia.
Solução, em Rust:
- `struct AutoHide(AtomicBool)`: um booleano compartilhado e seguro entre threads.
- `.manage(AutoHide(AtomicBool::new(true)))`: registra esse estado no app.
- `allow_autohide(state, enabled)`: comando que liga/desliga o auto-hide.
- No evento `Focused(false)`, antes de esconder, lemos o booleano: se estiver
  desligado, **não** esconde.
- O TS desliga (`allow_autohide(false)`) antes de abrir o diálogo e religa depois
  (no `finally`).

`Ordering::Relaxed` é só o "nível de sincronização" da leitura/escrita do
booleano — pro nosso caso (uma flag simples), Relaxed basta.

---

---

## Fases 3 e 4 — sem Rust novo

A visualização rica (markdown, code highlight, vínculos/backlinks) e o CRUD
(criar/editar/excluir/mover/favoritar) são **100% TypeScript**, usando os comandos
de arquivo da Fase 2. Nenhuma linha de Rust mudou nessas fases.

---

## Fase 5 — busca full-text (Tantivy)

Arquivo novo: `src-tauri/src/search.rs`. É o pedaço de Rust mais "denso", então
vai com calma.

### A ideia
O TS já tem os documentos parseados. Em vez de o Rust reparsear, o frontend
**manda os campos prontos** para indexar. O Rust monta um índice de busca
**em memória** e responde consultas com ranking + trecho destacado.

### Tipos
- `IndexItem` (`#[derive(Deserialize)]`): o que o TS envia por documento — id,
  title, type, tags, headings, body. O `#[serde(rename = "type")]` é porque
  `type` é palavra reservada em Rust, então o campo Rust chama `type_`.
- `SearchHit` (`#[derive(Serialize)]`): o que devolvemos — id, score (relevância)
  e snippet (HTML com `<b>` nos trechos que casaram).

### Estado compartilhado
- `struct BuiltIndex` guarda o índice montado + os "campos" (Field) do schema.
- `struct SearchState(Mutex<Option<BuiltIndex>>)`: o índice atual, protegido por
  `Mutex` (só um acesso por vez). Começa `None` (sem índice). Registrado no app
  com `.manage(...)` no lib.rs.

### `analyzer()` — como o texto é quebrado
Uma `TextAnalyzer` que: separa palavras (`SimpleTokenizer`), descarta tokens
gigantes, passa para minúsculas (`LowerCaser`) e aplica **stemming português**
(`Stemmer`), que reduz "balanços"/"balanço" ao mesmo radical. Assim a busca
casa variações da palavra.

### `reindex(state, items)` — comando
1. Define o **schema** (quais campos e como indexar). Campos de texto usam nosso
   tokenizer; `title` e `body` também são `STORED` (guardados) para gerar snippet
   e devolver o id.
2. `Index::create_in_ram(schema)` cria o índice na memória.
3. Registra o tokenizer custom no índice.
4. Um `writer` adiciona cada documento (`add_text`) e dá `commit()`.
5. Guarda tudo no `SearchState`. Devolve quantos indexou.

### `search_docs(state, query)` — comando
1. Pega o índice do estado (se não houver, devolve lista vazia).
2. `QueryParser` busca em vários campos. `set_field_boost` dá **pesos**: título
   pesa 3x, tags 2x, tipo/headings 1.5x, corpo 1x → resultados melhores no topo.
   O ranking em si é **BM25** (padrão do Tantivy).
3. Se a query tiver sintaxe estranha, tentamos de novo só com letras/números
   (não quebra a busca).
4. `TopDocs::with_limit(30)` pega os 30 melhores.
5. `SnippetGenerator` cria o **trecho destacado** do corpo (ou do título, ou o
   começo do corpo como fallback). `to_html()` põe `<b>` nos termos achados.
6. Devolve os hits (id + score + snippet) — o TS casa o id com o documento para
   mostrar título/tipo.

### Mudanças fora do Rust
- `Cargo.toml`: entrou o crate `tantivy`.
- `lib.rs`: `mod search;`, `.manage(SearchState)` e os comandos `reindex` /
  `search_docs` no `generate_handler`.
- No TS, `lib/search.ts` extrai os headings (linhas `#`), monta os itens e chama
  `reindex` sempre que o vault carrega/atualiza; a Sidebar chama `search_docs`
  enquanto você digita.

---

---

## Fase 6 — polimento (atalho configurável + autostart)

A maior parte da Fase 6 é TypeScript (drag-drop na árvore, grafo de vínculos,
tela de Settings). No Rust mudaram só duas coisas em `lib.rs`:

### `set_shortcut(app, accelerator)` — comando
Permite trocar o atalho global em tempo de execução (a tela de Settings chama).
```rust
let scut = Shortcut::from_str(&accelerator)?;  // "Ctrl+Shift+Space" -> Shortcut
let gs = app.global_shortcut();
let _ = gs.unregister_all();                   // tira o atalho anterior
gs.register(scut)                              // põe o novo
```
`Shortcut::from_str` converte o texto digitado pelo usuário num atalho. Se o texto
for inválido, devolvemos o erro (a UI mostra "Atalho inválido"). O handler que
abre/fecha o painel (definido na Fase 1) continua valendo para o novo atalho.

### Plugin de autostart
```rust
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None,
))
```
Liga o recurso "iniciar com o sistema". Quem realmente ativa/desativa é o frontend
(`enable()`/`disable()` do plugin JS), liberado pela permissão `autostart:default`
no `capabilities/default.json`.

### Build do instalador
`npm run tauri build` compila em modo **release** (otimizado, usando o perfil
`[profile.release]` do Cargo.toml) e empacota os instaladores do Windows
(`.msi` via WiX e `.exe` via NSIS) em `src-tauri/target/release/bundle/`.

---

Fim do panorama de Rust. Resumo do que o Rust faz no Archivum:
**janela + bandeja + atalho global** (Fase 1), **comandos de arquivo** (Fase 2),
**busca Tantivy** (Fase 5) e **atalho configurável + autostart** (Fase 6).
Todo o resto — documentos, frontmatter, UI, vínculos, CRUD — é TypeScript.
