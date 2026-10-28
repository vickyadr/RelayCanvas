// App wiring: palette, toolbar, simulation loop, and persistence.

import { KINDS, newDoc, sanitizeDoc } from './model.js';
import { Editor } from './editor.js';
import { renderPanel } from './panel.js';
import { Sim } from './sim.js';
import { fmtI } from './render.js';

const KEY = 'relaycanvas.doc';
const DT = 0.001;

const svg = document.getElementById('canvas');
const palette = document.getElementById('palette');
const panelEl = document.getElementById('panel');
const statusEl = document.getElementById('status');

const PALETTE = [
  { kind: 'rail', label: 'Rail 24 V', props: { v: 24 } },
  { kind: 'rail', label: 'Rail 0 V', props: { v: 0 } },
  { kind: 'switch', label: 'Saklar' },
  { kind: 'coil', label: 'Relay' },
  { kind: 'passive', label: 'Resistor' },
  { kind: 'passive', label: 'Kapasitor', props: { r: 0, c: 1000 } },
  { kind: 'passive', label: 'Jumper', props: { r: 0, c: 0 } },
  { kind: 'led', label: 'LED' },
  { kind: 'out', label: 'Output' }
];

let doc = load() || starter();
let sim = null;
let running = false;
let lastTs = 0;
let acc = 0;
let lastPaint = 0;

const editor = new Editor(svg, doc, {
  onChange: (opts) => {
    persist();
    // rebuilding the panel while the user is typing would drop the focus
    if (!opts || !opts.keepFocus) renderPanel(panelEl, doc, editor);
    if (sim) sim.reset();
  },
  onSelect: () => renderPanel(panelEl, doc, editor),
  // toggling a switch must not reset the running simulation
  onToggle: () => { persist(); renderPanel(panelEl, doc, editor); },
  onTool: () => markTools()
});

function markTools() {
  for (const b of document.querySelectorAll('[data-tool]')) {
    b.classList.toggle('on', b.dataset.tool === editor.tool);
  }
  for (const b of palette.querySelectorAll('button')) {
    b.classList.toggle('on', editor.tool === 'place' && b.dataset.key === editor.placeKey);
  }
}

function buildPalette() {
  const h = document.createElement('h2');
  h.textContent = 'Komponen';
  palette.append(h);
  for (const item of PALETTE) {
    const b = document.createElement('button');
    b.textContent = item.label;
    b.dataset.arm = item.kind;
    b.dataset.key = item.label;
    b.addEventListener('click', () => {
      editor.arm(item.kind, item.props || null, item.label);
      markTools();
    });
    palette.append(b);
  }
}

function setStatus(text, mode) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (mode ? ' ' + mode : '');
}

// explains the common reason nothing moves, instead of showing a silent zero
function circuitHint() {
  if (!doc.wires.length) return 'belum ada kabel';
  const rails = doc.parts.filter(p => p.kind === 'rail');
  if (rails.length < 2) return 'butuh dua rail';
  const vs = rails.map(r => Number(r.props.v) || 0);
  if (Math.max(...vs) === Math.min(...vs)) return 'semua rail tegangannya sama, tidak ada arus';
  return '';
}

function start() {
  if (!sim) sim = new Sim(doc);
  editor.sim = sim;
  running = true;
  lastTs = 0;
  acc = 0;
  document.getElementById('run').classList.add('on');
  requestAnimationFrame(frame);
}

function stop() {
  running = false;
  document.getElementById('run').classList.remove('on');
  setStatus(sim ? 'pause di ' + sim.t.toFixed(2) + ' s' : 'siap');
}

function loadDemo() {
  doc = demoDoc();
  reset();
  editor.setDoc(doc);
  persist();
  renderPanel(panelEl, doc, editor);
  setStatus('contoh dimuat');
}

function reset() {
  running = false;
  sim = null;
  editor.sim = null;
  document.getElementById('run').classList.remove('on');
  editor.render();
  setStatus('siap');
}

function frame(ts) {
  if (!running || !sim) return;
  if (!lastTs) lastTs = ts;
  acc += Math.min((ts - lastTs) / 1000, 0.2);
  lastTs = ts;
  let steps = 0;
  try {
    while (acc >= DT && steps < 400) {
      sim.step(DT);
      acc -= DT;
      steps++;
    }
  } catch (err) {
    running = false;
    document.getElementById('run').classList.remove('on');
    setStatus('error: ' + (err && err.message ? err.message : err), 'bad');
    return;
  }
  if (ts - lastPaint > 40) {
    lastPaint = ts;
    editor.render();
    const hint = circuitHint();
    if (hint) {
      setStatus(hint, 'warn');
    } else {
      let text = 't ' + sim.t.toFixed(2) + ' s  Imaks ' + fmtI(sim.flags.maxI);
      if (sim.flags.singular) text += '  matriks singular';
      setStatus(text, sim.flags.short ? 'warn' : null);
    }
  }
  requestAnimationFrame(frame);
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ parts: doc.parts, wires: doc.wires }));
  } catch (err) {
    // storage full or disabled: the file save still works
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return sanitizeDoc(JSON.parse(raw));
  } catch (err) {
    return null;
  }
}

