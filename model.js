// Component model for RelayCanvas. Pure data, no DOM.

export const RAIL_HALF = 160;
export const PIN_HALF = 18;

export const KINDS = {
  rail: {
    label: 'Rail',
    pins: [[-RAIL_HALF, 0], [RAIL_HALF, 0]],
    props: { v: 0, ac: false, f: 50, rsrc: 0.1, len: 320, rating: 0, label: '' }
  },
  switch: {
    label: 'Saklar',
    pins: [[0, -PIN_HALF], [0, PIN_HALF]],
    props: { closed: false, owner: '', nc: false, label: '' }
  },
  passive: {
    label: 'Resistor',
    pins: [[0, -PIN_HALF], [0, PIN_HALF]],
    props: { r: 2400, c: 0, rating: 0, label: '' }
  },
  coil: {
    label: 'Relay',
    pins: [[0, -PIN_HALF], [0, PIN_HALF]],
    props: { r: 2400, pickup: 18, release: 6, ton: 0, toff: 0, rating: 0, label: '' }
  },
  out: {
    label: 'Output',
    pins: [[0, -PIN_HALF], [0, PIN_HALF]],
    props: { r: 2400, label: 'OUT' }
  },
  led: {
    label: 'LED',
    pins: [[0, -PIN_HALF], [0, PIN_HALF]],
    props: { r: 1200, rating: 0, label: '' }
  }
};

/** Rotate a local point around the part origin. */
export function rotate(x, y, rot) {
  const r = ((rot % 360) + 360) % 360;
  if (r === 90) return { x: -y, y: x };
  if (r === 180) return { x: -x, y: -y };
  if (r === 270) return { x: y, y: -x };
  return { x, y };
}

/** Half length of a rail, editable per part. */
export function railHalf(part) {
  const len = Number(part.props && part.props.len);
  return Math.max(40, (Number.isFinite(len) && len > 0 ? len : 320)) / 2;
}

/** Absolute pin positions of a part. */
export function pinsOf(part) {
  const half = part.kind === 'rail' ? railHalf(part) : RAIL_HALF;
  return KINDS[part.kind].pins.map(([x, y]) => {
    const px = part.kind === 'rail' ? Math.sign(x) * half : x;
    const p = rotate(px, y, part.rot || 0);
    return { x: part.x + p.x, y: part.y + p.y };
  });
}

/** Absolute body ends of a rail, used for hit testing and taps. */
export function railEnds(part) {
  const half = railHalf(part);
  const a = rotate(-half, 0, part.rot || 0);
  const b = rotate(half, 0, part.rot || 0);
  return [
    { x: part.x + a.x, y: part.y + a.y },
    { x: part.x + b.x, y: part.y + b.y }
  ];
}

/** Bounding box used for selection and the marquee. */
export function partBox(part) {
  if (part.kind === 'rail') {
    const half = railHalf(part);
    const vertical = Math.abs((part.rot || 0) % 180) === 90;
    return vertical
      ? { x: part.x - 14, y: part.y - half, w: 28, h: half * 2 }
      : { x: part.x - half, y: part.y - 14, w: half * 2, h: 28 };
  }
  return { x: part.x - 34, y: part.y - 26, w: 68, h: 52 };
}

/** Inverse of rotate, used to turn a canvas point back into rail space. */
export function unrotate(x, y, rot) {
  const r = ((rot % 360) + 360) % 360;
  if (r === 90) return { x: y, y: -x };
  if (r === 180) return { x: -x, y: -y };
  if (r === 270) return { x: -y, y: x };
  return { x, y };
}

/** Point on the rail axis at offset t from its centre, clamped to the rail. */
export function tapPoint(part, t) {
  const half = railHalf(part);
  const off = Math.max(-half + 4, Math.min(half - 4, Number(t) || 0));
  const p = rotate(off, 0, part.rot || 0);
  return { x: part.x + p.x, y: part.y + p.y };
}

export function newDoc() {
  return { version: 1, dt: 1, parts: [], wires: [] };
}

