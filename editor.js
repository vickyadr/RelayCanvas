// Canvas interactions: place, select, drag, rotate, delete, and draw wires.
// Connection is explicit: a wire runs pin to pin, or pin to a rail tap.
// Geometry never connects anything by itself, so a rung may cross other rails.

import { KINDS, makePart, newId, partBox, partById, pinsOf, railEnds, railHalf, snap, unrotate } from './model.js';
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
    this.clipboard = null;
    this.marquee = null;
    this.pan = null;
    this.wireStart = null;
    this.wireDrag = null;
    this.jogDrag = null;
    this.drag = null;
    this.railResize = null;
    this.sim = null;
    this.ghost = null;
    this.placeProps = null;
    this.history = [];
    this.zoom = 1;

    // middle drag pans the scroll container; also stops the browser autoscroll
    svg.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    svg.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    // Ctrl+wheel zooms the canvas; plain wheel keeps scrolling the stage
    const stage = svg.parentElement;
    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoom = Math.max(0.5, Math.min(4, this.zoom * factor));
      this.render();
    }, { passive: false });
    // re-render on scroll so off-screen parts are culled
    let scrollPending = false;
    stage.addEventListener('scroll', () => {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(() => { scrollPending = false; this.render(); });
    }, { passive: true });
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
    return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom };
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

  copy() {
    if (this.selection.size === 0) return;
    const ids = new Set(this.selection);
    const parts = this.doc.parts
      .filter(p => ids.has(p.id))
      .map(p => ({ ...p, props: { ...p.props } }));
    const wires = this.doc.wires
      .filter(w => ids.has(w.a.part) && ids.has(w.b.part) && w.a.pin !== 'wire' && w.b.pin !== 'wire')
      .map(w => ({ a: { ...w.a }, b: { ...w.b }, ...(Number.isFinite(Number(w.jog)) ? { jog: w.jog } : {}) }));
    this.clipboard = { parts, wires };
  }

  paste() {
    if (!this.clipboard || this.clipboard.parts.length === 0) return;
    const cb = this.clipboard;
    this.mutate(doc => {
      const idMap = new Map();
      for (const cp of cb.parts) {
        const oldLabel = (cp.props && cp.props.label) ? String(cp.props.label) : '';
        // number against what is already on the canvas, so repeated pastes keep
        // climbing instead of all landing on "(2)"
        const root = oldLabel.replace(/ \(\d+\)$/, '');
        let max = 0;
        for (const p of doc.parts) {
          const v = (p.props && p.props.label) ? String(p.props.label) : '';
          if (v === root) max = Math.max(max, 1);
          const m = v.match(/^(.*) \((\d+)\)$/);
          if (m && m[1] === root) max = Math.max(max, Number(m[2]));
        }
        const newLabel = oldLabel ? (max === 0 ? root : `${root} (${max + 1})`) : '';
        const np = { ...cp, id: newId(cp.kind, doc), x: cp.x + 20, y: cp.y + 20, props: { ...cp.props, label: newLabel } };
        idMap.set(cp.id, np.id);
        doc.parts.push(np);
      }
      for (const cw of cb.wires) {
        const na = { ...cw.a, part: idMap.get(cw.a.part) };
        const nb = { ...cw.b, part: idMap.get(cw.b.part) };
        if (!na.part || !nb.part) continue;
        const wire = { id: 'W' + doc.wires.length, a: na, b: nb };
        if (Number.isFinite(Number(cw.jog))) wire.jog = cw.jog;
        doc.wires.push(wire);
      }
      this.selection = new Set(idMap.values());
    });
  }

  duplicate() { this.copy(); this.paste(); }

  selectAll() {
    this.selection = new Set(this.doc.parts.map(p => p.id));
    this.render();
    if (this.hooks.onSelect) this.hooks.onSelect();
  }

  mutate(fn, opts) {
    if (!opts || !opts.noSnapshot) this.snapshot();
    fn(this.doc);
    this.changed(opts);
  }

  changed(opts) {
    // notify first: the host may reset the simulation, and rendering with a stale
    // device list is what produced the "reading 'on'" crash
    if (this.hooks.onChange) this.hooks.onChange(opts);
    this.render();
  }

  render() {
    this.svg.setAttribute('width', Math.round(1800 * this.zoom));
    this.svg.setAttribute('height', Math.round(1100 * this.zoom));
    render(this.svg, this.doc, {
      sim: this.sim,
      selection: [...this.selection],
      selectedWire: this.selectedWire,
      marquee: this.marquee,
      ghost: this.ghost,
      zoom: this.zoom
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
        if (d <= 20 && (!best || d < best.d)) best = { part: part.id, pin: i, d };
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
      if (dist <= 24 && (!best || dist < best.dist)) best = { part, px, py, dist };
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
      const hit = this.wireTapAt(pt, 32);
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
    return this.nearestPin(pt) || this.wireTapAt(pt, 20) || this.nearestRailTap(pt);
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
    const jogEl = e.target.closest('[data-wire-jog]');
    if (jogEl && this.tool === 'select') {
      const wire = this.doc.wires.find(w => w.id === jogEl.dataset.wire);
      if (wire) {
        this.jogDrag = { wireId: wire.id, moved: false };
        return;
      }
    }
    const railResizeEl = e.target.closest('[data-rail-resize]');
    if (railResizeEl && this.tool === 'select') {
      const part = partById(this.doc, railResizeEl.dataset.part);
      if (part && part.kind === 'rail') {
        const ends = railEnds(part);
        const end = railResizeEl.dataset.end;
        const rot = part.rot || 0;
        const u = { x: Math.cos(rot * Math.PI / 180), y: Math.sin(rot * Math.PI / 180) };
        const fixedOpposite = end === 'a'
          ? { x: ends[1].x, y: ends[1].y }
          : { x: ends[0].x, y: ends[0].y };
        this.railResize = { partId: part.id, end, fixedOpposite, u, moved: false };
        return;
      }
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
    if (this.railResize) {
      if (!this.railResize.moved) {
        this.snapshot();
        this.railResize.moved = true;
      }
      const pt = this.point(e);
      const rr = this.railResize;
      const part = partById(this.doc, rr.partId);
      if (part) {
        const u = rr.u;
        const Q = rr.fixedOpposite;
        let t = rr.end === 'b'
          ? (pt.x - Q.x) * u.x + (pt.y - Q.y) * u.y
          : (Q.x - pt.x) * u.x + (Q.y - pt.y) * u.y;
        t = Math.max(80, Math.round(t / 10) * 10);
        if (rr.end === 'b') {
          part.x = snap(Q.x + (t / 2) * u.x);
          part.y = snap(Q.y + (t / 2) * u.y);
        } else {
          part.x = snap(Q.x - (t / 2) * u.x);
          part.y = snap(Q.y - (t / 2) * u.y);
        }
        part.props.len = t;
      }
      this.render();
      return;
    }
    if (this.wireDrag) {
      const wire = this.doc.wires.find(w => w.id === this.wireDrag.wireId);
      if (wire) {
        const other = this.wireDrag.end === 'a' ? wire.b : wire.a;
        const a = endPoint(this.doc, other);
        const pt = this.point(e);
        this.ghost = routePath(a, pt);
      }
      this.render();
      return;
    }
    if (this.jogDrag) {
      if (!this.jogDrag.moved) {
        this.snapshot();
        this.jogDrag.moved = true;
      }
      const wire = this.doc.wires.find(w => w.id === this.jogDrag.wireId);
      if (wire) {
        wire.jog = snap(this.point(e).y);
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
    if (this.railResize) {
      const moved = this.railResize.moved;
      this.railResize = null;
      if (moved) this.changed();
      return;
    }
    if (this.jogDrag) {
      const moved = this.jogDrag.moved;
      this.jogDrag = null;
      if (moved) this.changed();
      return;
    }
    if (this.wireDrag) {
      const { wireId, end } = this.wireDrag;
      this.wireDrag = null;
      this.ghost = null;
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
    const mod = e.ctrlKey || e.metaKey;
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
    if (!mod && (e.key === 'w' || e.key === 'W')) { this.setTool('wire'); return; }
    if (!mod && (e.key === 'v' || e.key === 'V')) { this.setTool('select'); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); this.copy(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); this.paste(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); this.duplicate(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); this.selectAll(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      this.undo();
    }
  }
}
