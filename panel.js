// Property panel. Every edit goes through editor.mutate so it lands in history
// and triggers the same save path as a canvas change.

import { partById } from './model.js';
import { pruneWires } from './editor.js';

export function renderPanel(root, doc, editor) {
  root.textContent = '';
  const minimized = (typeof localStorage !== 'undefined') && localStorage.getItem('relaycanvas.panel.minimized') === '1';
  root.classList.toggle('minimized', minimized);
  const part = editor.selectedId ? partById(doc, editor.selectedId) : null;
  const count = editor.selection ? editor.selection.size : 0;

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.marginBottom = minimized ? '0' : '4px';

  const title = document.createElement('h2');
  title.style.margin = '0';
  title.textContent = count > 1 ? count + ' komponen' : part ? part.kind + ' ' + part.id : 'Properti';
  header.append(title);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'panel-toggle';
  const setIcon = () => {
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    toggle.textContent = desktop ? (minimized ? '‹' : '›') : (minimized ? '▸' : '▾');
  };
  setIcon();
  window.addEventListener('resize', setIcon);
  toggle.title = minimized ? 'Perluas panel properti' : 'Minimalkan panel properti';
  toggle.style.padding = '2px 10px';
  toggle.style.minHeight = '24px';
  toggle.style.fontSize = '16px';
  toggle.style.fontWeight = '700';
  toggle.style.borderRadius = '6px';
  toggle.addEventListener('click', () => {
    const next = localStorage.getItem('relaycanvas.panel.minimized') === '1' ? '0' : '1';
    localStorage.setItem('relaycanvas.panel.minimized', next);
    renderPanel(root, doc, editor);
  });
  header.append(toggle);
  root.append(header);

  if (minimized) return;

  if (count > 1) {
    const p = document.createElement('p');
    p.className = 'hintline';
    p.textContent = 'Geser salah satu untuk memindahkan semuanya. Del untuk menghapus.';
    root.append(p);
    const btn = document.createElement('button');
    btn.textContent = 'Hapus ' + count + ' komponen';
    btn.style.width = '100%';
    btn.style.marginTop = '8px';
    btn.addEventListener('click', () => {
      const ids = new Set(editor.selection);
      editor.mutate(doc => {
        doc.parts = doc.parts.filter(x => !ids.has(x.id));
        doc.wires = doc.wires.filter(w => !ids.has(w.a.part) && !ids.has(w.b.part));
        for (const x of doc.parts) if (ids.has(x.props.owner)) x.props.owner = '';
        pruneWires(doc);
      });
      editor.select(null);
    });
    root.append(btn);
    return;
  }

  if (!part) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Belum ada yang dipilih.';
    root.append(p);
    const hint = document.createElement('p');
    hint.className = 'hintline';
    hint.textContent = 'W alat kabel: klik pin lalu pin lain, atau klik badan rail untuk tap. R rotasi, Del hapus, Ctrl+Z undo. Klik saklar untuk menutup atau membukanya.';
    root.append(hint);
    return;
  }

  for (const f of fieldDefs(part, doc, editor)) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.textContent = f.label;
    row.append(label);

    if (f.type === 'state') {
      const state = document.createElement('span');
      state.textContent = typeof f.value === 'function' ? f.value() : f.value;
      row.append(state);
      root.append(row);
      continue;
    }

    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      for (const opt of f.options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        input.append(o);
      }
      input.value = String(f.value);
    } else if (f.type === 'check') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!f.value;
    } else {
      input = document.createElement('input');
      input.type = f.type;
      input.value = f.value;
      if (f.type === 'number') input.step = 'any';
    }

    // text fields update while typing; numbers wait for a committed value so a
    // half typed "24" is not applied as "2"
    const live = f.type === 'text';
    if (live) {
      // one undo step per editing session, not one per keystroke
      input.addEventListener('focus', () => editor.snapshot());
      input.addEventListener('input', () => {
        editor.mutate(() => f.apply(input.value), { noSnapshot: true, keepFocus: true });
      });
    } else {
      input.addEventListener('change', () => {
        const value = input.type === 'checkbox' ? input.checked : input.value;
        editor.mutate(() => f.apply(value));
      });
    }

    row.append(input);
    root.append(row);
  }
}

