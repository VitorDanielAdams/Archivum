import { useVault } from "../store/vault";
import { useNav } from "../store/nav";
import type { Doc } from "../types";

// Grafo "ego": o documento atual no centro e seus vizinhos (relacionados +
// backlinks) ao redor. Clicar num nó navega até ele.
export function GraphView({ doc }: { doc: Doc }) {
  const { docsById, docs } = useVault();
  const goDoc = useNav((s) => s.goDoc);

  const related = doc.meta.links
    .map((id) => docsById.get(id))
    .filter((d): d is Doc => Boolean(d));
  const backlinks = docs.filter(
    (d) => d.meta.id !== doc.meta.id && d.meta.links.includes(doc.meta.id)
  );

  // vizinhos únicos
  const seen = new Set<string>();
  const neighbors: Doc[] = [];
  for (const d of [...related, ...backlinks]) {
    if (!seen.has(d.meta.id)) {
      seen.add(d.meta.id);
      neighbors.push(d);
    }
  }

  const W = 360;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const R = neighbors.length > 6 ? 140 : 115;

  const placed = neighbors.map((d, i) => {
    const angle = (2 * Math.PI * i) / Math.max(neighbors.length, 1) - Math.PI / 2;
    return { d, x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });

  return (
    <div className="graph">
      {neighbors.length === 0 ? (
        <p className="sidebar__empty">Este documento ainda não tem vínculos.</p>
      ) : (
        <svg className="graph__svg" viewBox={`0 0 ${W} ${H}`} width="100%">
          {placed.map((n) => (
            <line
              key={"e" + n.d.meta.id}
              x1={cx}
              y1={cy}
              x2={n.x}
              y2={n.y}
              className="graph__edge"
            />
          ))}
          {placed.map((n) => (
            <g
              key={n.d.meta.id}
              className="graph__node"
              transform={`translate(${n.x},${n.y})`}
              onClick={() => goDoc(n.d.meta.id)}
            >
              <circle r="9" className="graph__dot" />
              <text x="0" y="22" className="graph__label">
                {truncate(n.d.meta.title)}
              </text>
            </g>
          ))}
          {/* nó central */}
          <g transform={`translate(${cx},${cy})`}>
            <circle r="13" className="graph__dot graph__dot--center" />
            <text x="0" y="-20" className="graph__label graph__label--center">
              {truncate(doc.meta.title)}
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}

function truncate(s: string, n = 18): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
