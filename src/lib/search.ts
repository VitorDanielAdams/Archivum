// Ponte para o motor de busca (Tantivy, no Rust).
import { invoke } from "@tauri-apps/api/core";
import type { Doc } from "../types";

export interface SearchHit {
  id: string;
  score: number;
  snippet: string; // HTML com <b> nos trechos que casaram
}

// Extrai os títulos de seção (linhas que começam com #) — os "pontos principais".
export function extractHeadings(body: string): string {
  const out: string[] = [];
  for (const line of body.split("\n")) {
    const m = /^#{1,6}\s+(.*)$/.exec(line.trim());
    if (m) out.push(m[1]);
  }
  return out.join("  ");
}

function buildIndexItems(docs: Doc[]) {
  return docs.map((d) => ({
    id: d.meta.id,
    title: d.meta.title,
    type: d.meta.type ?? "",
    tags: d.meta.tags.join(" "),
    headings: extractHeadings(d.body),
    body: d.body,
  }));
}

// Reconstrói o índice no Rust com os documentos atuais.
export async function reindex(docs: Doc[]): Promise<void> {
  await invoke("reindex", { items: buildIndexItems(docs) });
}

// Busca e devolve hits ranqueados.
export async function searchDocs(query: string): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_docs", { query });
}
