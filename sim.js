// Simulation core. One fixed step: build nets, solve nodal equations, then let
// stored device state advance. Contacts never change inside a solve, which keeps
// feedback circuits (relay NC in series with its own coil) stable.

import { partById } from './model.js';
import { buildNets, UnionFind } from './nets.js';
import { solveLinear } from './solve.js';

export const GROUND = '@gnd';
const WIRE_R = 1e-3;

export class Sim {
  constructor(doc) {
    this.doc = doc;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.dev = new Map();
    this.capV = new Map();
    this.indI = new Map();
    this.nodeV = new Map();
    this.volts = new Map();
    this.amps = new Map();
    this.flags = { short: false, singular: false, maxI: 0, shortWireIds: new Set(), shortPartIds: new Set() };
    this.samples = new Map();
    this.shortLatched = false;
    this.shortWireIdsLatched = new Set();
    this.shortPartIdsLatched = new Set();
    this.windowSize = 1;
    for (const p of this.doc.parts) {
      // a driven NC contact rests closed, a driven NO rests open
      const resting = p.props.owner ? !!p.props.nc : !!p.props.closed;
      this.dev.set(p.id, { on: resting, closed: resting, closeT: 0, want: resting, held: resting, holdT: 0, fault: 0, failed: false, arcT: 0, bounceT: 0, bouncing: false, triggered: false });
    }
  }

  toggle(id) {
    const part = partById(this.doc, id);
    const d = this.dev.get(id);
    if (!part || !d || part.kind !== 'switch' || part.props.owner || d.failed) return;
    d.closed = !d.closed;
    d.on = d.closed;
  }

  isClosed(part) {
    const d = this.dev.get(part.id);
    if (!d || d.failed) return false;
    return d.closed;
  }

