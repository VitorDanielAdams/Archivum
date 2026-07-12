import { useEffect } from "react";
import { useMenu } from "../store/menu";

// Menu de contexto único, posicionado no cursor. Fecha ao clicar fora / Esc.
export function ContextMenu() {
  const { open, x, y, items, close } = useMenu();

  useEffect(() => {
    if (!open) return;
    const onClose = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", onClose);
    window.addEventListener("contextmenu", onClose);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("contextmenu", onClose);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [open, close]);

  if (!open) return null;

  // evita transbordar a borda inferior/direita
  const left = Math.min(x, window.innerWidth - 190);
  const top = Math.min(y, window.innerHeight - (items.length * 34 + 12));

  return (
    <ul className="ctxmenu" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      {items.map((it, i) => (
        <li key={i}>
          <button
            className={"ctxmenu__item" + (it.danger ? " ctxmenu__item--danger" : "")}
            onClick={() => {
              it.onClick();
              close();
            }}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
