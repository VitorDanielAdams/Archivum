// Em release no Windows, esconde a janela de console preta que abriria atrás do app.
// NÃO REMOVER essa linha.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// O main só delega para a função run() da nossa lib (src/lib.rs).
fn main() {
    archivum_lib::run()
}