  // dt is in seconds; props ton/toff are in seconds too
  step(dt) {
    this.t += dt;
    const acRail = this.doc.parts.find(p => p.kind === 'rail' && p.props.ac);
    this.windowSize = acRail
      ? Math.max(2, Math.round(1 / (Number(acRail.props.f) || 50) / dt))
      : 1;
    const nets = buildNets(this.doc);
    const railIdentity = (r) => {
      if (!r || !r.props || !r.props.ac) return null;
      if (r.props.n) {
        const o = String(r.props.owner || '').trim();
        return o || null;
      }
      return String(r.id || '').trim() || null;
    };
    const railsByNet = new Map();
    for (const p of this.doc.parts) {
      if (p.kind !== 'rail') continue;
      const nk = nets.netOf({ part: p.id, pin: 'tap' });
      if (!railsByNet.has(nk)) railsByNet.set(nk, []);
      railsByNet.get(nk).push(p);
    }
    // graph of nets connected by conducting components (closed switches, passive, coils)
    const netAdj = new Map();
    const addEdge = (a, b) => {
      if (a === b) return;
      if (!netAdj.has(a)) netAdj.set(a, new Set());
      if (!netAdj.has(b)) netAdj.set(b, new Set());
      netAdj.get(a).add(b);
      netAdj.get(b).add(a);
    };
    for (const p of this.doc.parts) {
      if (p.kind === 'rail') continue;
      if (p.kind === 'label') continue;
      const failed = this.dev.get(p.id) && this.dev.get(p.id).failed;
      if (failed) continue;
      let conducting = true;
      if (p.kind === 'switch') conducting = this.isClosed(p);
      if (!conducting) continue;
      const netA = nets.netOf({ part: p.id, pin: 0 });
      const netB = nets.netOf({ part: p.id, pin: 1 });
      addEdge(netA, netB);
      if (p.kind === 'triac' || p.kind === 'thyristor') {
        const netG = nets.netOf({ part: p.id, pin: 2 });
        addEdge(netA, netG);
      }
    }
    // union-find over nets using component edges
    const uf = new UnionFind();
    for (const nk of new Set([...railsByNet.keys(), ...netAdj.keys()])) uf.add(nk);
    for (const [a, bs] of netAdj.entries()) for (const b of bs) uf.union(a, b);
    // group rails by connected component
    const compRails = new Map();
    for (const [nk, rs] of railsByNet.entries()) {
      const root = uf.find(nk);
      if (!compRails.has(root)) compRails.set(root, []);
      compRails.get(root).push(...rs);
    }
    const shortComp = new Set();
    const compHasShort = new Map();
    for (const [root, rs] of compRails.entries()) {
      const ids = [...new Set(rs.map(railIdentity).filter(Boolean))];
      if (ids.length > 1) { shortComp.add(root); compHasShort.set(root, true); }
    }
    const crossOwnerShort = shortComp.size > 0;
    const shortNets = new Set();
    for (const [nk] of railsByNet.entries()) {
      if (shortComp.has(uf.find(nk))) shortNets.add(nk);
    }
    const shortWireIds = new Set();
    for (const w of this.doc.wires) {
      const netA = nets.netOf(w.a);
      const netB = nets.netOf(w.b);
      if (shortComp.has(uf.find(netA)) || shortComp.has(uf.find(netB))) shortWireIds.add(w.id);
    }
    const failedParts = new Set();
    if (shortWireIds.size || crossOwnerShort) {
      for (const p of this.doc.parts) {
        if (p.kind === 'rail') continue;
        if (p.kind === 'switch' && !this.isClosed(p)) continue;
        const netA = nets.netOf({ part: p.id, pin: 0 });
        const netB = nets.netOf({ part: p.id, pin: 1 });
        if (shortComp.has(uf.find(netA)) || shortComp.has(uf.find(netB))) {
          const d = this.dev.get(p.id);
          if (d) { d.failed = true; if (p.kind === 'coil') d.on = false; }
          failedParts.add(p.id);
        }
      }
    }
    for (const w of this.doc.wires) {
      if (failedParts.has(w.a.part) || failedParts.has(w.b.part)) shortWireIds.add(w.id);
    }
    const shortPartIds = new Set(failedParts);
    for (const p of this.doc.parts) {
      if (p.kind !== 'rail') continue;
      const nk = nets.netOf({ part: p.id, pin: 'tap' });
      if (shortComp.has(uf.find(nk))) shortPartIds.add(p.id);
    }
    if (shortWireIds.size || shortPartIds.size || crossOwnerShort) {
      this.shortLatched = true;
      for (const id of shortWireIds) this.shortWireIdsLatched.add(id);
      for (const id of shortPartIds) this.shortPartIdsLatched.add(id);
    }
    this.flags.short = this.shortLatched;
    this.flags.shortWireIds = this.shortWireIdsLatched;
    this.flags.shortPartIds = this.shortPartIdsLatched;
    let Vprev = new Map([[GROUND, 0]]);
    if (this.nodeV && this.nodeV.size) {
      for (const [k, val] of this.nodeV) Vprev.set(k, val);
    }
    let els = [];
    let nodes = [GROUND];
    let V = Vprev;
    const hasDiode = this.doc.parts.some(p => p.kind === 'diode');
    const iterations = hasDiode ? 6 : 1;
    for (let iter = 0; iter < iterations; iter++) {
      nodes = [GROUND];
      const addNode = (k) => { if (!nodes.includes(k)) nodes.push(k); };
      els = [];
      for (const p of this.doc.parts) {
        if (p.kind === 'label') continue;
        if (p.kind === 'rail') {
          const nk = nets.netOf({ part: p.id, pin: 'tap' });
          addNode(nk);
          const d = this.dev.get(p.id);
          if (d && d.failed) continue;
          const amp = p.props.n ? 0 : (Number(p.props.v) || 0);
          els.push({
            type: 'src', id: p.id, n: nk,
            v: p.props.ac ? amp * Math.SQRT2 * Math.sin(2 * Math.PI * (Number(p.props.f) || 50) * this.t) : amp,
            r: Math.max(1e-3, Number(p.props.rsrc) || 0.1)
          });
          continue;
        }
        const a = nets.netOf({ part: p.id, pin: 0 });
        const b = nets.netOf({ part: p.id, pin: 1 });
        addNode(a);
        addNode(b);
        let g = null;
        if (p.kind === 'thyristor' || p.kind === 'triac') {
          g = nets.netOf({ part: p.id, pin: 2 });
          addNode(g);
        }
        const dev = this.dev.get(p.id);
        if (dev && dev.failed) {
          els.push({ type: 'open', id: p.id, a, b });
          continue;
        }
        if (p.kind === 'switch') {
          const closed = this.isClosed(p);
          els.push(closed ? { type: 'r', id: p.id, a, b, r: WIRE_R } : { type: 'open', id: p.id, a, b });
          continue;
        }
        if (p.kind === 'diode') {
          const va = Vprev.get(a) || 0;
          const vb = Vprev.get(b) || 0;
          const vv = va - vb;
          const vf = Number(p.props.vf) || 0.7;
          const ron = Math.max(1e-3, Number(p.props.ron) || 1);
          if (vv >= vf) els.push({ type: 'r', id: p.id, a, b, r: ron });
          else els.push({ type: 'open', id: p.id, a, b });
          continue;
        }
        if (p.kind === 'thyristor' || p.kind === 'triac') {
          const triac = p.kind === 'triac';
          const vgt = Math.max(0.1, Number(p.props.vgt) || 0.7);
          const ron = Math.max(1e-3, Number(p.props.ron) || 0.01);
          const va = Vprev.get(a) || 0;
          const vb = Vprev.get(b) || 0;
          const vg = Vprev.get(g) || 0;
          const vAK = va - vb;
          const vGK = vg - vb;
          if (!dev.triggered) {
            if (triac) {
              if (Math.abs(vGK) >= vgt && Math.abs(vAK) >= vgt) dev.triggered = true;
            } else {
              if (vAK >= vgt && vGK >= vgt) dev.triggered = true;
            }
          }
          if (dev.triggered) els.push({ type: 'r', id: p.id, a, b, r: ron });
          else els.push({ type: 'open', id: p.id, a, b });
          continue;
        }
        if (p.kind === 'passive' && Number(p.props.c) > 0) {
          els.push({ type: 'c', id: p.id, a, b, c: Number(p.props.c) * 1e-6 });
          continue;
        }
        if (p.kind === 'passive' && Number(p.props.l) > 0) {
          els.push({ type: 'l', id: p.id, a, b, l: Number(p.props.l) });
          continue;
        }
        els.push({ type: 'r', id: p.id, a, b, r: Math.max(WIRE_R, Number(p.props.r) || WIRE_R) });
      }

      const idx = new Map(nodes.map((k, i) => [k, i]));
      const n = nodes.length;
      const A = Array.from({ length: n }, () => new Float64Array(n));
      const z = new Float64Array(n);
      for (const e of els) {
        if (e.type === 'r') {
          const g = 1 / e.r;
          const i = idx.get(e.a); const j = idx.get(e.b);
          A[i][i] += g; A[j][j] += g; A[i][j] -= g; A[j][i] -= g;
        } else if (e.type === 'c') {
          e.g = e.c / dt;
          e.vprev = this.capV.get(e.id) || 0;
          const i = idx.get(e.a); const j = idx.get(e.b);
          A[i][i] += e.g; A[j][j] += e.g; A[i][j] -= e.g; A[j][i] -= e.g;
          z[i] += e.g * e.vprev; z[j] -= e.g * e.vprev;
        } else if (e.type === 'l') {
          e.g = dt / Math.max(1e-9, e.l);
          e.iprev = this.indI.get(e.id) || 0;
          const i = idx.get(e.a); const j = idx.get(e.b);
          A[i][i] += e.g; A[j][j] += e.g; A[i][j] -= e.g; A[j][i] -= e.g;
          z[i] -= e.iprev; z[j] += e.iprev;
        } else if (e.type === 'src') {
          const g = 1 / e.r;
          const i = idx.get(e.n);
          A[i][i] += g; A[i][0] -= g; A[0][i] -= g;
          z[i] += e.v / e.r;
        }
      }
      for (let i = 1; i < n; i++) A[i][i] += 1e-12;
      const m = n - 1;
      const M = Array.from({ length: m }, () => new Float64Array(m));
      const rhs = new Float64Array(m);
      for (let i = 1; i < n; i++) {
        rhs[i - 1] = z[i];
        for (let j = 1; j < n; j++) M[i - 1][j - 1] = A[i][j];
      }
      const x = solveLinear(M, rhs);
      this.flags.singular = !x;
      const Vnext = new Map([[GROUND, 0]]);
      for (let i = 1; i < n; i++) Vnext.set(nodes[i], x ? x[i - 1] : 0);
      let maxdv = 0;
      for (const k of nodes) {
        maxdv = Math.max(maxdv, Math.abs((Vnext.get(k) || 0) - (Vprev.get(k) || 0)));
      }
      Vprev = Vnext;
      V = Vnext;
      if (maxdv < 1e-9) break;
    }
    const Vfinal = V;

    this.volts.clear();
    this.amps.clear();
    let maxI = 0;
    for (const e of els) {
      const va = Vfinal.get(e.a !== undefined ? e.a : e.n);
      const vb = Vfinal.get(e.b !== undefined ? e.b : GROUND);
      if (e.type === 'src') {
        const i = (e.v - va) / e.r;
        this.amps.set(e.id, i);
        this.volts.set(e.id, va);
        maxI = Math.max(maxI, Math.abs(i));
        continue;
      }
      const v = va - vb;
      this.volts.set(e.id, v);
      let i = 0;
      if (e.type === 'r') i = v / e.r;
      else if (e.type === 'c') i = e.g * v - e.g * e.vprev;
      else if (e.type === 'l') { i = e.iprev + e.g * v; this.indI.set(e.id, i); }
      this.amps.set(e.id, i);
      maxI = Math.max(maxI, Math.abs(i));
    }

    for (const e of els) {
      if (e.type === 'c') this.capV.set(e.id, Vfinal.get(e.a) - Vfinal.get(e.b));
    }
    this.nodeV = Vfinal;

    for (const p of this.doc.parts) {
      const d = this.dev.get(p.id);
      const i = Math.abs(this.amps.get(p.id) || 0);
      const v = Math.abs(this.volts.get(p.id) || 0);
      const power = v * i;
      const ratingA = Number(p.props.rating) || 0;
      const ratingW = Number(p.props.ratingW) || 0;
      if ((ratingA > 0 && i > ratingA) || (ratingW > 0 && power > ratingW)) {
        d.fault += dt;
        if (d.fault >= 0.05) {
          d.failed = true;
          if (p.kind === 'coil') d.on = false;
        }
      } else {
        d.fault = 0;
      }
      if (p.kind === 'thyristor' || p.kind === 'triac') {
        const d = this.dev.get(p.id);
        const i = Math.abs(this.amps.get(p.id) || 0);
        const ih = Number(p.props.ih) || 0.005;
        if (d && d.triggered && i < ih) d.triggered = false;
      }
      if (p.kind === 'coil') {
        const vNow = Math.abs(this.volts.get(p.id) || 0);
        let buf = this.samples.get(p.id);
        if (!buf) {
          buf = [];
          this.samples.set(p.id, buf);
        }
        buf.push(vNow);
        while (buf.length > this.windowSize) buf.shift();
        // an AC coil is held by RMS over one cycle, so it does not drop every half wave
        const v = this.windowSize > 1
          ? Math.sqrt(buf.reduce((sum, x) => sum + x * x, 0) / buf.length)
          : vNow;
        const pickup = Number(p.props.pickup) || 0;
        const release = Number(p.props.release) || 0;
        if (!d.failed) {
          if (!d.on && v >= pickup) d.on = true;
          else if (d.on && v <= release) d.on = false;
        }
        // off-delay: the contacts stay in the energised position for `toff` after
        // the coil drops. This is a timer relay holding its output, not a contact
        // that opens slowly.
        const holdFor = Math.max(0, Number(p.props.toff) || 0);
        if (d.on) {
          d.held = true;
          d.holdT = 0;
        } else if (d.held) {
          d.holdT += dt;
          if (d.holdT >= holdFor) {
            d.held = false;
            d.holdT = 0;
          }
        }
      }

      // Contact timing follows the contact direction, not the coil direction:
      // closing always needs time, opening is immediate.
      if (p.kind === 'switch' && p.props.owner) {
        const ownerPart = this.doc.parts.find(x => x.id === p.props.owner);
        const owner = ownerPart ? this.dev.get(ownerPart.id) : null;
        // closing follows the coil right now; holding follows the off-delay window,
        // so a pending on-delay must reset as soon as the coil drops
        const wantClosed = owner ? (owner.on ? !p.props.nc : !!p.props.nc) : false;
        const keepClosed = owner ? (owner.held ? !p.props.nc : !!p.props.nc) : false;
        // tOperate on the relay is how long its contact needs to close
        const closeDelay = Math.max(0, Number((ownerPart && ownerPart.props.ton) || 0));
        const arcTime = Math.max(0, Number(p.props.arc) || 0);
        const bounceTime = Math.max(0, Number(p.props.bounce) || 0);
        const current = Math.abs(this.amps.get(p.id) || 0);

        if (d.closed && !keepClosed) {
          // opening is delayed by an arc while current is still flowing
          if (arcTime > 0 && current > 1e-6 && d.arcT <= 0) d.arcT = arcTime;
          if (d.arcT > 0) {
            d.arcT -= dt;
            if (d.arcT <= 0) {
              d.arcT = 0;
              d.closed = false;
              d.closeT = 0;
              d.bounceT = 0;
              d.bouncing = false;
            }
          } else {
            d.closed = false;
            d.closeT = 0;
            d.arcT = 0;
            d.bounceT = 0;
            d.bouncing = false;
          }
        } else if (!d.closed && wantClosed) {
          if (d.arcT > 0) d.arcT = 0;
          if (d.bouncing) {
            d.closeT = 0;
          } else if (d.want) {
            // a contact needs at least one full step before it can start closing,
            // so a coil that loses supply inside the same step cannot seal itself in
            d.closeT += dt;
            if (d.closeT >= closeDelay) {
              d.closeT = 0;
              if (bounceTime > 0) {
                d.closed = false;
                d.bounceT = bounceTime;
                d.bouncing = true;
              } else {
                d.closed = true;
                d.bounceT = 0;
                d.bouncing = false;
              }
            }
          }
        } else if (!d.closed) {
          d.closeT = 0;
          d.arcT = 0;
        }

        // bounce: a freshly closed contact reopens briefly, then settles
        if (d.bouncing && keepClosed) {
          d.bounceT -= dt;
          if (d.bounceT <= 0) {
            d.bounceT = 0;
            d.bouncing = false;
            d.closed = true;
          }
        } else if (!keepClosed) {
          d.bouncing = false;
          d.bounceT = 0;
        }

        if (keepClosed) d.arcT = 0;
        d.want = wantClosed;
      }
    }

    this.flags.maxI = maxI;
    this.flags.short = this.shortLatched || maxI > 50;
    return this;
  }
}
