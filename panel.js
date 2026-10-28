// Property panel. Every edit goes through editor.mutate so it lands in history
// and triggers the same save path as a canvas change.

import { partById } from './model.js';
import { pruneWires } from './editor.js';

export function renderPanel(root, doc, editor) {
  root.textContent = '';
  const part = editor.selectedId ? partById(doc, editor.selectedId) : null;

  const title = document.createElement('h2');
  const count = editor.selection ? editor.selection.size : 0;
  title.textContent = count > 1 ? count + ' komponen' : part ? part.kind + ' ' + part.id : 'Properti';
  root.append(title);

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

  for (const f of fieldDefs(part, doc)) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.textContent = f.label;
    row.append(label);

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

function fieldDefs(part, doc) {
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
      { label: 'panjang', type: 'number', value: p.len || 320, apply: v => { p.len = Math.max(80, Math.round(Number(v))); } },
      { label: 'Rsrc', type: 'number', value: p.rsrc, apply: v => { p.rsrc = Math.max(0.001, Number(v)); } }
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
      { label: 'closed', type: 'check', value: p.closed, apply: v => { p.closed = !!v; } },
      { label: 'owner', type: 'select', value: p.owner || '', options: [{ value: '', label: '-' }, ...coils], apply: v => { p.owner = String(v); } },
      { label: 'NC', type: 'check', value: p.nc, apply: v => { p.nc = !!v; if (v) p.closed = true; } }
    ];
  }

  if (part.kind === 'passive') {
    return [
      ...common,
      { label: 'R', type: 'number', value: p.r, apply: v => { p.r = Math.max(0, Number(v)); } },
      { label: 'C uF', type: 'number', value: p.c, apply: v => { p.c = Math.max(0, Number(v)); } },
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
