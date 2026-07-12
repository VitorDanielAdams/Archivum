import { useEffect, useState } from "react";
import { useVault } from "../store/vault";
import { applyShortcut, autostart, getShortcut } from "../lib/settings";

export function Settings({
  onClose,
  onChangeVault,
}: {
  onClose: () => void;
  onChangeVault: () => void;
}) {
  const { root, ignore, addIgnore, removeIgnore } = useVault();
  const [shortcut, setShortcut] = useState(getShortcut());
  const [auto, setAuto] = useState(false);
  const [newIgnore, setNewIgnore] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    autostart.isEnabled().then(setAuto).catch(() => {});
  }, []);

  async function salvarAtalho() {
    try {
      await applyShortcut(shortcut.trim());
      setMsg("Atalho salvo ✓");
    } catch (e) {
      setMsg("Atalho inválido: " + String(e));
    }
  }

  async function toggleAuto() {
    try {
      if (auto) {
        await autostart.disable();
        setAuto(false);
      } else {
        await autostart.enable();
        setAuto(true);
      }
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <div className="settings">
      <div className="docview__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          ← Voltar
        </button>
        <span className="docview__spacer" />
        <h2 className="settings__title">Configurações</h2>
      </div>

      <div className="settings__body">
        <div className="field">
          <span className="field__label">Atalho global</span>
          <div className="field-row">
            <input
              className="field__input"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="Ctrl+Shift+Space"
            />
            <button className="btn" onClick={salvarAtalho}>
              Salvar
            </button>
          </div>
          <span className="settings__hint">
            Ex.: <code>Ctrl+Shift+Space</code>, <code>Alt+A</code>,{" "}
            <code>CmdOrCtrl+K</code>
          </span>
        </div>

        <label className="settings__check">
          <input type="checkbox" checked={auto} onChange={toggleAuto} />
          <span>Iniciar com o sistema</span>
        </label>

        <div className="field">
          <span className="field__label">Vault atual</span>
          <div className="field-row">
            <input className="field__input" value={root ?? ""} readOnly />
            <button className="btn btn--ghost" onClick={onChangeVault}>
              Trocar
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field__label">Pastas ignoradas (desabilitadas)</span>
          <div className="field-row">
            <input
              className="field__input"
              placeholder="nome ou caminho (ex.: docs, repo/temp)"
              value={newIgnore}
              onChange={(e) => setNewIgnore(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newIgnore.trim()) {
                  addIgnore(newIgnore.trim());
                  setNewIgnore("");
                }
              }}
            />
            <button
              className="btn"
              onClick={() => {
                if (newIgnore.trim()) {
                  addIgnore(newIgnore.trim());
                  setNewIgnore("");
                }
              }}
            >
              Adicionar
            </button>
          </div>
          {ignore.length === 0 ? (
            <span className="settings__hint">
              Nenhuma. (Pastas como node_modules, .git, target já são ignoradas
              automaticamente.)
            </span>
          ) : (
            <ul className="ignorelist">
              {ignore.map((p) => (
                <li key={p} className="ignorelist__item">
                  <span className="ignorelist__path">{p}</span>
                  <button
                    className="ignorelist__x"
                    title="Reabilitar"
                    onClick={() => removeIgnore(p)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {msg && <p className="settings__msg">{msg}</p>}
      </div>
    </div>
  );
}
