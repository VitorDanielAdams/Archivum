import { useMemo, useRef, useState } from "react";
import { useVault } from "../store/vault";
import { useNav } from "../store/nav";
import { forceLayout } from "../lib/graphLayout";

const W = 1000;
const H = 800;

// Grafo completo do vault, estilo Obsidian: todos os docs como nós, vínculos
// como arestas. Pan (arrastar fundo) + zoom (scroll) + clique navega ao doc.
export function FullGraphView() {
  const { docs, docsById } = useVault();
  const goDoc = useNav((s) => s.goDoc);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const rafPending = useRef(false);
  const pendingView = useRef<{ x: number; y: number } | null>(null);

  const { positions, edges, isolated } = useMemo(() => {
    const ids = docs.map((d) => d.meta.id);
    const edgeSet = new Map<string, [string, string]>();
    for (const d of docs) {
      for (const to of d.meta.links) {
        if (!docsById.has(to)) continue;
        const key = [d.meta.id, to].sort().join("|");
        edgeSet.set(key, [d.meta.id, to]);
      }
    }
    const edges = Array.from(edgeSet.values());
    const connected = new Set(edges.flat());
    const positions = forceLayout(ids, edges, W, H);
    return { positions, edges, isolated: ids.filter((id) => !connected.has(id)) };
  }, [docs, docsById]);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setView((v) => ({ ...v, scale: Math.min(3, Math.max(0.3, v.scale * delta)) }));
  }

  // Pointer Events + captura: o arrasto continua funcionando mesmo se o
  // cursor sair da área do SVG (mouse events "soltam" o drag nesse caso).
  // Atualização via requestAnimationFrame: evita disparar um render do
  // React a cada pixel do mousemove (isso é o que travava/"crashava" ao
  // arrastar — dezenas de re-renders por segundo empilhados).
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // só inicia o arrasto se o clique foi no FUNDO vazio do svg — clicar
    // num nó (target != currentTarget) deixa passar pro onClick do nó.
    if (e.target !== e.currentTarget) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = { x: e.clientX - view.x, y: e.clientY - view.y };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging.current) return;
    pendingView.current = { x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y };
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      if (pendingView.current) setView((v) => ({ ...v, ...pendingView.current! }));
    });
  }
  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    dragging.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  const q = filter.trim().toLowerCase();

  return (
    <div className="fullgraph">
      <div className="docview__actions">
        <button className="btn btn--ghost" onClick={() => useNav.getState().back()}>
          ← Voltar
        </button>
        <span className="docview__spacer" />
        <input
          className="field__input fullgraph__filter"
          placeholder="destacar…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {docs.length === 0 ? (
        <p className="sidebar__empty">Nenhum documento para mostrar.</p>
      ) : (
        <svg
          className="fullgraph__svg"
          viewBox={`0 0 ${W} ${H}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {edges.map(([a, b], i) => {
              const pa = positions.get(a);
              const pb = positions.get(b);
              if (!pa || !pb) return null;
              return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="graph__edge" />;
            })}
            {docs.map((d) => {
              const p = positions.get(d.meta.id);
              if (!p) return null;
              const matched = q.length > 0 && d.meta.title.toLowerCase().includes(q);
              const dimmed = q.length > 0 && !matched;
              return (
                <g
                  key={d.meta.id}
                  className={"graph__node" + (dimmed ? " graph__node--dim" : "")}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => goDoc(d.meta.id)}
                >
                  <circle
                    r={matched ? 9 : 6}
                    className={"graph__dot" + (d.meta.favorite ? " graph__dot--fav" : "")}
                  />
                  <text x="0" y="18" className="graph__label">
                    {truncate(d.meta.title)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      <div className="fullgraph__hint">
        {docs.length} documentos · {edges.length} vínculos
        {isolated.length > 0 ? ` · ${isolated.length} sem vínculo` : ""} — arraste pra mover,
        scroll pra zoom
        {docs.length > 150 ? " · vault grande: layout simplificado (sem física)" : ""}
      </div>
    </div>
  );
}

function truncate(s: string, n = 20): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
