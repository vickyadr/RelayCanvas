// SVG rendering. Glyphs are drawn in local coordinates and rotated by the
// part transform, so pin positions from the model always match the drawing.

import { KINDS, partBox, pinsOf, railEnds, railHalf, tapPoint, unrotate } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
export const CANVAS_W = 1800;
export const CANVAS_H = 1100;

export function node(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

export function fmtI(a) {
  const v = Math.abs(a);
  if (v >= 1) return v.toFixed(2) + ' A';
  if (v >= 1e-3) return (v * 1e3).toFixed(1) + ' mA';
  return (v * 1e6).toFixed(0) + ' uA';
}
export function fmtV(v) {
  return Math.abs(v) >= 10 ? v.toFixed(1) + ' V' : v.toFixed(2) + ' V';
}

function transformOf(p) {
  return `translate(${p.x} ${p.y}) rotate(${p.rot || 0})`;
}

export function endPoint(doc, end, depth = 0) {
  // a wire may tap another wire mid span; the stored fraction keeps the joint on
  // the target even when that wire is rerouted
  if (end.pin === 'wire') {
    const target = doc.wires.find(w => w.id === end.wire);
    if (!target || depth > 4) return { x: 0, y: 0 };
    const pts = wirePolyline(doc, target, depth + 1);
    return pointAlong(pts, end.f ?? 0);
  }
  const part = doc.parts.find(p => p.id === end.part);
  if (!part) return { x: 0, y: 0 };
  if (end.pin === 'tap') {
    // older documents stored absolute x/y; convert on the fly
    if (end.t === undefined && Number.isFinite(Number(end.x))) {
      const local = unrotate(Number(end.x) - part.x, Number(end.y) - part.y, part.rot || 0);
      return tapPoint(part, local.x);
    }
    return tapPoint(part, end.t);
  }
  const pin = pinsOf(part)[end.pin] || { x: part.x, y: part.y };
  return pin;
}

export function wirePolyline(doc, w, depth = 0) {
  const a = endPoint(doc, w.a, depth);
  const b = endPoint(doc, w.b, depth);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return [a, b];

  // a wire tapped onto another wire must leave perpendicular to it
  if (!leavesVertically(doc, w.a)) return [a, { x: b.x, y: a.y }, b];

  // pins sit on vertical parts, so both ends are entered vertically and the
  // horizontal jog goes in the middle. One elbow would leave a short stub at a
  // pin, which is what looked like piled wires after a small drag.
  if (Math.abs(dy) >= 40) {
    const base = Math.round((a.y + b.y) / 2 / 10) * 10;
    const mid = avoidRails(doc, base, Math.min(a.y, b.y) + 12, Math.max(a.y, b.y) - 12);
    return [a, { x: a.x, y: mid }, { x: b.x, y: mid }, b];
  }
  return [a, { x: a.x, y: b.y }, b];
}

/** A wire that taps another wire must leave perpendicular to it, so it cannot run
 *  along the wire it is joined to. */
function leavesVertically(doc, end) {
  if (!end || end.pin !== 'wire') return true;
  const target = doc.wires.find(w => w.id === end.wire);
  if (!target) return true;
  const pts = wirePolyline(doc, target, 1);
  const f = Number(end.f) || 0;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  if (total < 0.001) return true;
  let want = f * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (want <= len || i === pts.length - 2) {
      return Math.abs(pts[i + 1].y - pts[i].y) < 1; // horizontal target segment: leave vertically
    }
    want -= len;
  }
  return true;
}

export function pointAlong(pts, f) {
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lens.push(len);
    total += len;
  }
  if (total < 0.001) return pts[0];
  let want = Math.max(0, Math.min(1, Number(f) || 0)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i]) {
      const t = lens[i] < 0.001 ? 0 : want / lens[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t
      };
    }
    want -= lens[i];
  }
  return pts[pts.length - 1];
}

/** Polyline of a wire: straight when aligned, one elbow otherwise. */
export function wirePoints(doc, w) {
  return wirePolyline(doc, w);
}

