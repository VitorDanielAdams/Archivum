import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { useVault } from "./store/vault";
import { useNav } from "./store/nav";
import { pickVaultFolder } from "./lib/tauri";
import { getLastVault } from "./lib/vault";
import { applyShortcut, getShortcut } from "./lib/settings";
import { Sidebar } from "./components/Sidebar";
import { DocViewer } from "./components/DocViewer";
import { DocEditor } from "./components/DocEditor";
import { Settings } from "./components/Settings";
import { FullGraphView } from "./components/FullGraphView";
import { ContextMenu } from "./components/ContextMenu";

function App() {
  const { root, openVault, loading, error, selectedId, editingId, docsById, draft } = useVault();
  const [showSettings, setShowSettings] = useState(false);
  const showGraph = useNav((s) => s.stack[s.index].kind === "graph");
  const [pinned, setPinned] = useState(true); // abre já fixado (não some ao perder foco)
  const [expanded, setExpanded] = useState(false);

  // Botões extras do mouse (voltar/avançar) + Alt+Seta.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        useNav.getState().back();
      } else if (e.button === 4) {
        e.preventDefault();
        useNav.getState().forward();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowLeft") useNav.getState().back();
      if (e.key === "ArrowRight") useNav.getState().forward();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Ao abrir, recarrega o último vault e aplica o atalho global salvo.
  useEffect(() => {
    const last = getLastVault();
    if (last) openVault(last);
    applyShortcut(getShortcut()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc esconde o painel — exceto quando fixado, editando ou digitando.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      const digitando =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        Boolean(el?.isContentEditable) ||
        Boolean(el?.closest(".cm-editor"));
      if (pinned || useVault.getState().editingId || digitando) return;
      getCurrentWindow().hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  async function escolherPasta() {
    const dir = await pickVaultFolder();
    if (dir) openVault(dir);
  }

  // Auto-hide fica DESLIGADO enquanto fixado OU editando (escrever sem o painel sumir).
  useEffect(() => {
    invoke("allow_autohide", { enabled: !(pinned || Boolean(editingId)) }).catch(() => {});
  }, [pinned, editingId]);

  // Fixar: o efeito acima aplica o auto-hide.
  function togglePin() {
    setPinned((v) => !v);
  }

  // Expandir: janela grande e centralizada para leitura; volta ao painel compacto.
  async function toggleExpand() {
    const w = getCurrentWindow();
    if (expanded) {
      await w.setSize(new LogicalSize(420, 760));
      setExpanded(false);
    } else {
      await w.setSize(new LogicalSize(960, 720));
      await w.center();
      setExpanded(true);
    }
  }

  function esconder() {
    getCurrentWindow().hide();
  }

  const selected = selectedId ? docsById.get(selectedId) : undefined;
  const editing = editingId
    ? docsById.get(editingId) ?? (draft && draft.meta.id === editingId ? draft : undefined)
    : undefined;

  return (
    <div className={"app" + (expanded ? " app--expanded" : "")}>
      <header className="app__header">
        <div className="app__brand" data-tauri-drag-region>
          <span className="app__logo">📚</span>
          <h1 className="app__title">Archivum</h1>
        </div>
        <div className="app__winctl">
          <button
            className={"winbtn" + (pinned ? " winbtn--active" : "")}
            title={pinned ? "Desafixar" : "Fixar (não esconder)"}
            onClick={togglePin}
          >
            📌
          </button>
          <button
            className={"winbtn" + (expanded ? " winbtn--active" : "")}
            title={expanded ? "Compactar" : "Expandir"}
            onClick={toggleExpand}
          >
            ⛶
          </button>
          <button className="winbtn" title="Esconder (vai pra bandeja)" onClick={esconder}>
            —
          </button>
        </div>
      </header>

      {!root ? (
        <main className="app__body app__welcome">
          <p className="app__hint">
            Escolha a pasta onde ficam (ou ficarão) seus arquivos <code>.md</code>.
          </p>
          <button className="btn" onClick={escolherPasta}>
            Selecionar pasta do vault
          </button>
          {loading && <p className="app__hint">Carregando…</p>}
          {error && <p className="app__error">{error}</p>}
        </main>
      ) : showSettings ? (
        <Settings onClose={() => setShowSettings(false)} onChangeVault={escolherPasta} />
      ) : showGraph ? (
        <FullGraphView />
      ) : editing ? (
        <DocEditor doc={editing} />
      ) : selected ? (
        <DocViewer doc={selected} />
      ) : (
        <Sidebar
          onChangeVault={escolherPasta}
          onOpenSettings={() => setShowSettings(true)}
          onOpenGraph={() => useNav.getState().goGraph()}
        />
      )}

      {loading && root && (
        <div className="loading-overlay">
          <div className="spinner" />
          <span>Carregando documentos…</span>
        </div>
      )}

      <ContextMenu />
    </div>
  );
}

export default App;