function fieldDefs(part, doc, editor) {
  const p = part.props;
  const common = [
    { label: 'x', type: 'number', value: part.x, apply: v => { part.x = Math.round(Number(v)); } },
    { label: 'y', type: 'number', value: part.y, apply: v => { part.y = Math.round(Number(v)); } },
    { label: 'rot', type: 'number', value: part.rot || 0, apply: v => { part.rot = ((Math.round(Number(v)) % 360) + 360) % 360; } },
    { label: 'label', type: 'text', value: part.props.label || '', apply: v => { part.props.label = String(v).trim(); } }
  ];

  if (part.kind === 'rail') {
    return [
      ...common,
      { label: 'V', type: 'number', value: p.v, apply: v => { p.v = Number(v); } },
      { label: 'AC', type: 'check', value: p.ac, apply: v => { p.ac = !!v; } },
      { label: 'f Hz', type: 'number', value: p.f || 50, apply: v => { p.f = Math.max(1, Number(v)); } },
      { label: 'panjang', type: 'number', value: p.len || 320, apply: v => { p.len = Math.max(80, Math.round(Number(v))); } },
      { label: 'Rsrc', type: 'number', value: p.rsrc, apply: v => { p.rsrc = Math.max(0.001, Number(v)); } },
      { label: 'rating A', type: 'number', value: p.rating || 0, apply: v => { p.rating = Math.max(0, Number(v)); } }
    ];
  }

  if (part.kind === 'led') {
    return [
      ...common,
      { label: 'R', type: 'number', value: p.r, apply: v => { p.r = Math.max(0.01, Number(v)); } },
      { label: 'rating A', type: 'number', value: p.rating || 0, apply: v => { p.rating = Math.max(0, Number(v)); } }
    ];
  }

  if (part.kind === 'switch') {
    const coils = doc.parts.filter(x => x.kind === 'coil').map(c => ({ value: c.id, label: c.props.label || c.id }));
    return [
      ...common,
      // the contact state is owned by the simulation; clicking the symbol toggles it
      { label: 'kontak', type: 'state', value: () => {
        const closed = editor && editor.sim ? editor.sim.isClosed(part) : !!p.closed;
        return closed ? 'tertutup' : 'terbuka';
      } },
      { label: 'owner', type: 'select', value: p.owner || '', options: [{ value: '', label: '-' }, ...coils], apply: v => { p.owner = String(v); } },
      // checked = NC, unchecked = NO
      { label: 'NC', type: 'check', value: p.nc, apply: v => { p.nc = !!v; p.closed = !!v; } }
    ];
  }

  if (part.kind === 'passive') {
    return [
      ...common,
      { label: 'R', type: 'number', value: p.r, apply: v => { p.r = Math.max(0, Number(v)); } },
      { label: 'C uF', type: 'number', value: p.c, apply: v => { p.c = Math.max(0, Number(v)); } },
      { label: 'L mH', type: 'number', value: Math.round((p.l || 0) * 1000), apply: v => { p.l = Math.max(0, Number(v)) / 1000; } },
      { label: 'rating A', type: 'number', value: p.rating || 0, apply: v => { p.rating = Math.max(0, Number(v)); } }
    ];
  }

  if (part.kind === 'coil') {
    return [
      ...common,
      { label: 'R', type: 'number', value: p.r, apply: v => { p.r = Math.max(0.01, Number(v)); } },
      { label: 'pickup V', type: 'number', value: p.pickup, apply: v => { p.pickup = Number(v); } },
      { label: 'release V', type: 'number', value: p.release, apply: v => { p.release = Number(v); } },
      // closing is delayed by `ton`, and the whole output can be held by `toff`
      { label: 'tutup ms', type: 'number', value: Math.round(p.ton * 1000), apply: v => { p.ton = Math.max(0, Number(v)) / 1000; } },
      { label: 'tahan ms', type: 'number', value: Math.round((p.toff || 0) * 1000), apply: v => { p.toff = Math.max(0, Number(v)) / 1000; } },
      { label: 'rating A', type: 'number', value: p.rating || 0, apply: v => { p.rating = Math.max(0, Number(v)); } }
    ];
  }

  return [
    ...common,
    { label: 'R', type: 'number', value: p.r, apply: v => { p.r = Math.max(0.01, Number(v)); } }
  ];
}
