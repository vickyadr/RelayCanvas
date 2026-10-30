// Simulation core. One fixed step: build nets, solve nodal equations, then let
// stored device state advance. Contacts never change inside a solve, which keeps
// feedback circuits (relay NC in series with its own coil) stable.

import { partById, pinsOf } from './model.js';
import { buildNets } from './nets.js';
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
    this.volts = new Map();
    this.amps = new Map();
    this.flags = { short: false, singular: false, maxI: 0 };
    this.samples = new Map();
    this.windowSize = 1;
    for (const p of this.doc.parts) {
      // a driven NC contact rests closed, a driven NO rests open
      const resting = p.props.owner ? !!p.props.nc : !!p.props.closed;
      this.dev.set(p.id, { on: resting, closed: resting, closeT: 0, want: resting, held: resting, holdT: 0, fault: 0, failed: false });
    }
  }

  toggle(id) {
    const part = partById(this.doc, id);
    const d = this.dev.get(id);
    if (!part || !d || part.kind !== 'switch' || part.props.owner) return;
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
    const els = [];
    const nodes = [GROUND];
    const addNode = (k) => {
      if (!nodes.includes(k)) nodes.push(k);
    };

    for (const p of this.doc.parts) {
      if (p.kind === 'rail') {
        const nk = nets.netOf({ part: p.id, pin: 'tap' });
        addNode(nk);
        const d = this.dev.get(p.id);
        // a tripped rail is open: it contributes no source, the net falls to 0 V
        if (d && d.failed) continue;
        const amp = Number(p.props.v) || 0;
        els.push({
          type: 'src',
          id: p.id,
          n: nk,
          v: p.props.ac
            ? amp * Math.SQRT2 * Math.sin(2 * Math.PI * (Number(p.props.f) || 50) * this.t)
            : amp,
          r: Math.max(1e-3, Number(p.props.rsrc) || 0.1)
        });
        continue;
      }
      const a = nets.netOf({ part: p.id, pin: 0 });
      const b = nets.netOf({ part: p.id, pin: 1 });
      addNode(a);
      addNode(b);
      const dev = this.dev.get(p.id);
      if (dev && dev.failed) {
        els.push({ type: 'open', id: p.id, a, b });
        continue;
      }
      if (p.kind === 'switch') {
        const closed = this.isClosed(p);
        els.push(closed
          ? { type: 'r', id: p.id, a, b, r: WIRE_R }
          : { type: 'open', id: p.id, a, b });
        continue;
      }
      if (p.kind === 'passive' && Number(p.props.c) > 0) {
        els.push({ type: 'c', id: p.id, a, b, c: Number(p.props.c) * 1e-6 });
        continue;
      }
      els.push({
        type: 'r',
        id: p.id,
        a,
        b,
        r: Math.max(WIRE_R, Number(p.props.r) || WIRE_R)
      });
    }

    const idx = new Map(nodes.map((k, i) => [k, i]));
    const n = nodes.length;
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const z = new Float64Array(n);

    for (const e of els) {
      if (e.type === 'r') {
        const g = 1 / e.r;
        const i = idx.get(e.a);
        const j = idx.get(e.b);
        A[i][i] += g;
        A[j][j] += g;
        A[i][j] -= g;
        A[j][i] -= g;
      } else if (e.type === 'c') {
        e.g = e.c / dt;
        e.vprev = this.capV.get(e.id) || 0;
        const i = idx.get(e.a);
        const j = idx.get(e.b);
        A[i][i] += e.g;
        A[j][j] += e.g;
        A[i][j] -= e.g;
        A[j][i] -= e.g;
        z[i] += e.g * e.vprev;
        z[j] -= e.g * e.vprev;
      } else if (e.type === 'src') {
        const g = 1 / e.r;
        const i = idx.get(e.n);
        A[i][i] += g;
        A[i][0] -= g;
        A[0][i] -= g;
        z[i] += e.v / e.r;
      }
    }

    // tiny leak from every node to ground keeps isolated parts from making the
    // matrix singular; it is far below any real current in this model
    for (let i = 1; i < n; i++) A[i][i] += 1e-12;

    // ground is node 0 with a fixed 0 V, so its row and column are dropped
    const m = n - 1;
    const M = Array.from({ length: m }, () => new Float64Array(m));
    const rhs = new Float64Array(m);
    for (let i = 1; i < n; i++) {
      rhs[i - 1] = z[i];
      for (let j = 1; j < n; j++) M[i - 1][j - 1] = A[i][j];
    }

    const x = solveLinear(M, rhs);
    this.flags.singular = !x;
    const V = new Map([[GROUND, 0]]);
    for (let i = 1; i < n; i++) V.set(nodes[i], x ? x[i - 1] : 0);

    this.volts.clear();
    this.amps.clear();
    let maxI = 0;
    for (const e of els) {
      const va = V.get(e.a !== undefined ? e.a : e.n);
      const vb = V.get(e.b !== undefined ? e.b : GROUND);
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
      this.amps.set(e.id, i);
      maxI = Math.max(maxI, Math.abs(i));
    }

    for (const e of els) {
      if (e.type === 'c') this.capV.set(e.id, V.get(e.a) - V.get(e.b));
    }

    for (const p of this.doc.parts) {
      const d = this.dev.get(p.id);
      const i = Math.abs(this.amps.get(p.id) || 0);
      const rating = Number(p.props.rating) || 0;
      if (rating > 0 && i > rating) {
        d.fault += dt;
        if (d.fault >= 0.05) {
          d.failed = true;
          if (p.kind === 'coil') d.on = false;
        }
      } else {
        d.fault = 0;
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
        if (d.closed && !keepClosed) {
          // opening never waits
          d.closed = false;
          d.closeT = 0;
        } else if (!d.closed && wantClosed) {
          // a contact needs at least one full step before it can start closing,
          // so a coil that loses supply inside the same step cannot seal itself in
          if (d.want) {
            d.closeT += dt;
            if (d.closeT >= closeDelay) {
              d.closed = true;
              d.closeT = 0;
            }
          }
        } else if (!d.closed) {
          d.closeT = 0;
        }
        d.want = wantClosed;
      }
    }

    this.flags.maxI = maxI;
    this.flags.short = maxI > 50;
    return this;
  }
}
