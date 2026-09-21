// Try each starting frame and greedily follow the strongest confirmed edge.
export function suggestOrder(frames, pairs) {
  const original = frames.map((frame) => frame.id);
  const edges = new Map(pairs.map((pair) => [`${pair.fromId}:${pair.toId}`, pair]));
  let best = { order: original, connected: -1, weight: -1 };
  for (const start of original) {
    const order = [start];
    const remaining = new Set(original.filter((id) => id !== start));
    let connected = 0;
    let weight = 0;
    while (remaining.size) {
      const candidates = [...remaining].map((id) => edges.get(`${order.at(-1)}:${id}`))
        .filter((edge) => edge?.status === 'confirmed')
        .sort((a, b) => b.confidence - a.confidence || b.score - a.score);
      const edge = candidates[0];
      const next = edge?.toId || remaining.values().next().value;
      if (edge) {
        connected++;
        weight += edge.confidence;
      }
      order.push(next);
      remaining.delete(next);
    }
    if (connected > best.connected || (connected === best.connected && weight > best.weight)) {
      best = { order, connected, weight };
    }
  }
  return best;
}
