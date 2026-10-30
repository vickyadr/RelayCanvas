// App wiring: palette, toolbar, simulation loop, and persistence.

import { KINDS, newDoc, sanitizeDoc } from './model.js';
import { demoDoc } from './demo.js';
import { Editor } from './editor.js';
import { renderPanel } from './panel.js';
import { Sim } from './sim.js';
import { fmtI } from './render.js';

const KEY = 'relaycanvas.doc';
const DT = 0.001;

const menuToggle = document.getElementById('menuToggle');
const headerMenu = document.getElementById('headerMenu');
if (menuToggle && headerMenu) {
  menuToggle.addEventListener('click', () => {
    const open = headerMenu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.textContent = open ? '✕' : '☰';
  });
}

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
  { kind: 'passive', label: 'Induktor', props: { r: 0, c: 0, l: 0.1 } },
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
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const minimized = isDesktop && (typeof localStorage !== 'undefined') && localStorage.getItem('relaycanvas.palette.minimized') === '1';
  palette.classList.toggle('minimized', minimized);

  // rebuild when crossing the mobile/desktop breakpoint so minimize state re-evaluates
  if (!buildPalette._resizeBound) {
    buildPalette._resizeBound = true;
    let lastDesktop = isDesktop;
    window.addEventListener('resize', () => {
      const now = window.matchMedia('(min-width: 768px)').matches;
      if (now !== lastDesktop) {
        lastDesktop = now;
        palette.textContent = '';
        buildPalette();
      }
    });
  }

  const header = document.createElement('div');
  header.className = 'palette-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.marginBottom = minimized ? '0' : '8px';

  const h = document.createElement('h2');
  h.textContent = 'Komponen';
  h.style.margin = '0';
  header.append(h);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'palette-toggle';
  const setIcon = () => {
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    toggle.textContent = desktop ? (minimized ? '›' : '‹') : (minimized ? '▸' : '▾');
  };
  setIcon();
  window.addEventListener('resize', setIcon);
  toggle.title = minimized ? 'Perluas komponen' : 'Minimalkan komponen';
  toggle.style.padding = '2px 10px';
  toggle.style.minHeight = '24px';
  toggle.style.fontSize = '16px';
  toggle.style.fontWeight = '700';
  toggle.style.borderRadius = '6px';
  toggle.addEventListener('click', () => {
    const next = localStorage.getItem('relaycanvas.palette.minimized') === '1' ? '0' : '1';
    localStorage.setItem('relaycanvas.palette.minimized', next);
    palette.textContent = '';
    buildPalette();
  });
  header.append(toggle);
  palette.append(header);

  if (minimized) return;

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
document.getElementById('help').onclick = () => document.getElementById('helpdlg').showModal();
document.getElementById('export').onclick = exportPng;

function exportPng() {
  const svg = document.getElementById('canvas');
  const clone = svg.cloneNode(true);
  let css = '';
  for (const sheet of document.styleSheets) {
    try { for (const rule of sheet.cssRules) css += rule.cssText + '\n'; } catch (e) {}
  }
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = css;
  clone.insertBefore(style, clone.firstChild);
  const source = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width || svg.clientWidth;
    canvas.height = img.height || svg.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = 'relaycanvas.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  img.src = url;
}
document.getElementById('helpclose').onclick = () => document.getElementById('helpdlg').close();

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
