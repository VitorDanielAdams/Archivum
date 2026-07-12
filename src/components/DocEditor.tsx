import { useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useVault } from "../store/vault";
import { resolveWikilinks } from "../lib/wikilinks";
import type { Doc } from "../types";

// pasta de um caminho de doc (sem o nome do arquivo)
function folderOf(path: string): string {
  const parts = path.split("/");
  return parts.slice(0, -1).join("/");
}

type Mode = "edit" | "split" | "preview";

export function DocEditor({ doc }: { doc: Doc }) {
  const { docs, docsById, dirs, saveDoc, moveDoc, stopEditing } = useVault();

  const [title, setTitle] = useState(doc.meta.title);
  const [type, setType] = useState(doc.meta.type ?? "");
  const [tags, setTags] = useState(doc.meta.tags.join(", "));
  const [folder, setFolder] = useState(folderOf(doc.path));
  const [body, setBody] = useState(doc.body);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("edit");
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  // pastas existentes (para o datalist do campo "Pasta")
  const folders = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs) s.add(folderOf(d.path));
    for (const dir of dirs) s.add(dir);
    return Array.from(s).filter(Boolean).sort();
  }, [docs, dirs]);

  // autocomplete de [[ ]]: sugere documentos pelo título/id
  const extensions = useMemo(() => {
    const wikiSource = (ctx: CompletionContext) => {
      const before = ctx.matchBefore(/\[\[([^\]\n]*)$/);
      if (!before) return null;
      const typed = before.text.slice(2).toLowerCase();
      const options = docs
        .filter(
          (d) =>
            d.meta.title.toLowerCase().includes(typed) ||
            d.meta.id.toLowerCase().includes(typed)
        )
        .slice(0, 20)
        .map((d) => ({
          label: d.meta.title,
          detail: d.meta.type ?? "",
          apply: `${d.meta.id}|${d.meta.title}]]`,
          type: "variable",
        }));
      return { from: before.from + 2, options };
    };
    return [
      markdown(),
      oneDark,
      EditorView.lineWrapping, // quebra linhas longas (melhor pra texto)
      autocompletion({ override: [wikiSource] }),
    ];
  }, [docs]);

  // ---- Toolbar de formatação: insere/envolve markdown no cursor/seleção ----
  function wrap(before: string, after: string = before) {
    const view = cmRef.current?.view;
    if (!view) return;
    const changes = view.state.selection.ranges.flatMap((range) => [
      { from: range.from, insert: before },
      { from: range.to, insert: after },
    ]);
    view.dispatch({ changes });
    view.focus();
  }
  function prefixLines(prefix: string) {
    const view = cmRef.current?.view;
    if (!view) return;
    const { state } = view;
    const changes: { from: number; insert: string }[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      const startLine = state.doc.lineAt(range.from).number;
      const endLine = state.doc.lineAt(range.to).number;
      for (let l = startLine; l <= endLine; l++) {
        if (seen.has(l)) continue;
        seen.add(l);
        changes.push({ from: state.doc.line(l).from, insert: prefix });
      }
    }
    view.dispatch({ changes });
    view.focus();
  }

  const preview = resolveWikilinks(body, docsById);

  async function salvar() {
    setSaving(true);
    try {
      const updated: Doc = {
        ...doc,
        meta: {
          ...doc.meta,
          title: title.trim() || doc.meta.title,
          type: type.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
        body,
      };
      await saveDoc(updated);
      const novaPasta = folder.trim();
      if (novaPasta !== folderOf(doc.path)) {
        await moveDoc(doc.meta.id, novaPasta);
      }
      stopEditing();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <div className="editor__bar">
        <div className="editor__modes">
          <button
            className={"btn btn--ghost btn--sm" + (mode === "edit" ? " btn--active" : "")}
            onClick={() => setMode("edit")}
            title="Só editor"
          >
            ✎
          </button>
          <button
            className={"btn btn--ghost btn--sm" + (mode === "split" ? " btn--active" : "")}
            onClick={() => setMode("split")}
            title="Editor + prévia lado a lado"
          >
            ⬓
          </button>
          <button
            className={"btn btn--ghost btn--sm" + (mode === "preview" ? " btn--active" : "")}
            onClick={() => setMode("preview")}
            title="Só prévia"
          >
            👁
          </button>
        </div>
        <span className="docview__spacer" />
        <button className="btn btn--ghost" onClick={stopEditing} disabled={saving}>
          Cancelar
        </button>
        <button className="btn" onClick={salvar} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>

      <div className="editor__fields">
        <label className="field">
          <span className="field__label">Título</span>
          <input className="field__input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field__label">Tipo</span>
            <input
              className="field__input"
              placeholder="ex.: mediator-request"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Pasta</span>
            <input
              className="field__input"
              list="folders-list"
              placeholder="(raiz)"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            />
            <datalist id="folders-list">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="field">
          <span className="field__label">Tags (separadas por vírgula)</span>
          <input
            className="field__input"
            placeholder="player, balance"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
      </div>

      {mode !== "preview" && (
        <div className="mdtoolbar">
          <button className="mdtoolbar__btn" title="Negrito" onClick={() => wrap("**")}>
            <b>B</b>
          </button>
          <button className="mdtoolbar__btn" title="Itálico" onClick={() => wrap("_")}>
            <i>I</i>
          </button>
          <button className="mdtoolbar__btn" title="Título" onClick={() => prefixLines("## ")}>
            H
          </button>
          <button className="mdtoolbar__btn" title="Código inline" onClick={() => wrap("`")}>
            {"</>"}
          </button>
          <button
            className="mdtoolbar__btn"
            title="Bloco de código"
            onClick={() => wrap("```\n", "\n```")}
          >
            { "{ }" }
          </button>
          <button className="mdtoolbar__btn" title="Lista" onClick={() => prefixLines("- ")}>
            •
          </button>
          <button
            className="mdtoolbar__btn"
            title="Link"
            onClick={() => wrap("[", "](https://)")}
          >
            🔗
          </button>
          <button
            className="mdtoolbar__btn"
            title="Vincular documento ( [[ )"
            onClick={() => wrap("[[", "]]")}
          >
            [[ ]]
          </button>
        </div>
      )}

      <div className={"editor__panes editor__panes--" + mode}>
        {mode !== "preview" && (
          <div className="editor__cm">
            <CodeMirror
              ref={cmRef}
              value={body}
              height="100%"
              theme={oneDark}
              extensions={extensions}
              onChange={setBody}
              placeholder="Escreva em markdown. Use [[ para vincular outro documento."
              basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
            />
          </div>
        )}
        {mode !== "edit" && (
          <div className="editor__preview markdown">
            {body.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {preview}
              </ReactMarkdown>
            ) : (
              <p className="sidebar__empty">Nada para mostrar ainda.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
