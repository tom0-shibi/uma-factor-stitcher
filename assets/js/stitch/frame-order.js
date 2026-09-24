// Rank directed evidence, allowing review edges to guide order without authorizing a crop.
function edgeWeight(edge, fromHeight) {
  if (!edge || edge.kind === 'duplicate' || edge.status === 'unresolved' || !(edge.offsetY > 0)) return -1;
  const ambiguity = Math.max(0, edge.score - (edge.secondBestScore ?? edge.score));
  return edge.score * 0.55 + edge.confidence * 0.25
    + Math.min(1, ambiguity / 0.1) * 0.1 + Math.min(1, edge.overlapHeight / fromHeight) * 0.1;
}

// Try every starting frame, then follow the strongest available directed evidence.
export function suggestOrder(frames, pairs) {
  const ids = frames.map((frame) => frame.id);
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  const edges = new Map(pairs.map((pair) => [`${pair.fromId}:${pair.toId}`, pair]));
  let best = { order: ids, connected: 0, supported: 0, weight: -Infinity };
  for (const start of ids) {
    const order = [start];
    const remaining = new Set(ids.filter((id) => id !== start));
    let connected = 0;
    let supported = 0;
    let weight = 0;
    while (remaining.size) {
      const from = byId.get(order.at(-1));
      const candidates = [...remaining].map((id) => {
        const edge = edges.get(`${from.id}:${id}`);
        return { id, edge, weight: edgeWeight(edge, from.factorRegion?.height || from.sourceHeight) };
      }).sort((a, b) => b.weight - a.weight);
      const next = candidates[0];
      if (next.edge?.status === 'confirmed') connected++;
      if (next.weight >= 0) supported++;
      weight += next.weight;
      order.push(next.id);
      remaining.delete(next.id);
    }
    if (weight > best.weight) best = { order, connected, supported, weight };
  }
  return best;
}
