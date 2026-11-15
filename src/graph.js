// MATMA's inclusive reverse-impact rules: proven usage weight 1, import-only weight 2.
// Dijkstra is required: visiting nodes in arbitrary BFS order would settle a longer path.
export function reverseDistances(edges, start, maxLevel) {
  const reverse = new Map();
  for (const edge of edges) {
    if (!reverse.has(edge.to)) reverse.set(edge.to, []);
    reverse.get(edge.to).push(edge);
  }
  const distances = new Map([[start, 0]]);
  const unsettled = new Set([start]);
  const settled = new Set();
  while (unsettled.size) {
    const current = [...unsettled].sort((a, b) => distances.get(a) - distances.get(b) || a.localeCompare(b))[0];
    unsettled.delete(current);
    if (settled.has(current)) continue;
    settled.add(current);
    const distance = distances.get(current);
    for (const edge of reverse.get(current) || []) {
      if (edge.from === start) continue;
      const next = distance + edge.weight;
      if (next <= maxLevel && next < (distances.get(edge.from) ?? Infinity)) {
        distances.set(edge.from, next);
        unsettled.add(edge.from);
      }
    }
  }
  return [...distances.entries()].sort((a,b) => a[1] - b[1] || a[0].localeCompare(b[0]));
}

export function impacts(index, id, level) {
  const byId = new Map(index.symbols.map(symbol => [symbol.id, symbol]));
  const distances = reverseDistances(index.edges, id, level);
  const symbols = distances.flatMap(([key, depth]) => byId.has(key) ? [{ ...byId.get(key), impact_level: depth }] : []);
  const unit = new Set();
  const interaction = new Set();
  const missing = new Set();
  for (const symbol of symbols) {
    if (!symbol.public) continue;
    const file = symbol.mirrors.unit_test;
    unit.add(file);
    if (level >= 1 && (symbol.impact_level > 0 || symbol.id === id)) interaction.add(symbol.mirrors.interaction_test);
  }
  return {
    affected_symbols: symbols.map(s => ({ id: s.id, name: s.name, file: s.file, public: s.public, level: s.impact_level })),
    affected_sources: [...new Set(symbols.map(s => s.file))].sort(),
    tests: { unit: [...unit].sort(), interaction: [...interaction].sort(), missing: [...missing] }
  };
}

export function changes(previous, current, level) {
  const old = new Map((previous?.symbols || []).map(s => [s.id, s]));
  const now = new Map((current.symbols || []).map(s => [s.id, s]));
  const changed = [...new Set([...old.keys(), ...now.keys()])].filter(id => !old.has(id) || !now.has(id) || old.get(id).fingerprint !== now.get(id).fingerprint).sort();
  const edges = new Map();
  for (const edge of [...(previous?.edges || []), ...(current.edges || [])]) {
    const key = `${edge.from}\0${edge.to}`;
    if (!edges.has(key) || edges.get(key).weight > edge.weight) edges.set(key, edge);
  }
  const joined = { symbols: [...new Map([...(previous?.symbols || []), ...(current.symbols || [])].map(s => [s.id,s])).values()], edges: [...edges.values()] };
  const all = new Map();
  for (const id of changed) {
    const reached = impacts(joined, id, level);
    for (const symbol of reached.affected_symbols) {
      const currentDepth = all.get(symbol.id)?.level ?? Infinity;
      if (symbol.level < currentDepth) all.set(symbol.id, symbol);
    }
  }
  const symbols = [...all.values()].sort((a,b) => a.level - b.level || a.id.localeCompare(b.id));
  return { changed_symbols: changed.map(id => ({ id, change: !old.has(id) ? 'added' : !now.has(id) ? 'removed' : 'modified' })),
    affected_symbols: symbols, affected_sources: [...new Set(symbols.map(s => s.file))].sort(),
    selected_targets: symbols.filter(s => s.public).map(s => s.id).sort() };
}
