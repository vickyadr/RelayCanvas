// Canvas interactions: place, select, drag, rotate, delete, and draw wires.
// Connection is explicit: a wire runs pin to pin, or pin to a rail tap.
// Geometry never connects anything by itself, so a rung may cross other rails.

import { KINDS, makePart, partBox, partById, pinsOf, railEnds, railHalf, snap, unrotate } from './model.js';
import { endPoint, pointAlong, render, routePath, wirePolyline } from './render.js';

/** Drop wires whose tap target no longer exists. */
export function pruneWires(doc) {
  for (let pass = 0; pass < 10; pass++) {
    const ids = new Set(doc.wires.map(w => w.id));
    const next = doc.wires.filter(w =>
      !(w.a.pin === 'wire' && !ids.has(w.a.wire)) &&
      !(w.b.pin === 'wire' && !ids.has(w.b.wire)));
    if (next.length === doc.wires.length) return;
    doc.wires = next;
  }
}

/** Remove a wire and any wire that was tapped onto it. */
export function dropWire(doc, id) {
  const gone = new Set([id]);
  let changed = true;
  const list = doc.wires.filter(w => w.id !== id);
  while (changed) {
    changed = false;
    for (const w of list) {
      for (const end of [w.a, w.b]) {
        if (end.pin === 'wire' && gone.has(end.wire) && !gone.has(w.id)) {
          gone.add(w.id);
          changed = true;
        }
      }
    }
  }
  return list.filter(w => !gone.has(w.id));
}

export class Editor {
  constructor(svg, doc, hooks = {}) {
    this.svg = svg;
    this.doc = doc;
    this.hooks = hooks;
    this.tool = 'select';
    this.placeKind = null;
    this.placeKey = null;
    this.selectedId = null;
    this.selectedWire = null;
    this.selection = new Set();
    this.marquee = null;
    this.pan = null;
    this.wireStart = null;
    this.wireDrag = null;
    this.drag = null;
    this.sim = null;
    this.ghost = null;
    this.placeProps = null;
    this.history = [];

    // middle drag pans the scroll container; also stops the browser autoscroll
    svg.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    svg.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    svg.addEventListener('pointerdown', (e) => this.onDown(e));
    svg.addEventListener('pointermove', (e) => this.onMove(e));
    svg.addEventListener('pointerup', (ev) => this.onUp(ev));
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.render();
  }

  setDoc(doc) {
    this.doc = doc;
    this.selectedId = null;
    this.selectedWire = null;
    this.selection = new Set();
    this.marquee = null;
    this.wireStart = null;
    this.history = [];
    this.sim = null;
    this.render();
    this.select(null);
  }

  point(e) {
    const r = this.svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  snapshot() {
    this.history.push(JSON.stringify({ parts: this.doc.parts, wires: this.doc.wires }));
    if (this.history.length > 60) this.history.shift();
  }

  undo() {
    const prev = this.history.pop();
    if (!prev) return;
    const saved = JSON.parse(prev);
    this.doc.parts = saved.parts;
    this.doc.wires = saved.wires;
    this.selectedId = null;
    this.changed();
    this.select(null);
  }

  mutate(fn, opts) {
    if (!opts || !opts.noSnapshot) this.snapshot();
    fn(this.doc);
    this.changed(opts);
  }

  changed(opts) {
    this.render();
    if (this.hooks.onChange) this.hooks.onChange(opts);
  }

  render() {
    render(this.svg, this.doc, {
      sim: this.sim,
      selection: [...this.selection],
      selectedWire: this.selectedWire,
      marquee: this.marquee,
      ghost: this.ghost
    });
  }

  selectWire(id) {
    this.selectedWire = id;
    this.selectedId = null;
    this.selection = new Set();
    if (this.hooks.onSelect) this.hooks.onSelect(null);
    this.render();
  }

  select(id) {
    this.selectedWire = null;
    this.selectedId = id;
    this.selection = new Set(id ? [id] : []);
    if (this.hooks.onSelect) this.hooks.onSelect(id);
    this.render();
  }

  selectMany(ids) {
    this.selectedWire = null;
    this.selection = new Set(ids);
    this.selectedId = ids.length === 1 ? ids[0] : null;
    if (this.hooks.onSelect) this.hooks.onSelect(this.selectedId);
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
    this.placeKind = null;
    this.placeKey = null;
    this.placeProps = null;
    this.wireStart = null;
    this.ghost = null;
    this.render();
    if (this.hooks.onTool) this.hooks.onTool(tool);
  }

  arm(kind, props, key) {
    this.tool = 'place';
    this.placeKind = kind;
    this.placeProps = props || null;
    this.placeKey = key || kind;
    this.wireStart = null;
    if (this.hooks.onTool) this.hooks.onTool('place');
  }

  // magnetic fallback: a click near a pin or a rail still connects, so the user
  // does not have to land exactly on a glyph
  nearestPin(pt) {
    let best = null;
    for (const part of this.doc.parts) {
      if (part.kind === 'rail') continue;
      pinsOf(part).forEach((pin, i) => {
        const d = Math.hypot(pt.x - pin.x, pt.y - pin.y);
        if (d <= 14 && (!best || d < best.d)) best = { part: part.id, pin: i, d };
      });
    }
    return best ? { part: best.part, pin: best.pin } : null;
  }

  nearestRailTap(pt) {
    let best = null;
    for (const part of this.doc.parts) {
      if (part.kind !== 'rail') continue;
      const [a, b] = railEnds(part);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) continue;
      let u = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
      u = Math.max(0, Math.min(1, u));
      const px = a.x + dx * u;
      const py = a.y + dy * u;
      const dist = Math.hypot(pt.x - px, pt.y - py);
      if (dist <= 16 && (!best || dist < best.dist)) best = { part, px, py, dist };
    }
    if (!best) return null;
    const half = railHalf(best.part);
    const local = unrotate(best.px - best.part.x, best.py - best.part.y, best.part.rot || 0);
    const t = Math.max(-half + 4, Math.min(half - 4, snap(local.x)));
    return { part: best.part.id, pin: 'tap', t };
  }

