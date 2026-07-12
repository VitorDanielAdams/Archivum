// ============================================================================
// Busca full-text com Tantivy (motor estilo Lucene, em Rust).
//
// Fluxo:
//   1. O frontend (TS) parseia os .md e manda os campos já prontos para
//      `reindex(items)`. Construímos um índice EM MEMÓRIA (rápido, descartável).
//   2. `search_docs(query)` roda a busca: ranking BM25, vários campos com peso
//      diferente, stemming PT, e devolve um trecho destacado (snippet).
//
// Manter o índice em RAM (recriado ao abrir o vault) evita versionar índice em
// disco e é rápido o bastante para milhares de documentos.
// ============================================================================

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::{
    Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, STORED, STRING,
};
use tantivy::snippet::SnippetGenerator;
use tantivy::tokenizer::{Language, LowerCaser, RemoveLongFilter, SimpleTokenizer, Stemmer, TextAnalyzer};
use tantivy::{Index, IndexReader, TantivyDocument};

const TOKENIZER: &str = "pt_en";

// Item enviado pelo frontend para indexação.
#[derive(Deserialize)]
pub struct IndexItem {
    pub id: String,
    pub title: String,
    #[serde(rename = "type", default)]
    pub type_: String,
    #[serde(default)]
    pub tags: String,
    #[serde(default)]
    pub headings: String,
    #[serde(default)]
    pub body: String,
}

// Resultado de busca devolvido ao frontend.
#[derive(Serialize)]
pub struct SearchHit {
    pub id: String,
    pub score: f32,
    pub snippet: String, // HTML com <b> nos trechos que casaram
}

// Índice montado + campos, guardado no estado do app.
struct BuiltIndex {
    index: Index,
    reader: IndexReader,
    f_id: Field,
    f_title: Field,
    f_type: Field,
    f_tags: Field,
    f_headings: Field,
    f_body: Field,
}

// Estado compartilhado: o índice atual (ou nenhum, antes do 1º reindex).
#[derive(Default)]
pub struct SearchState(Mutex<Option<BuiltIndex>>);

// Cria o analisador de texto: tokeniza, remove tokens gigantes, minúsculas e
// aplica stemming português (reduz "balanços/balanço" ao mesmo radical).
fn analyzer() -> TextAnalyzer {
    TextAnalyzer::builder(SimpleTokenizer::default())
        .filter(RemoveLongFilter::limit(40))
        .filter(LowerCaser)
        .filter(Stemmer::new(Language::Portuguese))
        .build()
}

// (Re)constrói o índice em RAM a partir dos itens recebidos.
#[tauri::command]
pub fn reindex(state: tauri::State<SearchState>, items: Vec<IndexItem>) -> Result<usize, String> {
    // Campos de texto usam nosso tokenizer custom (com stemming).
    let text_indexing = TextFieldIndexing::default()
        .set_tokenizer(TOKENIZER)
        .set_index_option(IndexRecordOption::WithFreqsAndPositions);
    let text = TextOptions::default().set_indexing_options(text_indexing.clone());
    let text_stored = TextOptions::default()
        .set_indexing_options(text_indexing)
        .set_stored();

    let mut sb = Schema::builder();
    let f_id = sb.add_text_field("id", STRING | STORED);
    let f_title = sb.add_text_field("title", text_stored.clone());
    let f_type = sb.add_text_field("type", text.clone());
    let f_tags = sb.add_text_field("tags", text.clone());
    let f_headings = sb.add_text_field("headings", text.clone());
    let f_body = sb.add_text_field("body", text_stored);
    let schema = sb.build();

    let index = Index::create_in_ram(schema);
    index.tokenizers().register(TOKENIZER, analyzer());

    let mut writer = index.writer(50_000_000).map_err(|e| e.to_string())?;
    for it in &items {
        let mut doc = TantivyDocument::new();
        doc.add_text(f_id, &it.id);
        doc.add_text(f_title, &it.title);
        doc.add_text(f_type, &it.type_);
        doc.add_text(f_tags, &it.tags);
        doc.add_text(f_headings, &it.headings);
        doc.add_text(f_body, &it.body);
        writer.add_document(doc).map_err(|e| e.to_string())?;
    }
    writer.commit().map_err(|e| e.to_string())?;

    let reader = index.reader().map_err(|e| e.to_string())?;
    let count = items.len();

    *state.0.lock().unwrap() = Some(BuiltIndex {
        index,
        reader,
        f_id,
        f_title,
        f_type,
        f_tags,
        f_headings,
        f_body,
    });
    Ok(count)
}

// Busca por `query`, devolve até 30 hits ranqueados com snippet.
#[tauri::command]
pub fn search_docs(state: tauri::State<SearchState>, query: String) -> Result<Vec<SearchHit>, String> {
    let guard = state.0.lock().unwrap();
    let bi = match guard.as_ref() {
        Some(b) => b,
        None => return Ok(vec![]), // ainda não indexado
    };
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let searcher = bi.reader.searcher();

    // Busca em vários campos; título e tags pesam mais que o corpo.
    let mut parser = QueryParser::for_index(
        &bi.index,
        vec![bi.f_title, bi.f_type, bi.f_tags, bi.f_headings, bi.f_body],
    );
    parser.set_field_boost(bi.f_title, 3.0);
    parser.set_field_boost(bi.f_tags, 2.0);
    parser.set_field_boost(bi.f_type, 1.5);
    parser.set_field_boost(bi.f_headings, 1.5);

    // Tolera erros de sintaxe do usuário (não derruba a busca).
    let parsed = match parser.parse_query(q) {
        Ok(query) => query,
        Err(_) => {
            // tenta de novo escapando o texto como termos simples
            let escaped: String = q.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace()).collect();
            match parser.parse_query(&escaped) {
                Ok(query) => query,
                Err(e) => return Err(e.to_string()),
            }
        }
    };

    let top = searcher
        .search(&parsed, &TopDocs::with_limit(30))
        .map_err(|e| e.to_string())?;

    // Gera snippet a partir do corpo (cai pro título se o corpo não casar).
    let mut snip_body = SnippetGenerator::create(&searcher, &parsed, bi.f_body).map_err(|e| e.to_string())?;
    snip_body.set_max_num_chars(180);
    let snip_title = SnippetGenerator::create(&searcher, &parsed, bi.f_title).map_err(|e| e.to_string())?;

    let mut hits = Vec::with_capacity(top.len());
    for (score, addr) in top {
        let doc: TantivyDocument = searcher.doc(addr).map_err(|e| e.to_string())?;
        let id = doc
            .get_first(bi.f_id)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut snippet = snip_body.snippet_from_doc(&doc).to_html();
        if snippet.trim().is_empty() {
            snippet = snip_title.snippet_from_doc(&doc).to_html();
        }
        if snippet.trim().is_empty() {
            // sem destaque: mostra o começo do corpo
            if let Some(body) = doc.get_first(bi.f_body).and_then(|v| v.as_str()) {
                snippet = body.chars().take(120).collect();
            }
        }

        hits.push(SearchHit { id, score, snippet });
    }
    Ok(hits)
}
