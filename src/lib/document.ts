// Conversão entre arquivo .md (texto) e o objeto Doc usado na UI.
import { ulid } from "ulid";
import { buildContent, parseFrontmatter } from "./frontmatter";
import type { Doc, DocMeta } from "../types";

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function titleFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

// Lê um arquivo (caminho + conteúdo) e devolve o Doc.
// Se faltar id no frontmatter, geramos um ULID (gravado na próxima edição).
export function docFromFile(path: string, content: string): Doc {
  const { data, body } = parseFrontmatter(content);
  const meta: DocMeta = {
    id: asString(data.id) ?? ulid(),
    title: asString(data.title) ?? titleFromPath(path),
    type: asString(data.type),
    tags: asStringArray(data.tags),
    favorite: data.favorite === true,
    links: asStringArray(data.links),
    created: asString(data.created),
    updated: asString(data.updated),
  };
  return { meta, path, body };
}

// Serializa o Doc de volta para texto .md (atualiza "updated").
export function docToContent(doc: Doc): string {
  const data: Record<string, unknown> = { id: doc.meta.id, title: doc.meta.title };
  if (doc.meta.type) data.type = doc.meta.type;
  if (doc.meta.tags.length) data.tags = doc.meta.tags;
  if (doc.meta.favorite) data.favorite = true;
  if (doc.meta.links.length) data.links = doc.meta.links;
  if (doc.meta.created) data.created = doc.meta.created;
  data.updated = new Date().toISOString();
  return buildContent(data, doc.body);
}

// Transforma um título em nome de arquivo seguro (sem acento/espaço).
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Cria um Doc novo em memória (ainda não gravado).
export function newDoc(folder: string, title: string): Doc {
  const id = ulid();
  const slug = slugify(title) || id;
  const path = folder ? `${folder}/${slug}.md` : `${slug}.md`;
  const now = new Date().toISOString();
  return {
    meta: { id, title, tags: [], favorite: false, links: [], created: now, updated: now },
    path,
    body: "",
  };
}