export function routePath(a, b) {
  if (Math.abs(a.y - b.y) < 1) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  if (Math.abs(a.x - b.x) < 1) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} L ${a.x} ${b.y} L ${b.x} ${b.y}`;
}

export function render(svg, doc, view) {
  const v = view || {};
  svg.textContent = '';
  node('rect', { x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, class: 'bg' }, svg);

  // rails sit under the wires, so a hop drawn over a rail stays visible instead
  // of being cut in half by the rail line
  const railLayer = node('g', {}, svg);
  const wireLayer = node('g', {}, svg);
  const partLayer = node('g', {}, svg);

  // one pass of segment collection so every wire can hop over horizontal runs
  const hSegs = [];
  for (const w of doc.wires) {
    const pts = wirePoints(doc, w);
    for (let i = 0; i < pts.length - 1; i++) {
      hSegs.push({ wire: w.id, p: pts[i], q: pts[i + 1] });
    }
  }
  for (const part of doc.parts) {
    if (part.kind !== 'rail') continue;
    const [a, b] = railEnds(part);
    hSegs.push({ wire: null, p: a, q: b });
  }

  for (const w of doc.wires) {
    const pts = wirePoints(doc, w);
    const a = pts[0];
    const b = pts[pts.length - 1];
    const selected = v.selectedWire === w.id;
    const path = node('path', {
      d: hoppedPath(w.id, pts, hSegs),
      class: 'wire' + (selected ? ' sel' : ''),
      'data-wire': w.id
    }, wireLayer);
    if (v.sim) {
      const ia = Math.abs(v.sim.amps.get(w.a.part) || 0);
      const ib = Math.abs(v.sim.amps.get(w.b.part) || 0);
      if (ia > 1e-6 || ib > 1e-6) path.classList.add('live');
    }
    if (selected) {
      for (const [end, pt] of [['a', a], ['b', b]]) {
        node('circle', {
          cx: pt.x,
          cy: pt.y,
          r: 5,
          class: 'handle',
          'data-handle': '1',
          'data-wire': w.id,
          'data-end': end
        }, wireLayer);
      }
    }
  }

  // one dot per real connection: every rail tap or wire tap, plus any pin that
  // two or more wires share. A single wire on a pin is just a wire end.
  const joints = new Map();
  for (const w of doc.wires) {
    for (const end of [w.a, w.b]) {
      const pt = endPoint(doc, end);
      const key = Math.round(pt.x) + ',' + Math.round(pt.y);
      const rec = joints.get(key) || { x: pt.x, y: pt.y, count: 0, tap: false };
      rec.count += 1;
      if (end.pin === 'tap' || end.pin === 'wire') rec.tap = true;
      joints.set(key, rec);
    }
  }
  for (const rec of joints.values()) {
    if (!rec.tap && rec.count < 2) continue;
    node('circle', { cx: rec.x, cy: rec.y, r: 3, class: 'dot' }, wireLayer);
  }

  for (const p of doc.parts) drawPart(p.kind === 'rail' ? railLayer : partLayer, doc, p, v);

  const overlay = node('g', {}, svg);
  for (const id of v.selection || []) {
    const part = doc.parts.find(p => p.id === id);
    if (!part) continue;
    const box = partBox(part);
    node('rect', { x: box.x, y: box.y, width: box.w, height: box.h, class: 'sel' }, overlay);
  }
  if (v.marquee) {
    const m = v.marquee;
    node('rect', {
      x: Math.min(m.x0, m.x1),
      y: Math.min(m.y0, m.y1),
      width: Math.abs(m.x1 - m.x0),
      height: Math.abs(m.y1 - m.y0),
      class: 'marquee'
    }, overlay);
  }
  if (v.ghost) node('path', { d: v.ghost, class: 'ghost' }, svg);
}

// A vertical run hops over any horizontal run it does not connect to. This is the
// drawing convention for "crossing, not joined"; the model itself never connects
// two wires by geometry.
function hoppedPath(wireId, pts, segs) {
  let d = 'M ' + pts[0].x + ' ' + pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (Math.abs(p.x - q.x) > 1) {
      d += ' L ' + q.x + ' ' + q.y;
      continue;
    }
    const down = q.y > p.y;
    const lo = Math.min(p.y, q.y);
    const hi = Math.max(p.y, q.y);
    const hits = [];
    for (const s of segs) {
      if (s.wire === wireId) continue;
      if (Math.abs(s.p.y - s.q.y) > 1) continue;
      const xlo = Math.min(s.p.x, s.q.x);
      const xhi = Math.max(s.p.x, s.q.x);
      if (p.x < xlo || p.x > xhi) continue;
      const y = s.p.y;
      // a hop needs room for the 7 px arc; 8 px is the smallest margin that keeps
      // crossings next to a bend visible
      if (y <= lo + 8 || y >= hi - 8) continue;
      // a horizontal run that starts or ends exactly here is joined, not crossed
      const joined = Math.hypot(s.p.x - p.x, s.p.y - y) < 3 || Math.hypot(s.q.x - p.x, s.q.y - y) < 3;
      if (!joined) hits.push(y);
    }
    hits.sort((m, n) => (down ? m - n : n - m));
    for (const y of hits) {
      d += ' L ' + p.x + ' ' + (y - (down ? 7 : -7));
      d += ' A 7 7 0 0 ' + (down ? 1 : 0) + ' ' + p.x + ' ' + (y + (down ? 7 : -7));
    }
    d += ' L ' + q.x + ' ' + q.y;
  }
  return d;
}

// A jog that lands on a rail axis makes the wire disappear into the rail, which
// reads as if the wire joined that rail. Nudge the jog off any rail line.
function avoidRails(doc, mid, lo, hi) {
  const rails = [];
  for (const part of doc.parts) {
    if (part.kind !== 'rail') continue;
    const [a, b] = railEnds(part);
    if (Math.abs(a.y - b.y) < 1) rails.push(a.y);
  }
  if (!rails.length) return mid;
  const hits = (y) => rails.some(r => Math.abs(r - y) < 8);
  if (!hits(mid)) return mid;
  for (const delta of [10, -10, 20, -20, 30, -30, 40, -40]) {
    const y = mid + delta;
    if (y > lo && y < hi && !hits(y)) return y;
  }
  return mid;
}

function pinDots(g, part) {
  const pins = pinsOf(part);
  pins.forEach((pt, i) => {
    node('circle', {
      cx: pt.x - part.x,
      cy: pt.y - part.y,
      r: 3.4,
      class: 'pin',
      'data-part': part.id,
      'data-pin': i
    }, g);
  });
}

function drawPart(layer, doc, part, view) {
  const g = node('g', {
    transform: transformOf(part),
    'data-id': part.id,
    'data-kind': part.kind
  }, layer);
  // invisible grab area, so clicking the label or the empty space still selects it
  const half = part.kind === 'rail' ? railHalf(part) : 0;
  node('rect', {
    x: part.kind === 'rail' ? -half : -32,
    y: part.kind === 'rail' ? -10 : -24,
    width: part.kind === 'rail' ? half * 2 : 64,
    height: part.kind === 'rail' ? 20 : 48,
    class: 'hit',
    'data-part': part.id,
    ...(part.kind === 'rail' ? { 'data-tap': '1' } : {})
  }, g);
  const live = () => !!(view.sim && Math.abs(view.sim.amps.get(part.id) || 0) > 1e-6);
  const failed = view.sim && view.sim.dev.get(part.id) && view.sim.dev.get(part.id).failed;
  const symClass = 'sym' + (live() ? ' live' : '');
  const boxClass = 'box' + (failed ? ' failed' : live() ? ' live' : '');

  if (part.kind === 'rail') {
    node('line', { x1: -half, y1: 0, x2: half, y2: 0, class: 'rail' }, g);
    const label = node('text', { x: -half, y: -9, class: 'label' }, g);
    label.textContent = `${part.props.label || part.id}  ${part.props.v} ${part.props.ac ? 'VAC ' + part.props.f + ' Hz' : 'VDC'}`;
  }

  if (part.kind === 'switch') {
    const nc = !!part.props.nc;
    // a driven NC contact rests closed, so draw it closed before the first Run
    const resting = nc && part.props.owner ? true : !!part.props.closed;
    const closed = view.sim ? view.sim.isClosed(part) : resting;
    node('line', { x1: 0, y1: -18, x2: 0, y2: -11, class: symClass }, g);
    node('line', { x1: 0, y1: 6, x2: 0, y2: 18, class: symClass }, g);
    node('circle', { cx: 0, cy: -11, r: 2.4, class: 'dot' }, g);
    // the seat is the NC resting shape; once it opens the glyph must read as a plain NO
    if (nc && closed) node('line', { x1: 0, y1: -11, x2: 14, y2: -11, class: symClass }, g);
    node('circle', { cx: 0, cy: 6, r: 2.6, class: 'dot' }, g);
    const tip = closed ? (nc ? [14, -11] : [0, -11]) : [15, -12];
    node('line', { x1: 0, y1: 6, x2: tip[0], y2: tip[1], class: symClass }, g);
    const ownerPart = part.props.owner ? doc.parts.find(x => x.id === part.props.owner) : null;
    const ownerName = ownerPart ? (ownerPart.props.label || ownerPart.id) : part.props.owner;
    const name = part.props.label || (part.props.owner ? ownerName + (nc ? ' NC' : ' NO') : 'SW ' + part.id);
    const t = node('text', { x: nc ? 24 : 18, y: 3, class: 'label' }, g);
    t.textContent = name;
  }

  if (part.kind === 'coil') {
    const dev = view.sim ? view.sim.dev.get(part.id) : null;
    const on = dev ? dev.on : false;
    const box = node('rect', { x: -23, y: -16, width: 46, height: 32, rx: 4, class: boxClass }, g);
    if (Number(part.props.ton) > 0) box.setAttribute('stroke-dasharray', '4 3');
    node('path', { d: 'M -13 8 q 6.5 -16 13 0 q 6.5 -16 13 0', class: symClass }, g);
    const t = node('text', { x: 29, y: -6, class: 'label' }, g);
    t.textContent = part.props.label || part.id;
    if (Number(part.props.ton) > 0) {
      const b = node('text', { x: 29, y: 11, class: 'value' }, g);
      b.textContent = 'T ' + Math.round(Number(part.props.ton) * 1000) + ' ms';
    }
    if (view.sim) {
      const val = node('text', { x: 29, y: 26, class: 'value' }, g);
      val.textContent = (on ? 'ON ' : 'off ') + fmtV(view.sim.volts.get(part.id) || 0);
    }
  }

  if (part.kind === 'passive') {
    const cap = Number(part.props.c) > 0;
    node('line', { x1: 0, y1: -18, x2: 0, y2: cap ? -4 : -14, class: symClass }, g);
    node('line', { x1: 0, y1: cap ? 4 : 14, x2: 0, y2: 18, class: symClass }, g);
    if (cap) {
      node('line', { x1: -11, y1: -4, x2: 11, y2: -4, class: symClass }, g);
      node('line', { x1: -11, y1: 4, x2: 11, y2: 4, class: symClass }, g);
    } else {
      node('rect', { x: -8, y: -14, width: 16, height: 28, rx: 2, class: boxClass }, g);
    }
    const t = node('text', { x: 15, y: -4, class: 'label' }, g);
    t.textContent = part.props.label || part.id;
    if (view.sim) {
      const val = node('text', { x: 15, y: 9, class: 'value' }, g);
      val.textContent = fmtI(view.sim.amps.get(part.id) || 0);
    }
  }

  if (part.kind === 'led') {
    node('line', { x1: 0, y1: -18, x2: 0, y2: -12, class: symClass }, g);
    node('line', { x1: 0, y1: 12, x2: 0, y2: 18, class: symClass }, g);
    const lit = live();
    node('path', { d: 'M -11 -12 L 11 -12 L 0 6 Z', class: lit ? 'led-on' : boxClass }, g);
    node('line', { x1: -11, y1: 6, x2: 11, y2: 6, class: symClass }, g);
    node('line', { x1: 0, y1: 6, x2: 0, y2: 12, class: symClass }, g);
    if (lit) {
      node('line', { x1: -16, y1: -6, x2: -22, y2: -12, class: symClass }, g);
      node('line', { x1: 16, y1: -6, x2: 22, y2: -12, class: symClass }, g);
    }
    const t = node('text', { x: 24, y: -4, class: 'label' }, g);
    t.textContent = part.props.label || part.id;
    if (view.sim) {
      const val = node('text', { x: 24, y: 9, class: 'value' }, g);
      val.textContent = fmtI(view.sim.amps.get(part.id) || 0);
    }
  }

  if (part.kind === 'out') {
    node('rect', { x: -29, y: -15, width: 58, height: 30, rx: 4, class: boxClass }, g);
    node('line', { x1: 0, y1: -18, x2: 0, y2: -15, class: symClass }, g);
    node('line', { x1: 0, y1: 15, x2: 0, y2: 18, class: symClass }, g);
    const t = node('text', { x: 0, y: 4, class: 'label', 'text-anchor': 'middle' }, g);
    t.textContent = part.props.label || part.id;
  }

  if (part.kind !== 'rail') pinDots(g, part);
}
