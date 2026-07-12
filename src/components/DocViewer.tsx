import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useVault } from "../store/vault";
import { useNav } from "../store/nav";
import { askConfirm } from "../lib/tauri";
import { GraphView } from "./GraphView";
import { resolveWikilinks } from "../lib/wikilinks";
import type { Doc } from "../types";

// Visualizador rico de um documento: markdown renderizado, código com
// destaque, vínculos [[ ]] clicáveis, relacionados e backlinks.
export function DocViewer({ doc }: { doc: Doc }) {
  const { docsById, docs, startEditing, toggleFavorite, deleteDoc, addLink, removeLink } =
    useVault();
  const goDoc = useNav((s) => s.goDoc);
  const [showGraph, setShowGraph] = useState(false);
  const [linking, setLinking] = useState(false);
  const [filter, setFilter] = useState("");

  const candidates = docs
    .filter(
      (d) =>
        d.meta.id !== doc.meta.id &&
        !doc.meta.links.includes(d.meta.id) &&
        d.meta.title.toLowerCase().includes(filter.toLowerCase())
    )
    .slice(0, 10);

  async function excluir() {
    if (await askConfirm(`Excluir "${doc.meta.title}"? Não dá pra desfazer.`)) {
      await deleteDoc(doc.meta.id);
    }
  }

  const body = resolveWikilinks(doc.body, docsById);

  const related = doc.meta.links
    .map((id) => docsById.get(id))
    .filter((d): d is Doc => Boolean(d));

  const backlinks = docs.filter(
    (d) => d.meta.id !== doc.meta.id && d.meta.links.includes(doc.meta.id)
  );

  function go(id: string) {
    if (docsById.has(id)) goDoc(id);
  }

  return (
    <article className="docview">
      <div className="docview__actions">
        <button className="btn btn--ghost" onClick={() => useNav.getState().back()}>
          ← Voltar
        </button>
        <span className="docview__spacer" />
        <button
          className={"btn btn--ghost" + (showGraph ? " btn--active" : "")}
          onClick={() => setShowGraph((v) => !v)}
          title="Grafo de vínculos"
        >
          🕸
        </button>
        <button className="btn btn--ghost" onClick={() => startEditing(doc.meta.id)}>
          ✎ Editar
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => toggleFavorite(doc.meta.id)}
          title={doc.meta.favorite ? "Desfavoritar" : "Favoritar"}
        >
          {doc.meta.favorite ? "★" : "☆"}
        </button>
        <button className="btn btn--ghost btn--danger" onClick={excluir} title="Excluir">
          🗑
        </button>
      </div>

      <div className="docview__head">
        <h2 className="docview__title">
          {doc.meta.favorite && <span className="docview__star">⭐</span>}
          {doc.meta.title}
        </h2>
        <div className="docview__meta">
          {doc.meta.type && <span className="chip">{doc.meta.type}</span>}
          {doc.meta.tags.map((t) => (
            <span key={t} className="chip chip--tag">
              #{t}
            </span>
          ))}
        </div>
      </div>

      {showGraph ? (
        <GraphView doc={doc} />
      ) : (
        <div className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            a({ href, children, ...props }) {
              if (href && href.startsWith("archivum:")) {
                const id = href.slice("archivum:".length);
                const exists = docsById.has(id);
                return (
                  <a
                    href="#"
                    className={"wikilink" + (exists ? "" : " wikilink--broken")}
                    onClick={(e) => {
                      e.preventDefault();
                      go(id);
                    }}
                  >
                    {children}
                  </a>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" {...props}>
                  {children}
                </a>
              );
            },
          }}
        >
          {body}
        </ReactMarkdown>
        </div>
      )}

      <div className="docview__links">
        <section>
          <h3 className="docview__linkhead">Relacionados</h3>
          <div className="chips">
            {related.map((d) => (
              <span key={d.meta.id} className="chip chip--link">
                <button className="chip__go" onClick={() => go(d.meta.id)}>
                  {d.meta.title}
                </button>
                <button
                  className="chip__x"
                  title="Remover vínculo"
                  onClick={() => removeLink(doc.meta.id, d.meta.id)}
                >
                  ×
                </button>
              </span>
            ))}
            {!linking && (
              <button className="chip chip--add" onClick={() => setLinking(true)}>
                ＋ Vincular
              </button>
            )}
          </div>
          {linking && (
            <div className="linkpicker">
              <input
                className="field__input"
                autoFocus
                placeholder="filtrar documentos…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setLinking(false);
                    setFilter("");
                  }
                }}
              />
              <ul className="linkpicker__list">
                {candidates.map((d) => (
                  <li key={d.meta.id}>
                    <button
                      className="linkpicker__item"
                      onClick={async () => {
                        await addLink(doc.meta.id, d.meta.id);
                        setLinking(false);
                        setFilter("");
                      }}
                    >
                      <span>{d.meta.title}</span>
                      {d.meta.type && <span className="linkpicker__type">{d.meta.type}</span>}
                    </button>
                  </li>
                ))}
                {candidates.length === 0 && (
                  <li className="sidebar__empty">nenhum documento</li>
                )}
              </ul>
            </div>
          )}
        </section>

        {backlinks.length > 0 && (
          <section>
            <h3 className="docview__linkhead">Mencionado em (backlinks)</h3>
            <div className="chips">
              {backlinks.map((d) => (
                <button key={d.meta.id} className="chip chip--link" onClick={() => go(d.meta.id)}>
                  {d.meta.title}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
