// Layout de grafo por simulação de forças (nós se repelem, vínculos puxam).
// Implementação simples e sem dependências — roda uma vez ao abrir o grafo.
export interface Point {
  x: number;
  y: number;
}

// Layout circular simples: O(n), sempre instantâneo. Usado quando o vault
// é grande demais pra rodar física sem custar caro.
function circleLayout(nodeIds: string[], width: number, height: number): Map<string, Point> {
  const map = new Map<string, Point>();
  const n = nodeIds.length;
  const r = Math.min(width, height) / 2 - 40;
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    map.set(id, { x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle) });
  });
  return map;
}

// Reescala/centraliza as posições finais pra caber no viewBox. ESSENCIAL:
// a simulação pode "explodir" (nós muito próximos geram repulsão gigante
// e saem voando pra coordenadas enormes) — sem isso, o grafo fica
// tecnicamente calculado mas invisível (tudo fora da área visível).
function fitToBounds(positions: Map<string, Point>, width: number, height: number): Map<string, Point> {
  const margin = 40;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return circleLayout(Array.from(positions.keys()), width, height);

  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const availW = width - margin * 2;
  const availH = height - margin * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const offX = margin + (availW - spanX * scale) / 2;
  const offY = margin + (availH - spanY * scale) / 2;

  const result = new Map<string, Point>();
  for (const [id, p] of positions) {
    const x = Number.isFinite(p.x) ? p.x : (minX + maxX) / 2;
    const y = Number.isFinite(p.y) ? p.y : (minY + maxY) / 2;
    result.set(id, { x: offX + (x - minX) * scale, y: offY + (y - minY) * scale });
  }
  return result;
}

// Limite acima do qual não rodamos física (custo O(n²) por iteração) — só
// o layout circular instantâneo. Vaults grandes (ex.: pasta de repositórios
// com centenas de .md) não devem travar a UI.
const MAX_FISICA = 150;

export function forceLayout(
  nodeIds: string[],
  edges: [string, string][],
  width: number,
  height: number
): Map<string, Point> {
  const n = nodeIds.length;
  if (n === 0) return new Map();
  if (n > MAX_FISICA) return circleLayout(nodeIds, width, height);

  interface P extends Point {
    vx: number;
    vy: number;
  }
  const pos = new Map<string, P>();
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    const r = Math.min(width, height) / 3;
    pos.set(id, {
      x: width / 2 + r * Math.cos(angle),
      y: height / 2 + r * Math.sin(angle),
      vx: 0,
      vy: 0,
    });
  });

  const validEdges = edges.filter(([a, b]) => pos.has(a) && pos.has(b) && a !== b);
  const k = Math.sqrt((width * height) / Math.max(n, 1));
  const minDist = Math.max(k * 0.1, 4); // piso de distância — evita força infinita quando dois nós colidem
  const maxSpeed = k * 2; // trava velocidade — evita "explosão" numérica
  const iterations = n > 80 ? 90 : 160;

  for (let iter = 0; iter < iterations; iter++) {
    // repulsão entre todos os pares (Coulomb)
    for (const a of nodeIds) {
      const pa = pos.get(a)!;
      let fx = 0;
      let fy = 0;
      for (const b of nodeIds) {
        if (a === b) continue;
        const pb = pos.get(b)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), minDist);
        const force = (k * k) / dist;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      pa.vx += fx;
      pa.vy += fy;
    }
    // atração ao longo dos vínculos (mola)
    for (const [a, b] of validEdges) {
      const pa = pos.get(a)!;
      const pb = pos.get(b)!;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), minDist);
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force * 0.5;
      const fy = (dy / dist) * force * 0.5;
      pa.vx -= fx;
      pa.vy -= fy;
      pb.vx += fx;
      pb.vy += fy;
    }
    // integra posição, amortece, trava velocidade, puxa suavemente pro centro
    for (const id of nodeIds) {
      const p = pos.get(id)!;
      p.vx *= 0.85;
      p.vy *= 0.85;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxSpeed) {
        const s = maxSpeed / speed;
        p.vx *= s;
        p.vy *= s;
      }
      p.x += p.vx * 0.02;
      p.y += p.vy * 0.02;
      p.x += (width / 2 - p.x) * 0.004;
      p.y += (height / 2 - p.y) * 0.004;
    }
  }

  const raw = new Map<string, Point>();
  for (const id of nodeIds) {
    const p = pos.get(id)!;
    raw.set(id, { x: p.x, y: p.y });
  }
  return fitToBounds(raw, width, height);
}