  // nearest point on any wire, so joining a wire does not need pixel precision
  wireTapAt(pt, maxDist) {
    let best = null;
    for (const w of this.doc.wires) {
      const pts = wirePolyline(this.doc, w);
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      }
      let walked = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        let u = len2 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2 : 0;
        u = Math.max(0, Math.min(1, u));
        const dist = Math.hypot(pt.x - (a.x + dx * u), pt.y - (a.y + dy * u));
        if (!best || dist < best.d) {
          best = { d: dist, f: total > 0 ? (walked + Math.hypot(dx, dy) * u) / total : 0, wire: w.id };
        }
        walked += Math.hypot(dx, dy);
      }
    }
    if (!best || best.d > maxDist) return null;
    return { pin: 'wire', wire: best.wire, f: best.f };
  }

  endpointAt(pinEl, tapEl, pt, wireEl) {
    if (pinEl) return { part: pinEl.dataset.part, pin: Number(pinEl.dataset.pin) };
    if (wireEl) {
      const hit = this.wireTapAt(pt, 26);
      if (hit) return hit;
    }
    if (tapEl) {
      const part = partById(this.doc, tapEl.dataset.part);
      if (!part) return null;
      // taps are stored as an offset along the rail so the wire follows when the rail moves
      const local = unrotate(pt.x - part.x, pt.y - part.y, part.rot || 0);
      const half = railHalf(part);
      return { part: part.id, pin: 'tap', t: Math.max(-half + 4, Math.min(half - 4, snap(local.x))) };
    }
    return this.nearestPin(pt) || this.wireTapAt(pt, 14) || this.nearestRailTap(pt);
  }

  onDown(e) {
    if (e.button === 1) {
      e.preventDefault();
      const stage = this.svg.parentElement;
      this.pan = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pt = this.point(e);
    const handleEl = e.target.closest('[data-handle]');
    const wireEl = e.target.closest('[data-wire]');
    const pinEl = e.target.closest('[data-pin]');
    const tapEl = e.target.closest('[data-tap]');
    const partEl = e.target.closest('[data-id]');

    if (handleEl && this.tool === 'select') {
      this.wireDrag = { wireId: handleEl.dataset.wire, end: handleEl.dataset.end };
      return;
    }
    if (wireEl && this.tool === 'select') {
      this.selectWire(wireEl.dataset.wire);
      return;
    }

    if (this.tool === 'place' && this.placeKind) {
      const part = makePart(this.placeKind, snap(pt.x), snap(pt.y), this.doc);
      if (this.placeProps) Object.assign(part.props, this.placeProps);
      this.mutate(doc => doc.parts.push(part));
      this.setTool('select');
      this.select(part.id);
      return;
    }

    if (this.tool === 'wire') {
      const end = this.endpointAt(pinEl, tapEl, pt, wireEl);
      if (!end) return;
      if (!this.wireStart) {
        this.wireStart = end;
        this.render();
        return;
      }
      const start = this.wireStart;
      this.wireStart = null;
      this.ghost = null;
      this.mutate(doc => {
        doc.wires.push({
          id: 'W' + (doc.wires.length + 1) + '-' + Math.random().toString(36).slice(2, 6),
          a: start,
          b: end
        });
      });
      return;
    }

    if (partEl) {
      const id = partEl.dataset.id;
      if (!this.selection.has(id)) this.select(id);
      const parts = [...this.selection].map(pid => partById(this.doc, pid)).filter(Boolean);
      this.drag = {
        ids: parts.map(p => p.id),
        origin: parts.map(p => ({ id: p.id, x: p.x, y: p.y })),
        start: pt,
        moved: false
      };
    } else {
      this.select(null);
      this.marquee = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
      this.render();
    }
  }

  onMove(e) {
    if (this.pan) {
      const stage = this.svg.parentElement;
      stage.scrollLeft = this.pan.left - (e.clientX - this.pan.x);
      stage.scrollTop = this.pan.top - (e.clientY - this.pan.y);
      return;
    }
    if (this.drag) {
      if (!this.drag.moved) {
        this.snapshot();
        this.drag.moved = true;
      }
      const pt = this.point(e);
      const ddx = pt.x - this.drag.start.x;
      const ddy = pt.y - this.drag.start.y;
      for (const o of this.drag.origin) {
        const part = partById(this.doc, o.id);
        if (!part) continue;
        part.x = snap(o.x + ddx);
        part.y = snap(o.y + ddy);
      }
      this.render();
      return;
    }
    if (this.marquee) {
      const pt = this.point(e);
      this.marquee.x1 = pt.x;
      this.marquee.y1 = pt.y;
      this.render();
      return;
    }
    if (this.tool === 'wire' && this.wireStart) {
      const pt = this.point(e);
      const a = endPoint(this.doc, this.wireStart);
      this.ghost = routePath(a, pt);
      this.render();
    }
  }

  onUp(e) {
    if (this.pan) {
      this.pan = null;
      return;
    }
    if (this.wireDrag) {
      const { wireId, end } = this.wireDrag;
      this.wireDrag = null;
      const pinEl = e && e.target ? e.target.closest('[data-pin]') : null;
      const tapEl = e && e.target ? e.target.closest('[data-tap]') : null;
      const wireEl = e && e.target ? e.target.closest('[data-wire]') : null;
      const pt = e ? this.point(e) : { x: 0, y: 0 };
      const target = this.endpointAt(pinEl, tapEl, pt, wireEl);
      if (!target) return;
      this.mutate(doc => {
        const wire = doc.wires.find(w => w.id === wireId);
        if (wire) wire[end] = target;
      });
      return;
    }
    if (this.drag) {
      const moved = this.drag.moved;
      const first = this.drag.ids.length === 1 ? partById(this.doc, this.drag.ids[0]) : null;
      this.drag = null;
      if (moved) {
        this.changed();
        return;
      }
      if (first && first.kind === 'switch' && !first.props.owner) {
        this.toggleSwitch(first);
        return;
      }
      return;
    }
    if (this.marquee) {
      const m = this.marquee;
      const x1 = Math.min(m.x0, m.x1);
      const x2 = Math.max(m.x0, m.x1);
      const y1 = Math.min(m.y0, m.y1);
      const y2 = Math.max(m.y0, m.y1);
      const ids = this.doc.parts.filter(p => {
        const b = partBox(p);
        return b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1;
      }).map(p => p.id);
      this.marquee = null;
      if (ids.length) this.selectMany(ids);
      else this.select(null);
    }
  }

  // single click toggles a manual switch; the stored prop keeps the state across
  // pause and reset, so the drawing always matches what the simulation will use
  toggleSwitch(part) {
    part.props.closed = !part.props.closed;
    if (this.sim) this.sim.toggle(part.id);
    this.render();
    if (this.hooks.onToggle) this.hooks.onToggle(part.id);
  }

  onKey(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select') return;
    if (e.key === 'Escape') {
      this.wireStart = null;
      this.ghost = null;
      this.setTool('select');
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedWire) {
      e.preventDefault();
      const id = this.selectedWire;
      this.mutate(doc => { doc.wires = dropWire(doc, id); });
      this.select(null);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection.size) {
      e.preventDefault();
      const ids = new Set(this.selection);
      this.mutate(doc => {
        doc.parts = doc.parts.filter(p => !ids.has(p.id));
        doc.wires = doc.wires.filter(w => !ids.has(w.a.part) && !ids.has(w.b.part));
        for (const p of doc.parts) {
          if (ids.has(p.props.owner)) p.props.owner = '';
        }
        pruneWires(doc);
      });
      this.select(null);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      if (!this.selectedId) return;
      const part = partById(this.doc, this.selectedId);
      if (!part) return;
      this.mutate(() => { part.rot = ((part.rot || 0) + 90) % 360; });
      return;
    }
    if (e.key === 'w' || e.key === 'W') { this.setTool('wire'); return; }
    if (e.key === 'v' || e.key === 'V') { this.setTool('select'); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      this.undo();
    }
  }
}
