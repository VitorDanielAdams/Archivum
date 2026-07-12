import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useVault } from "../store/vault";
import { useMenu } from "../store/menu";
import { useNav } from "../store/nav";
import { DocTree } from "./DocTree";
import { searchDocs, type SearchHit } from "../lib/search";
import { askConfirm } from "../lib/tauri";
import type { Doc } from "../types";

// O "sidenav": busca (motor Tantivy), favoritos (docs + pastas) no topo,
// e a árvore de documentos.
export function Sidebar({
  onChangeVault,
  onOpenSettings,
  onOpenGraph,
}: {
  onChangeVault: () => void;
  onOpenSettings: () => void;
  onOpenGraph: () => void;
}) {
  const {
    root,
    tree,
    favorites,
    favoriteFolders,
    docs,
    dirs,
    ignore,
    docsById,
    selectedId,
    refresh,
    createDoc,
    createFolder,
    toggleFavorite,
    toggleFavoriteFolder,
    deleteDoc,
  } = useVault();
  const openMenu = useMenu((s) => s.openMenu);
  const goDoc = useNav((s) => s.goDoc);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null); // null = input fechado
  const [folderFilter, setFolderFilter] = useState<string | null>(null); // pasta favorita aberta
  const timer = useRef<number | undefined>(undefined);

  function favMenu(e: MouseEvent, d: Doc) {
    e.preventDefault();
    e.stopPropagation();
    openMenu(e.clientX, e.clientY, [
      { label: "Abrir", onClick: () => goDoc(d.meta.id) },
      { label: "Desfavoritar", onClick: () => toggleFavorite(d.meta.id) },
      {
        label: "Excluir",
        danger: true,
        onClick: async () => {
          if (await askConfirm(`Excluir "${d.meta.title}"?`)) await deleteDoc(d.meta.id);
        },
      },
    ]);
  }

  async function confirmarPasta() {
    const name = (folderName ?? "").trim();
    if (name) await createFolder(name);
    setFolderName(null);
  }

  // Busca com debounce (search-as-you-type).
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        setHits(await searchDocs(q));
      } catch {
        setHits([]);
      }
    }, 120);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query, docs]);

  const searching = query.trim().length > 0;

  // docs dentro da pasta favorita aberta (inclui subpastas)
  const docsNaPasta = useMemo(() => {
    if (!folderFilter) return [];
    const prefix = folderFilter + "/";
    return docs
      .filter((d) => d.path.startsWith(prefix))
      .sort((a, b) => a.meta.title.localeCompare(b.meta.title, "pt-BR"));
  }, [docs, folderFilter]);

  // pastas favoritas que ainda existem no vault atual
  const favFoldersValidas = favoriteFolders.filter((p) => dirs.includes(p));

  return (
    <aside className="sidebar">
      <div className="sidebar__search">
        <input
          className="search-input"
          placeholder="Buscar documentos…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="btn btn--icon" title="Novo documento" onClick={() => createDoc("")}>
          ＋
        </button>
        <button
          className="btn btn--icon"
          title="Nova pasta"
          onClick={() => setFolderName(folderName === null ? "" : null)}
        >
          📁
        </button>
        <button className="btn btn--icon" title="Grafo completo do vault" onClick={onOpenGraph}>
          🕸
        </button>
        <button className="btn btn--icon" title="Recarregar" onClick={() => refresh()}>
          ⟳
        </button>
      </div>

      {folderName !== null && (
        <div className="newfolder">
          <input
            className="field__input"
            autoFocus
            placeholder="nome/da/pasta"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarPasta();
              if (e.key === "Escape") setFolderName(null);
            }}
          />
          <button className="btn" onClick={confirmarPasta}>
            Criar
          </button>
        </div>
      )}

      <div className="sidebar__scroll">
        {searching ? (
          <section className="sidebar__section">
            <h2 className="sidebar__heading">{hits.length} resultado(s)</h2>
            {hits.length === 0 ? (
              <p className="sidebar__empty">Nada encontrado.</p>
            ) : (
              <ul className="results">
                {hits.map((h) => {
                  const d = docsById.get(h.id);
                  if (!d) return null;
                  return (
                    <li key={h.id}>
                      <button className="result" onClick={() => goDoc(h.id)}>
                        <span className="result__title">
                          {d.meta.favorite && "⭐ "}
                          {d.meta.title}
                        </span>
                        {d.meta.type && <span className="result__type">{d.meta.type}</span>}
                        <span
                          className="result__snippet"
                          dangerouslySetInnerHTML={{ __html: h.snippet }}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : folderFilter ? (
          <section className="sidebar__section">
            <div className="folderfilter__head">
              <h2 className="sidebar__heading">⭐📁 {folderFilter}</h2>
              <button className="btn btn--ghost" onClick={() => setFolderFilter(null)}>
                × Limpar
              </button>
            </div>
            {docsNaPasta.length === 0 ? (
              <p className="sidebar__empty">Nenhum documento nesta pasta.</p>
            ) : (
              <ul className="tree">
                {docsNaPasta.map((d) => (
                  <li key={d.meta.id}>
                    <button
                      className={"tree__row" + (d.meta.id === selectedId ? " tree__row--sel" : "")}
                      onClick={() => goDoc(d.meta.id)}
                    >
                      <span className="tree__chev" />
                      <span className="tree__icon">📄</span>
                      <span className="tree__label">{d.meta.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            {(favorites.length > 0 || favFoldersValidas.length > 0) && (
              <section className="sidebar__section">
                <h2 className="sidebar__heading">★ Favoritos</h2>
                <ul className="tree">
                  {favFoldersValidas.map((path) => (
                    <li key={path} className="favrow">
                      <button className="tree__row" onClick={() => setFolderFilter(path)}>
                        <span className="tree__chev" />
                        <span className="tree__icon">⭐📁</span>
                        <span className="tree__label">{path}</span>
                      </button>
                      <button
                        className="favrow__x"
                        title="Desfavoritar pasta"
                        onClick={() => toggleFavoriteFolder(path)}
                      >
                        ★
                      </button>
                    </li>
                  ))}
                  {favorites.map((d) => (
                    <li key={d.meta.id} className="favrow">
                      <button
                        className={
                          "tree__row" + (d.meta.id === selectedId ? " tree__row--sel" : "")
                        }
                        onClick={() => goDoc(d.meta.id)}
                        onContextMenu={(e) => favMenu(e, d)}
                      >
                        <span className="tree__chev" />
                        <span className="tree__icon">⭐</span>
                        <span className="tree__label">{d.meta.title}</span>
                      </button>
                      <button
                        className="favrow__x"
                        title="Desfavoritar"
                        onClick={() => toggleFavorite(d.meta.id)}
                      >
                        ★
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="sidebar__section">
              <h2 className="sidebar__heading">Documentos</h2>
              {docs.length === 0 ? (
                <p className="sidebar__empty">Nenhum .md neste vault ainda.</p>
              ) : (
                <DocTree nodes={tree} />
              )}
            </section>
          </>
        )}
      </div>

      <footer className="sidebar__footer">
        <span className="sidebar__path" title={root ?? ""}>
          {root}
        </span>
        {ignore.length > 0 && (
          <button
            className="btn btn--ghost sidebar__ignorebadge"
            title="Ver pastas ignoradas"
            onClick={onOpenSettings}
          >
            🚫 {ignore.length}
          </button>
        )}
        <button className="btn btn--icon" title="Configurações" onClick={onOpenSettings}>
          ⚙
        </button>
        <button className="btn btn--ghost" onClick={onChangeVault}>
          Trocar
        </button>
      </footer>
    </aside>
  );
}
