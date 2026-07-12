// Histórico de navegação (tipo voltar/avançar do navegador) entre as telas
// de "passeio": lista (sidebar), documento aberto, e grafo completo.
// Editar/Configurações ficam de fora — são ações, não lugares pra "voltar".
import { create } from "zustand";
import { useVault } from "./vault";

export type View = { kind: "list" } | { kind: "doc"; id: string } | { kind: "graph" };

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "doc" && b.kind === "doc") return a.id === b.id;
  return true;
}

function applyView(view: View): void {
  useVault.getState().select(view.kind === "doc" ? view.id : null);
}

interface NavState {
  stack: View[];
  index: number;
  go: (view: View) => void;
  goList: () => void;
  goDoc: (id: string) => void;
  goGraph: () => void;
  back: () => void;
  forward: () => void;
}

export const useNav = create<NavState>((set, get) => ({
  stack: [{ kind: "list" }],
  index: 0,

  go: (view) => {
    applyView(view);
    const { stack, index } = get();
    if (sameView(stack[index], view)) return; // já está aqui, não duplica
    const novo = [...stack.slice(0, index + 1), view];
    set({ stack: novo, index: novo.length - 1 });
  },
  goList: () => get().go({ kind: "list" }),
  goDoc: (id) => get().go({ kind: "doc", id }),
  goGraph: () => get().go({ kind: "graph" }),

  back: () => {
    const { stack, index } = get();
    if (index <= 0) return;
    const novoIndex = index - 1;
    applyView(stack[novoIndex]);
    set({ index: novoIndex });
  },

  forward: () => {
    const { stack, index } = get();
    if (index >= stack.length - 1) return;
    const novoIndex = index + 1;
    applyView(stack[novoIndex]);
    set({ index: novoIndex });
  },
}));