function demoDoc() {
  const d = newDoc();
  const rail = (id, y, v, ac = false) => ({ id, kind: 'rail', x: 600, y, rot: 0, props: { v, ac, f: 50, rsrc: 0.1, len: 1000 } });
  const coil = (id, x, y, ton) => ({ id, kind: 'coil', x, y, rot: 0, props: { r: 2400, pickup: 18, release: 6, ton, toff: 0, rating: 0 } });
  const sw = (id, x, y, extra) => ({ id, kind: 'switch', x, y, rot: 0, props: { closed: false, owner: '', nc: false, ...extra } });
  const out = (id, x, y, label) => ({ id, kind: 'out', x, y, rot: 0, props: { r: 2400, label } });

  d.parts.push(
    rail('R1', 80, 24), rail('R2', 200, 220, true), rail('R3', 320, 0), rail('R4', 440, 0),
    sw('S1', 200, 140), coil('K1', 200, 380, 0.01),
    sw('S2', 320, 140), coil('K2', 320, 380, 0.01),
    sw('S3', 470, 250, { owner: 'K1' }),
    sw('S4', 560, 180, { owner: 'K2' }),
    sw('S5', 560, 300, { owner: 'K3', nc: true, closed: true }),
    coil('K3', 515, 380, 0.01),
    sw('S6', 700, 140, { owner: 'K2' }),
    sw('S7', 700, 260, { owner: 'K3', nc: true, closed: true }),
    out('O1', 700, 380, 'DOWN'),
    sw('S8', 860, 140, { owner: 'K1' }),
    out('O2', 860, 380, 'UP'),
    { id: 'J1', kind: 'passive', x: 1000, y: 380, rot: 0, props: { r: 0, c: 0, rating: 0 } }
  );

  // taps are stored as an offset from the rail centre, so they survive moving the rail
  const tap = (part, x) => ({ part, pin: 'tap', t: x - 600 });
  const pin = (part, i) => ({ part, pin: i });
  const wires = (a, b) => ({ id: 'W' + (d.wires.length + 1), a, b });

  d.wires.push(
    wires(tap('R1', 200, 80), pin('S1', 0)),
    wires(pin('S1', 1), pin('K1', 0)),
    wires(pin('K1', 1), tap('R4', 200, 440)),

    wires(tap('R1', 320, 80), pin('S2', 0)),
    wires(pin('S2', 1), pin('K2', 0)),
    wires(pin('K2', 1), tap('R4', 320, 440)),

    wires(tap('R1', 470, 80), pin('S3', 0)),
    wires(pin('S3', 1), pin('K3', 0)),
    wires(tap('R1', 560, 80), pin('S4', 0)),
    wires(pin('S4', 1), pin('S5', 0)),
    wires(pin('S5', 1), pin('K3', 0)),
    wires(pin('K3', 1), tap('R4', 515, 440)),

    wires(tap('R1', 700, 80), pin('S6', 0)),
    wires(pin('S6', 1), pin('S7', 0)),
    wires(pin('S7', 1), pin('O1', 0)),
    wires(pin('O1', 1), tap('R4', 700, 440)),

    wires(tap('R1', 860, 80), pin('S8', 0)),
    wires(pin('S8', 1), pin('O2', 0)),
    wires(pin('O2', 1), tap('R4', 860, 440)),

    wires(tap('R3', 1000, 320), pin('J1', 0)),
    wires(pin('J1', 1), tap('R4', 1000, 440))
  );
  return d;
}

function starter() {
  const d = newDoc();
  const rails = [
    { id: 'R1', kind: 'rail', x: 500, y: 100, rot: 0, props: { v: 24, ac: false, f: 50, rsrc: 0.1 } },
    { id: 'R2', kind: 'rail', x: 500, y: 420, rot: 0, props: { v: 0, ac: false, f: 50, rsrc: 0.1 } }
  ];
  const sw = { id: 'S1', kind: 'switch', x: 500, y: 220, rot: 0, props: { closed: false, owner: '', nc: false } };
  const coil = { id: 'K1', kind: 'coil', x: 500, y: 340, rot: 0, props: { r: 2400, pickup: 18, release: 6, ton: 0.01, toff: 0, rating: 0 } };
  d.parts.push(...rails, sw, coil);
  d.wires.push(
    { id: 'W1', a: { part: 'R1', pin: 'tap', t: 0 }, b: { part: 'S1', pin: 0 } },
    { id: 'W2', a: { part: 'S1', pin: 1 }, b: { part: 'K1', pin: 0 } },
    { id: 'W3', a: { part: 'K1', pin: 1 }, b: { part: 'R2', pin: 'tap', t: 0 } }
  );
  return d;
}

buildPalette();
markTools();
renderPanel(panelEl, doc, editor);

// debug handle, used by the browser smoke test
window.rc = {
  editor,
  get doc() { return doc; },
  get sim() { return sim; },
  start, stop, reset
};

document.getElementById('run').onclick = start;
document.getElementById('pause').onclick = stop;
document.getElementById('reset').onclick = reset;
document.getElementById('demo').onclick = loadDemo;

for (const b of document.querySelectorAll('[data-tool]')) {
  b.addEventListener('click', () => {
    editor.setTool(b.dataset.tool);
    markTools();
  });
}

document.getElementById('save').onclick = () => {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'relaycanvas.rly';
  a.click();
  // revoke after the browser has started the download, not before
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const file = document.getElementById('file');
document.getElementById('load').onclick = () => file.click();
file.addEventListener('change', async () => {
  const f = file.files && file.files[0];
  if (!f) return;
  const text = await f.text();
  file.value = '';
  try {
    const clean = sanitizeDoc(JSON.parse(text));
    if (!clean || !clean.parts.length) throw new Error('isi berkas tidak dikenali');
    doc = clean;
    reset();
    editor.setDoc(doc);
    persist();
    renderPanel(panelEl, doc, editor);
    setStatus('dimuat ' + f.name);
  } catch (err) {
    setStatus('berkas tidak valid', 'bad');
  }
});
