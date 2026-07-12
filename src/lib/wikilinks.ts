// Converte [[id]] / [[id|texto]] do corpo markdown em links "archivum:id",
// resolvendo o texto exibido pelo título do documento quando não há alias.
// Usado no DocViewer (clicável) e na prévia do editor (só estilizado).
import type { Doc } from "../types";

export function resolveWikilinks(body: string, docsById: Map<string, Doc>): string {
  return body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, id: string, alias?: string) => {
    const key = id.trim();
    const label = (alias ?? docsById.get(key)?.meta.title ?? key).toString().trim();
    return `[${label}](archivum:${key})`;
  });
}
