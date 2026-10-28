// Nets are built from explicit pin connections only. Wires that cross a rail
// geometrically do not connect, so a rung can run from RAIL1 to RAIL4 over
// RAIL2 and RAIL3 without touching them.

export class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  add(k) {
    if (!this.parent.has(k)) this.parent.set(k, k);
    return k;
  }
  find(k) {
    if (!this.parent.has(k)) return this.add(k);
    let root = k;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    while (this.parent.get(k) !== root) {
      const next = this.parent.get(k);
      this.parent.set(k, root);
      k = next;
    }
    return root;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Every pin of a rail collapses into one net key, so taps share the rail. */
export function nodeKey(end, byId, wireById) {
  // a wire tap shares the net of the wire it sits on, which is one net by definition
  if (end.pin === 'wire') {
    const target = wireById && wireById.get(end.wire);
    return target ? nodeKey(target.a, byId, wireById) : end.wire + ':missing';
  }
  const part = byId.get(end.part);
  if (!part) return end.part + ':missing';
  return part.kind === 'rail' ? part.id + ':tap' : part.id + ':' + end.pin;
}

export function buildNets(doc) {
  const byId = new Map(doc.parts.map(p => [p.id, p]));
  const wireById = new Map(doc.wires.map(w => [w.id, w]));
  const uf = new UnionFind();
  for (const p of doc.parts) {
    if (p.kind === 'rail') uf.add(p.id + ':tap');
    else {
      uf.add(p.id + ':0');
      uf.add(p.id + ':1');
    }
  }
  for (const w of doc.wires) {
    uf.union(nodeKey(w.a, byId, wireById), nodeKey(w.b, byId, wireById));
  }
  return {
    byId,
    netOf: (end) => uf.find(nodeKey(end, byId, wireById))
  };
}