let counter = 0;
export function newId(kind, doc) {
  const prefix = kind === 'rail' ? 'R' : kind === 'coil' ? 'K' : kind === 'switch' ? 'S' : kind === 'out' ? 'O' : 'X';
  let n = ++counter;
  let id = prefix + n;
  while (doc.parts.some(p => p.id === id)) id = prefix + (++n);
  return id;
}

export function makePart(kind, x, y, doc) {
  const meta = KINDS[kind];
  const id = newId(kind, doc);
  return {
    id,
    kind,
    x: Math.round(x),
    y: Math.round(y),
    rot: 0,
    props: { ...meta.props, ...(kind === 'out' ? { label: id } : {}) }
  };
}

/**
 * Trust-boundary check for anything coming from disk or localStorage.
 * Unknown kinds, missing props, or wires pointing at missing parts would
 * otherwise crash rendering and leave the editor unusable.
 */
export function sanitizeDoc(raw) {
  if (!raw || !Array.isArray(raw.parts)) return null;
  const parts = [];
  const seen = new Set();
  for (const p of raw.parts) {
    if (!p || typeof p.id !== 'string' || !KINDS[p.kind] || seen.has(p.id)) continue;
    seen.add(p.id);
    parts.push({
      id: p.id,
      kind: p.kind,
      x: Number.isFinite(Number(p.x)) ? Math.round(Number(p.x)) : 0,
      y: Number.isFinite(Number(p.y)) ? Math.round(Number(p.y)) : 0,
      rot: Number.isFinite(Number(p.rot)) ? ((Math.round(Number(p.rot)) % 360) + 360) % 360 : 0,
      props: { ...KINDS[p.kind].props, ...(p.props && typeof p.props === 'object' ? p.props : {}) }
    });
  }
  const byId = new Map(parts.map(p => [p.id, p]));
  const wireIds = new Set((Array.isArray(raw.wires) ? raw.wires : []).map(w => w && w.id).filter(Boolean));
  const fixEnd = (e) => {
    if (!e) return null;
    if (e.pin === 'wire') {
      if (!wireIds.has(e.wire)) return null;
      const f = Number(e.f);
      return { pin: 'wire', wire: e.wire, f: Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0 };
    }
    if (!byId.has(e.part)) return null;
    if (e.pin === 'tap') {
      const part = byId.get(e.part);
      if (Number.isFinite(Number(e.t))) return { part: e.part, pin: 'tap', t: Number(e.t) };
      if (!Number.isFinite(Number(e.x)) || !Number.isFinite(Number(e.y))) return null;
      const local = unrotate(Number(e.x) - part.x, Number(e.y) - part.y, part.rot || 0);
      return { part: e.part, pin: 'tap', t: local.x };
    }
    if (!Number.isInteger(Number(e.pin)) || Number(e.pin) < 0 || Number(e.pin) > 1) return null;
    return { part: e.part, pin: Number(e.pin) };
  };
  const wires = [];
  const usedWireIds = new Set();
  for (const w of Array.isArray(raw.wires) ? raw.wires : []) {
    if (!w) continue;
    const a = fixEnd(w.a);
    const b = fixEnd(w.b);
    if (!a || !b) continue;
    // duplicate ids break hop detection and wire taps, so make every id unique
    let id = String(w.id || 'W' + wires.length);
    let n = 2;
    while (usedWireIds.has(id)) id = String(w.id || 'W') + '-' + n++;
    usedWireIds.add(id);
    wires.push({ id, a, b });
  }
  // drop wires that tap a wire which did not survive validation
  for (let pass = 0; pass < 8; pass++) {
    const ids = new Set(wires.map(w => w.id));
    const next = wires.filter(w =>
      !(w.a.pin === 'wire' && !ids.has(w.a.wire)) &&
      !(w.b.pin === 'wire' && !ids.has(w.b.wire)));
    if (next.length === wires.length) break;
    wires.length = 0;
    wires.push(...next);
  }
  return { version: 1, dt: 1, parts, wires };
}

export function partById(doc, id) {
  return doc.parts.find(p => p.id === id) || null;
}

/** Grid snap helper. */
export function snap(v, step = 10) {
  return Math.round(v / step) * step;
}
