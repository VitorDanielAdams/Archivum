// ============================================================================
// Archivum — backend Rust.
// FASE 1: o app vira um "painel" que vive na bandeja.
//   - ícone na bandeja (system tray) com menu (Mostrar / Sair);
//   - atalho global Ctrl+Shift+Space abre/fecha o painel;
//   - janela SEM borda, sempre-no-topo, ancorada no canto superior direito;
//   - perde o foco -> esconde (hide-on-blur);
//   - clicar no "X" -> esconde em vez de fechar (app continua na bandeja).
// ============================================================================

mod fs_commands;
mod search;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};

// Estado compartilhado: quando `false`, a janela NÃO se esconde ao perder foco.
// Usado para não sumir o painel enquanto o diálogo de escolher pasta está aberto.
struct AutoHide(AtomicBool);

// Comando de teste (continua existindo para o botão da Fase 0).
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Olá, {name}! O backend Rust do Archivum está rodando.")
}

// O frontend liga/desliga o auto-hide (ex.: desliga antes de abrir o diálogo
// de pasta e religa depois).
#[tauri::command]
fn allow_autohide(state: tauri::State<AutoHide>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

// Troca o atalho global em tempo de execução (chamado pela tela de Settings).
// Remove o atalho atual e registra o novo (ex.: "Ctrl+Shift+Space").
#[tauri::command]
fn set_shortcut(app: tauri::AppHandle, accelerator: String) -> Result<(), String> {
    let scut = Shortcut::from_str(&accelerator).map_err(|e| e.to_string())?;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    gs.register(scut).map_err(|e| e.to_string())
}

// Mostra/esconde a janela principal. Usado pelo atalho global e pela bandeja.
fn toggle_painel(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            posicionar_canto_superior_direito(&win);
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

// Ancora a janela no canto superior direito do monitor atual (respeita multi-monitor e DPI).
fn posicionar_canto_superior_direito(win: &WebviewWindow) {
    if let Ok(Some(monitor)) = win.current_monitor() {
        let area = monitor.size(); // tamanho do monitor em pixels físicos
        let origem = monitor.position(); // canto do monitor (multi-monitor)
        let escala = monitor.scale_factor();
        if let Ok(tam_janela) = win.outer_size() {
            let margem = (12.0 * escala) as i32;
            let x = origem.x + area.width as i32 - tam_janela.width as i32 - margem;
            let y = origem.y + margem;
            let _ = win.set_position(PhysicalPosition::new(x.max(origem.x), y));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Atalho padrão: Ctrl+Shift+Space (configurável numa fase futura).
    let atalho = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        // Auto-hide começa DESLIGADO: o app abre fixo (não some no boot ao
        // perder foco para o terminal). O frontend liga/desliga depois.
        .manage(AutoHide(AtomicBool::new(false)))
        // Estado do índice de busca (vazio até o primeiro reindex).
        .manage(search::SearchState::default())
        // --- Plugin de diálogo nativo (escolher a pasta do vault) ---------
        .plugin(tauri_plugin_dialog::init())
        // --- Plugin de autostart (iniciar com o sistema) -----------------
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // --- Plugin do atalho global -------------------------------------
        // O handler dispara quando QUALQUER atalho registrado é acionado.
        // Reagimos só no "Pressed" para abrir/fechar o painel uma vez por toque.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _scut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_painel(app);
                    }
                })
                .build(),
        )
        // --- Eventos de janela -------------------------------------------
        .on_window_event(|window, event| match event {
            // Perdeu o foco -> esconde (comportamento de "launcher"),
            // a menos que o auto-hide esteja temporariamente desligado.
            tauri::WindowEvent::Focused(false) => {
                let permitido = window
                    .app_handle()
                    .state::<AutoHide>()
                    .0
                    .load(Ordering::Relaxed);
                if permitido {
                    let _ = window.hide();
                }
            }
            // Clicou no X -> não fecha o app, só esconde (fica na bandeja).
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        // --- Setup: registra atalho e cria a bandeja ---------------------
        .setup(move |app| {
            // Registra o atalho global. Se já estiver em uso por outro app,
            // apenas logamos e seguimos (não derruba o boot).
            if let Err(e) = app.global_shortcut().register(atalho) {
                eprintln!("Falha ao registrar atalho global: {e}");
            }

            // Itens do menu da bandeja.
            let item_mostrar =
                MenuItem::with_id(app, "mostrar", "Mostrar Archivum", true, None::<&str>)?;
            let item_sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&item_mostrar, &item_sair])?;

            // Cria o ícone na bandeja usando o ícone do app.
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Archivum")
                .menu(&menu)
                // Clique esquerdo NÃO abre o menu (ele alterna o painel); menu = clique direito.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "mostrar" => toggle_painel(app),
                    "sair" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Clique esquerdo (ao soltar) alterna o painel.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_painel(tray.app_handle());
                    }
                })
                .build(app)?;

            // Mostra o painel uma vez no primeiro boot, para o usuário ver que subiu.
            toggle_painel(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            allow_autohide,
            set_shortcut,
            fs_commands::scan_vault,
            fs_commands::read_doc_file,
            fs_commands::write_doc_file,
            fs_commands::create_dir,
            fs_commands::rename_path,
            fs_commands::remove_path,
            search::reindex,
            search::search_docs
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app Archivum");
}
