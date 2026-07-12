// ============================================================================
// Comandos de arquivo do Archivum.
// São funções curtas em Rust que o frontend (TypeScript) chama via invoke()
// para ler/gravar/mover/apagar os .md do vault e varrer a pasta.
//
// Toda a lógica de documento (frontmatter, vínculos, etc.) é feita em TS.
// Aqui é só I/O bruto de arquivo, com proteção contra "path traversal".
// ============================================================================

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

// Pastas que NUNCA são varridas (lixo de build/VCS). Evita travar ao escolher
// uma pasta de repositórios. A varredura nem desce nelas.
const PASTAS_IGNORADAS: &[&str] = &[
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "vendor",
    "bin",
    "obj",
    ".venv",
    "venv",
    "__pycache__",
    ".idea",
    ".vscode",
    "coverage",
    ".cache",
    ".turbo",
    ".gradle",
    ".archivum",
];

// Um arquivo .md encontrado no vault: caminho relativo + conteúdo cru.
#[derive(Serialize)]
pub struct DocFile {
    pub path: String, // relativo ao root, sempre com "/"
    pub content: String,
}

// Resultado do scan do vault: as pastas e os documentos.
#[derive(Serialize)]
pub struct VaultScan {
    pub dirs: Vec<String>,
    pub docs: Vec<DocFile>,
}

// Junta root + caminho relativo, recusando qualquer tentativa de sair do root
// (ex.: "..", caminhos absolutos). É a barreira de segurança dos comandos.
fn safe_join(root: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    for comp in rel_path.components() {
        match comp {
            Component::ParentDir => return Err("caminho inválido: contém '..'".into()),
            Component::RootDir | Component::Prefix(_) => {
                return Err("o caminho precisa ser relativo ao vault".into())
            }
            _ => {}
        }
    }
    Ok(Path::new(root).join(rel_path))
}

// Converte um caminho em string com "/" (uniforme entre Windows e macOS).
fn normaliza(rel: &Path) -> String {
    rel.to_string_lossy().replace('\\', "/")
}

// Varre o vault: devolve as pastas e os arquivos .md (com conteúdo).
// - poda pastas de build/VCS (PASTAS_IGNORADAS) e as ignoradas pelo usuário,
//   sem descer nelas (rápido mesmo numa pasta gigante de repositórios);
// - só lê arquivos .md, ignora o resto.
// `ignore` = nomes de pasta OU caminhos relativos que o usuário desabilitou.
#[tauri::command]
pub fn scan_vault(root: String, ignore: Vec<String>) -> Result<VaultScan, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("não é uma pasta: {root}"));
    }

    let padrao: HashSet<&str> = PASTAS_IGNORADAS.iter().copied().collect();
    let usuario: HashSet<String> = ignore.into_iter().collect();
    let root_owned = root_path.to_path_buf();

    let mut dirs = Vec::new();
    let mut docs = Vec::new();

    // filter_entry PODA a pasta antes de descer nela (essencial p/ desempenho).
    let walker = WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            let p = e.path();
            if p == root_owned {
                return true;
            }
            if !e.file_type().is_dir() {
                return true; // arquivos passam; filtramos .md depois
            }
            let nome = e.file_name().to_string_lossy();
            if padrao.contains(nome.as_ref()) {
                return false;
            }
            let rel = p
                .strip_prefix(&root_owned)
                .map(|r| r.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            // ignora por NOME da pasta ou por CAMINHO relativo
            !(usuario.contains(nome.as_ref()) || usuario.contains(&rel))
        });

    for entry in walker.filter_map(|e| e.ok()) {
        let p = entry.path();
        if p == root_path {
            continue;
        }
        let rel = match p.strip_prefix(root_path) {
            Ok(r) => r,
            Err(_) => continue,
        };

        if entry.file_type().is_dir() {
            dirs.push(normaliza(rel));
        } else if p
            .extension()
            .map(|e| e.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
        {
            if let Ok(content) = fs::read_to_string(p) {
                docs.push(DocFile {
                    path: normaliza(rel),
                    content,
                });
            }
        }
    }

    dirs.sort();
    docs.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(VaultScan { dirs, docs })
}

// Lê um único arquivo do vault.
#[tauri::command]
pub fn read_doc_file(root: String, rel: String) -> Result<String, String> {
    let path = safe_join(&root, &rel)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

// Cria/sobrescreve um arquivo, criando as pastas-pai se faltarem.
#[tauri::command]
pub fn write_doc_file(root: String, rel: String, content: String) -> Result<(), String> {
    let path = safe_join(&root, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

// Cria uma pasta (e as intermediárias).
#[tauri::command]
pub fn create_dir(root: String, rel: String) -> Result<(), String> {
    let path = safe_join(&root, &rel)?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

// Move/renomeia um arquivo ou pasta dentro do vault.
#[tauri::command]
pub fn rename_path(root: String, from: String, to: String) -> Result<(), String> {
    let from_p = safe_join(&root, &from)?;
    let to_p = safe_join(&root, &to)?;
    if let Some(parent) = to_p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&from_p, &to_p).map_err(|e| e.to_string())
}

// Apaga um arquivo, ou uma pasta (recursivo só se `recursive=true`).
#[tauri::command]
pub fn remove_path(root: String, rel: String, recursive: bool) -> Result<(), String> {
    let path = safe_join(&root, &rel)?;
    if path.is_dir() {
        if recursive {
            fs::remove_dir_all(&path).map_err(|e| e.to_string())
        } else {
            fs::remove_dir(&path).map_err(|e| e.to_string())
        }
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}
