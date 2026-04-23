// ── State ──────────────────────────────────────────────────────────────
let data = [];        // data[row][col] = string
let numCols = 0;
let merges = [];      // [{r, c, rowspan, colspan}, ...] — non-overlapping
let selection = null; // {r1, c1, r2, c2} normalized, or null
let cellStyles = {};  // { "r,c": {bg, fg} } — per-cell custom colors (sparse)

// Drag-select transient state
let dragAnchor = null;
let isDragging = false;

// ── Init ───────────────────────────────────────────────────────────────
function initDefault() {
  data = [
    ['Primera', 'Segunda', 'Tercera'],
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
    ['G', 'H', 'I'],
  ];
  numCols = 3;
  merges = [];
  cellStyles = {};
  selection = null;
  renderTable();
  renderLatex();
}

// ── Cell style helpers ─────────────────────────────────────────────────
function cellStyleKey(r, c) { return `${r},${c}`; }
function getCellStyle(r, c) { return cellStyles[cellStyleKey(r, c)] || null; }
function setCellStyleAt(r, c, style) { cellStyles[cellStyleKey(r, c)] = style; }
function clearCellStyleAt(r, c) { delete cellStyles[cellStyleKey(r, c)]; }

function adjustCellStylesForRowDelete(r) {
  const next = {};
  for (const key in cellStyles) {
    const [kr, kc] = key.split(',').map(Number);
    if (kr === r) continue;
    const newR = kr > r ? kr - 1 : kr;
    next[`${newR},${kc}`] = cellStyles[key];
  }
  cellStyles = next;
}
function adjustCellStylesForColDelete(c) {
  const next = {};
  for (const key in cellStyles) {
    const [kr, kc] = key.split(',').map(Number);
    if (kc === c) continue;
    const newC = kc > c ? kc - 1 : kc;
    next[`${kr},${newC}`] = cellStyles[key];
  }
  cellStyles = next;
}

// ── Merge / selection helpers ──────────────────────────────────────────
function getMergeAt(r, c) {
  return merges.find(m =>
    r >= m.r && r < m.r + m.rowspan &&
    c >= m.c && c < m.c + m.colspan
  ) || null;
}

function mergeRange(m) {
  return { rMin: m.r, cMin: m.c, rMax: m.r + m.rowspan - 1, cMax: m.c + m.colspan - 1 };
}

function rangesOverlap(a, b) {
  return !(a.rMax < b.rMin || a.rMin > b.rMax || a.cMax < b.cMin || a.cMin > b.cMax);
}

function expandRangeOverMerges(r1, c1, r2, c2) {
  let rMin = Math.min(r1, r2), cMin = Math.min(c1, c2);
  let rMax = Math.max(r1, r2), cMax = Math.max(c1, c2);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of merges) {
      const mr = mergeRange(m);
      if (rangesOverlap({ rMin, cMin, rMax, cMax }, mr)) {
        if (mr.rMin < rMin) { rMin = mr.rMin; grew = true; }
        if (mr.cMin < cMin) { cMin = mr.cMin; grew = true; }
        if (mr.rMax > rMax) { rMax = mr.rMax; grew = true; }
        if (mr.cMax > cMax) { cMax = mr.cMax; grew = true; }
      }
    }
  }
  return { rMin, cMin, rMax, cMax };
}

function setSelection(r1, c1, r2, c2) {
  const e = expandRangeOverMerges(r1, c1, r2, c2);
  selection = { r1: e.rMin, c1: e.cMin, r2: e.rMax, c2: e.cMax };
}

function clearSelection() { selection = null; }

function isCellSelected(r, c) {
  if (!selection) return false;
  return r >= selection.r1 && r <= selection.r2 && c >= selection.c1 && c <= selection.c2;
}

function colSpecForSpan(c, align, vborder) {
  const vb = vborder ? '|' : '';
  return (c === 0 ? vb : '') + align + vb;
}

function adjustMergesForRowDelete(r) {
  merges = merges.flatMap(m => {
    const endR = m.r + m.rowspan - 1;
    if (endR < r) return [m];
    if (m.r > r) return [{ ...m, r: m.r - 1 }];
    if (m.rowspan === 1) return [];
    return [{ ...m, rowspan: m.rowspan - 1 }];
  });
}
function adjustMergesForColDelete(c) {
  merges = merges.flatMap(m => {
    const endC = m.c + m.colspan - 1;
    if (endC < c) return [m];
    if (m.c > c) return [{ ...m, c: m.c - 1 }];
    if (m.colspan === 1) return [];
    return [{ ...m, colspan: m.colspan - 1 }];
  });
}

// ── Table Render ───────────────────────────────────────────────────────
function renderTable() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (!data.length || !numCols) return;

  // Column headers (A, B, C…)
  const headRow = document.createElement('tr');
  const cornerTh = document.createElement('th');
  cornerTh.className = 'row-ctrl';
  headRow.appendChild(cornerTh);

  for (let c = 0; c < numCols; c++) {
    const th = document.createElement('th');
    th.innerHTML = `<div class="th-inner">
      <span class="th-label">${colLetter(c)}</span>
      <button class="col-del-btn" title="Eliminar columna" onclick="delCol(${c})">×</button>
    </div>`;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  // Data rows — skip cells hidden under merges
  for (let r = 0; r < data.length; r++) {
    const tr = document.createElement('tr');
    if (r === 0) tr.classList.add('header-row');

    const ctrlTd = document.createElement('td');
    ctrlTd.className = 'row-ctrl';
    ctrlTd.innerHTML = `<button class="row-del-btn" title="Eliminar fila" onclick="delRow(${r})">×</button>`;
    tr.appendChild(ctrlTd);

    let c = 0;
    while (c < numCols) {
      const startC = c;
      const m = getMergeAt(r, startC);
      if (m && (m.r !== r || m.c !== startC)) { c++; continue; } // non-anchor → no td

      const td = document.createElement('td');
      td.dataset.row = r;
      td.dataset.col = startC;
      if (m) {
        td.rowSpan = m.rowspan;
        td.colSpan = m.colspan;
        c = startC + m.colspan;
      } else {
        c = startC + 1;
      }
      if (isCellSelected(r, startC)) td.classList.add('cell-selected');

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = data[r][startC] || '';
      inp.dataset.row = r;
      inp.dataset.col = startC;
      inp.addEventListener('input', onCellInput);
      inp.addEventListener('keydown', onCellKeydown);
      td.appendChild(inp);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  updateStatus();
  updateMergeButtonsState();
  requestAnimationFrame(applyHeaderColors);
}

function onCellInput(e) {
  const r = +e.target.dataset.row;
  const c = +e.target.dataset.col;
  data[r][c] = e.target.value;
  renderLatex();
}

function onCellKeydown(e) {
  const r = +e.target.dataset.row;
  const c = +e.target.dataset.col;
  if (e.key === 'Tab') {
    e.preventDefault();
    const nextC = c + 1;
    if (nextC < numCols) focusCell(r, nextC);
    else if (r + 1 < data.length) focusCell(r + 1, 0);
    else { addRow(); setTimeout(() => focusCell(r + 1, 0), 20); }
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (r + 1 < data.length) focusCell(r + 1, c);
    else { addRow(); setTimeout(() => focusCell(r + 1, c), 20); }
  }
  if (e.key === 'ArrowUp' && r > 0) focusCell(r - 1, c);
  if (e.key === 'ArrowDown' && r + 1 < data.length) focusCell(r + 1, c);
}

function focusCell(r, c) {
  const m = getMergeAt(r, c);
  if (m) { r = m.r; c = m.c; }
  const inp = document.querySelector(`#table-body input[data-row="${r}"][data-col="${c}"]`);
  if (inp) { inp.focus(); inp.select(); }
}

function colLetter(c) {
  let s = '';
  c++;
  while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
  return s;
}

// ── Row / Col operations ───────────────────────────────────────────────
function addRow() {
  clearSelection();
  data.push(Array(numCols).fill(''));
  renderTable();
  renderLatex();
  setTimeout(() => focusCell(data.length - 1, 0), 20);
}

function delRow(r) {
  if (data.length <= 1) return showToast('Mínimo 1 fila');
  clearSelection();
  adjustMergesForRowDelete(r);
  adjustCellStylesForRowDelete(r);
  data.splice(r, 1);
  renderTable();
  renderLatex();
}

function delLastRow() { delRow(data.length - 1); }

function addCol() {
  clearSelection();
  numCols++;
  data.forEach(row => row.push(''));
  renderTable();
  renderLatex();
  setTimeout(() => focusCell(0, numCols - 1), 20);
}

function delCol(c) {
  if (numCols <= 1) return showToast('Mínimo 1 columna');
  clearSelection();
  adjustMergesForColDelete(c);
  adjustCellStylesForColDelete(c);
  numCols--;
  data.forEach(row => row.splice(c, 1));
  renderTable();
  renderLatex();
}

function delLastCol() { delCol(numCols - 1); }

function resetTable() {
  data = [
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ];
  numCols = 3;
  merges = [];
  cellStyles = {};
  clearSelection();
  renderTable();
  renderLatex();
  showToast('Tabla reseteada: cabecera + 3 filas × 3 columnas');
  setTimeout(() => focusCell(0, 0), 20);
}

function clearAll() {
  if (!confirm('¿Limpiar toda la tabla?')) return;
  data = data.map(row => Array(numCols).fill(''));
  merges = [];
  cellStyles = {};
  clearSelection();
  renderTable();
  renderLatex();
}

// ── Merge operations ───────────────────────────────────────────────────
function mergeSelection() {
  if (!selection) return showToast('Selecciona celdas primero');
  const { r1, c1, r2, c2 } = selection;
  const rowspan = r2 - r1 + 1;
  const colspan = c2 - c1 + 1;
  if (rowspan * colspan < 2) return showToast('Selecciona al menos 2 celdas');

  const selRng = { rMin: r1, cMin: c1, rMax: r2, cMax: c2 };
  merges = merges.filter(m => !rangesOverlap(selRng, mergeRange(m)));
  merges.push({ r: r1, c: c1, rowspan, colspan });

  renderTable();
  renderLatex();
  showToast(`Combinadas ${rowspan}×${colspan} celdas`);
}

function splitSelection() {
  if (!selection) return showToast('Selecciona celdas primero');
  const selRng = { rMin: selection.r1, cMin: selection.c1, rMax: selection.r2, cMax: selection.c2 };
  const before = merges.length;
  merges = merges.filter(m => !rangesOverlap(selRng, mergeRange(m)));
  const removed = before - merges.length;
  if (!removed) return showToast('Nada que dividir');
  renderTable();
  renderLatex();
  showToast(`${removed} combinación(es) dividida(s)`);
}

function updateMergeButtonsState() {
  const mergeBtn = document.getElementById('merge-btn');
  const splitBtn = document.getElementById('split-btn');
  if (mergeBtn && splitBtn) {
    const multi = selection && ((selection.r2 - selection.r1 + 1) * (selection.c2 - selection.c1 + 1) >= 2);
    const overlaps = selection && merges.some(m => rangesOverlap(
      { rMin: selection.r1, cMin: selection.c1, rMax: selection.r2, cMax: selection.c2 },
      mergeRange(m)
    ));
    mergeBtn.disabled = !multi;
    splitBtn.disabled = !overlaps;
  }
  const applyBtn = document.getElementById('apply-color-btn');
  const clearColorBtn = document.getElementById('clear-color-btn');
  if (applyBtn && clearColorBtn) {
    let hasCustom = false;
    if (selection) {
      for (let r = selection.r1; r <= selection.r2 && !hasCustom; r++) {
        for (let c = selection.c1; c <= selection.c2; c++) {
          if (getCellStyle(r, c)) { hasCustom = true; break; }
        }
      }
    }
    applyBtn.disabled = !selection;
    clearColorBtn.disabled = !hasCustom;
  }
}

// ── Per-cell color operations ─────────────────────────────────────────
function applyColorToSelection() {
  if (!selection) return showToast('Selecciona celdas primero');
  const bg = document.getElementById('cell-bg-select').value;
  const fg = document.getElementById('cell-fg-select').value;
  let count = 0;
  for (let r = selection.r1; r <= selection.r2; r++) {
    for (let c = selection.c1; c <= selection.c2; c++) {
      // Skip hidden cells under a merge — only anchor carries style
      const m = getMergeAt(r, c);
      if (m && (m.r !== r || m.c !== c)) continue;
      setCellStyleAt(r, c, { bg, fg });
      count++;
    }
  }
  renderTable();
  renderLatex();
  showToast(`Color aplicado a ${count} celda(s)`);
}

function clearColorFromSelection() {
  if (!selection) return showToast('Selecciona celdas primero');
  let count = 0;
  for (let r = selection.r1; r <= selection.r2; r++) {
    for (let c = selection.c1; c <= selection.c2; c++) {
      if (getCellStyle(r, c)) { clearCellStyleAt(r, c); count++; }
    }
  }
  if (!count) return showToast('Ninguna celda con color personalizado');
  renderTable();
  renderLatex();
  showToast(`Color eliminado de ${count} celda(s)`);
}

function onCellColorChange() {
  updateSwatches();
}

// ── Import ─────────────────────────────────────────────────────────────
function importPaste() {
  const raw = document.getElementById('paste-input').value.trim();
  if (!raw) return showToast('Nada que importar');

  const rows = raw.split(/\r?\n/).map(line => {
    // Try tab first (Excel), then semicolon, then comma
    if (line.includes('\t')) return line.split('\t');
    if (line.includes(';')) return line.split(';');
    return line.split(',');
  });

  if (!rows.length) return;
  numCols = Math.max(...rows.map(r => r.length));
  data = rows.map(r => {
    const padded = [...r];
    while (padded.length < numCols) padded.push('');
    return padded.map(c => c.trim());
  });
  merges = [];
  cellStyles = {};
  clearSelection();

  document.getElementById('paste-input').value = '';
  renderTable();
  renderLatex();
  showToast(`Importadas ${data.length} filas × ${numCols} columnas`);
}

// ── xcolor named colors ────────────────────────────────────────────────
const XCOLORS = {
  'Base (xcolor)': [
    { name: 'black', hex: '#000000' }, { name: 'white', hex: '#ffffff' },
    { name: 'red', hex: '#ff0000' }, { name: 'green', hex: '#00ff00' },
    { name: 'blue', hex: '#0000ff' }, { name: 'cyan', hex: '#00ffff' },
    { name: 'magenta', hex: '#ff00ff' }, { name: 'yellow', hex: '#ffff00' },
    { name: 'orange', hex: '#ff8000' }, { name: 'violet', hex: '#8000ff' },
    { name: 'purple', hex: '#800080' }, { name: 'brown', hex: '#804000' },
    { name: 'pink', hex: '#ffaaaa' }, { name: 'olive', hex: '#808000' },
    { name: 'teal', hex: '#008080' }, { name: 'lime', hex: '#80ff00' },
    { name: 'darkgray', hex: '#404040' }, { name: 'gray', hex: '#808080' },
    { name: 'lightgray', hex: '#c0c0c0' },
  ],
  'dvipsnames (68)': [
    { name: 'Apricot', hex: '#ffad7a' }, { name: 'Aquamarine', hex: '#1bced1' },
    { name: 'Bittersweet', hex: '#c84b16' }, { name: 'Black', hex: '#231f20' },
    { name: 'Blue', hex: '#2d2f92' }, { name: 'BlueGreen', hex: '#00b89f' },
    { name: 'BlueViolet', hex: '#473992' }, { name: 'BrickRed', hex: '#b6321c' },
    { name: 'Brown', hex: '#792500' }, { name: 'BurntOrange', hex: '#ef7f00' },
    { name: 'CadetBlue', hex: '#606e8c' }, { name: 'CarnationPink', hex: '#f2a7c3' },
    { name: 'Cerulean', hex: '#009ece' }, { name: 'CornflowerBlue', hex: '#41a7d8' },
    { name: 'Cyan', hex: '#00aeef' }, { name: 'Dandelion', hex: '#fdbc42' },
    { name: 'DarkOrchid', hex: '#a4538a' }, { name: 'Emerald', hex: '#00a99d' },
    { name: 'ForestGreen', hex: '#009b55' }, { name: 'Fuchsia', hex: '#8c368c' },
    { name: 'Goldenrod', hex: '#ffde00' }, { name: 'Gray', hex: '#949698' },
    { name: 'Green', hex: '#00a64f' }, { name: 'GreenYellow', hex: '#f7ff3c' },
    { name: 'JungleGreen', hex: '#00a99a' }, { name: 'Lavender', hex: '#f49ec4' },
    { name: 'LimeGreen', hex: '#8dc73e' }, { name: 'Magenta', hex: '#ec008c' },
    { name: 'Mahogany', hex: '#a52a2a' }, { name: 'Maroon', hex: '#af3235' },
    { name: 'Melon', hex: '#f89e7b' }, { name: 'MidnightBlue', hex: '#006795' },
    { name: 'Mulberry', hex: '#a93c93' }, { name: 'NavyBlue', hex: '#006eb8' },
    { name: 'OliveGreen', hex: '#3d9970' }, { name: 'Orange', hex: '#f7941d' },
    { name: 'OrangeRed', hex: '#f26035' }, { name: 'Orchid', hex: '#af72b0' },
    { name: 'Peach', hex: '#f7965a' }, { name: 'Periwinkle', hex: '#6f72b8' },
    { name: 'PineGreen', hex: '#008b72' }, { name: 'Plum', hex: '#92268f' },
    { name: 'ProcessBlue', hex: '#00b0f0' }, { name: 'Purple', hex: '#99479b' },
    { name: 'RawSienna', hex: '#974006' }, { name: 'Red', hex: '#ed1b23' },
    { name: 'RedOrange', hex: '#f26522' }, { name: 'RedViolet', hex: '#a1246b' },
    { name: 'Rhodamine', hex: '#ef559f' }, { name: 'RoyalBlue', hex: '#0071bc' },
    { name: 'RoyalPurple', hex: '#613f99' }, { name: 'RubineRed', hex: '#ca005d' },
    { name: 'Salmon', hex: '#f69289' }, { name: 'SeaGreen', hex: '#3cb371' },
    { name: 'Sepia', hex: '#671800' }, { name: 'SkyBlue', hex: '#46c5dd' },
    { name: 'SpringGreen', hex: '#c6dc67' }, { name: 'Tan', hex: '#da9d76' },
    { name: 'TealBlue', hex: '#00827f' }, { name: 'Thistle', hex: '#d8b2d1' },
    { name: 'Turquoise', hex: '#00b4ce' }, { name: 'Violet', hex: '#58429b' },
    { name: 'VioletRed', hex: '#ef58a0' }, { name: 'White', hex: '#ffffff' },
    { name: 'WildStrawberry', hex: '#ee2967' }, { name: 'Yellow', hex: '#fff200' },
    { name: 'YellowGreen', hex: '#98cc70' }, { name: 'YellowOrange', hex: '#faa21a' },
  ],
};

function buildColorSelects() {
  ['cell-color-select', 'text-color-select', 'cell-bg-select', 'cell-fg-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    for (const [group, colors] of Object.entries(XCOLORS)) {
      const og = document.createElement('optgroup');
      og.label = group;
      colors.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    }
  });
  // Header defaults
  document.getElementById('cell-color-select').value = 'black';
  document.getElementById('text-color-select').value = 'white';
  // Cell-color defaults
  const bgSel = document.getElementById('cell-bg-select');
  const fgSel = document.getElementById('cell-fg-select');
  if (bgSel) bgSel.value = 'yellow';
  if (fgSel) fgSel.value = 'black';
  updateSwatches();
}

function getColorHex(name) {
  for (const colors of Object.values(XCOLORS)) {
    const found = colors.find(c => c.name === name);
    if (found) return found.hex;
  }
  return '#888888';
}

function updateSwatches() {
  const cellName = document.getElementById('cell-color-select').value;
  const textName = document.getElementById('text-color-select').value;
  const cellHex = getColorHex(cellName);
  const textHex = getColorHex(textName);
  document.getElementById('cell-swatch').style.background = cellHex;
  document.getElementById('text-swatch').style.background = textHex;
  const prev = document.getElementById('header-cell-preview');
  prev.style.background = cellHex;
  prev.style.color = textHex;
  prev.style.fontWeight = isBold() ? '700' : '400';
  // Cell-color swatches (optional, only if the DOM nodes exist)
  const bgSel = document.getElementById('cell-bg-select');
  const fgSel = document.getElementById('cell-fg-select');
  if (bgSel && fgSel) {
    document.getElementById('cell-bg-swatch').style.background = getColorHex(bgSel.value);
    document.getElementById('cell-fg-swatch').style.background = getColorHex(fgSel.value);
  }
}

function onSelectChange() {
  updateSwatches();
  renderLatex();
  applyHeaderColors();
}

// ── Color helpers ──────────────────────────────────────────────────────
function getCellColor() { return document.getElementById('cell-color-select').value; }
function getTextColor() { return document.getElementById('text-color-select').value; }
function isBold() { return document.getElementById('header-bold').checked; }

function applyHeaderColors() {
  const headerBg = getColorHex(getCellColor());
  const headerFg = getColorHex(getTextColor());
  document.querySelectorAll('#table-body td').forEach(td => {
    if (td.classList.contains('row-ctrl')) return;
    const r = +td.dataset.row, c = +td.dataset.col;
    if (Number.isNaN(r)) return;
    const custom = getCellStyle(r, c);
    let bg = null, fg = null;
    if (custom) {
      bg = getColorHex(custom.bg);
      fg = getColorHex(custom.fg);
    } else if (r === 0) {
      bg = headerBg;
      fg = headerFg;
    }
    if (bg !== null) {
      td.style.background = bg;
      td.style.color = fg;
      const inp = td.querySelector('input');
      if (inp) {
        inp.style.color = fg;
        inp.style.background = 'transparent';
        inp.style.caretColor = fg;
      }
    } else {
      td.style.background = '';
      td.style.color = '';
      const inp = td.querySelector('input');
      if (inp) {
        inp.style.color = '';
        inp.style.background = '';
        inp.style.caretColor = '';
      }
    }
  });
}

function wrapStyledCell(text, bg, fg, bold) {
  const t = escTex(text);
  const inner = bold ? `\\textbf{${t}}` : t;
  return `\\cellcolor{${bg}}{\\textcolor{${fg}}{${inner}}}`;
}

// Build a row's LaTeX tokens (merge-aware). `opts` is a renderer strategy.
function buildRowTokens(r, opts) {
  const tokens = [];
  let c = 0;
  while (c < numCols) {
    const startC = c;
    const m = getMergeAt(r, startC);
    if (m && m.r === r && m.c === startC) {
      let content = opts.cellContent(r, startC);
      if (m.rowspan > 1) content = opts.multirow(m.rowspan, content);
      if (m.colspan > 1) tokens.push(opts.multicol(m.colspan, colSpecForSpan(startC, opts.align, opts.vborder), content));
      else tokens.push(content);
      c = startC + m.colspan;
    } else if (m && m.c === startC && m.r < r) {
      // Continuation row of a vertical merge (leftmost col of merge): emit an empty placeholder
      if (m.colspan > 1) tokens.push(opts.multicol(m.colspan, colSpecForSpan(startC, opts.align, opts.vborder), ''));
      else tokens.push(opts.empty);
      c = startC + m.colspan;
    } else if (m) {
      // Covered but not leftmost col of merge (handled in the anchor's iteration above)
      c++;
    } else {
      tokens.push(opts.cellContent(r, startC));
      c++;
    }
  }
  return tokens;
}

// Shared: read inputs + build \tabla args (plain) used by both renderLatex and copyTable
function buildArgs() {
  const align = document.getElementById('align-select').value;
  const vborder = document.getElementById('vborder').checked;
  const hborder = document.getElementById('hborder').checked;
  const manualSpec = document.getElementById('manual-spec').value.trim();
  const cellColor = getCellColor();
  const textColor = getTextColor();
  const bold = isBold();

  const vb = vborder ? '|' : '';
  const rowSep = hborder ? ' \\\\\n    \\hline' : ' \\\\';

  const arg1 = String(numCols);
  const arg2 = manualSpec || (vb + Array(numCols).fill(align).join(vb) + vb);

  const plainMulticol = (n, spec, content) => `\\multicolumn{${n}}{${spec}}{${content}}`;
  const plainMultirow = (n, content) => `\\multirow{${n}}{*}{${content}}`;

  // Header cell: custom per-cell colors win; else fall back to global header colors
  const headerCellPlain = (r, c) => {
    const s = getCellStyle(r, c);
    const bg = s ? s.bg : cellColor;
    const fg = s ? s.fg : textColor;
    return wrapStyledCell(data[r][c] || '', bg, fg, bold);
  };
  // Body cell: wrap with cellcolor/textcolor only if a custom style is set
  const bodyCellPlain = (r, c) => {
    const s = getCellStyle(r, c);
    if (s) return wrapStyledCell(data[r][c] || '', s.bg, s.fg, false);
    return escTex(data[r][c] || '');
  };

  const arg3 = buildRowTokens(0, {
    align, vborder, empty: '',
    cellContent: headerCellPlain,
    multicol: plainMulticol,
    multirow: plainMultirow,
  }).join(' & ');

  const bodyLines = [];
  for (let r = 1; r < data.length; r++) {
    const tokens = buildRowTokens(r, {
      align, vborder, empty: '',
      cellContent: bodyCellPlain,
      multicol: plainMulticol,
      multirow: plainMultirow,
    });
    bodyLines.push('    ' + tokens.join(' & ') + rowSep);
  }
  const arg4 = bodyLines.length ? '\n' + bodyLines.join('\n') + '\n  ' : '';

  return { arg1, arg2, arg3, arg4, align, vborder, hborder, cellColor, textColor, bold };
}

function renderLatex() {
  const { arg1, arg2, align, vborder, hborder, cellColor, textColor, bold } = buildArgs();

  const h = {
    cmd: s => `<span class="lt-cmd">${s}</span>`,
    brace: s => `<span class="lt-brace">${s}</span>`,
    arg1: s => `<span class="lt-arg1">${s}</span>`,
    arg2: s => `<span class="lt-arg2">${s}</span>`,
    arg3: s => `<span class="lt-arg3">${s}</span>`,
    arg4: s => `<span class="lt-arg4">${s}</span>`,
    amp: () => `<span class="lt-amp"> &amp; </span>`,
    nl: () => `<span class="lt-nl"> \\\\</span>`,
    hline: () => `<span class="lt-hline">\\hline</span>`,
    comment: s => `<span class="lt-comment">${s}</span>`,
  };

  const styledHl = (text, bg, fg, isBoldCell) => {
    const t = escHtml(escTex(text));
    const inner = isBoldCell ? `${h.cmd('\\textbf{')}${t}${h.brace('}')}` : t;
    return `${h.cmd('\\cellcolor{')}${h.arg1(escHtml(bg))}${h.brace('}')}` +
      `${h.brace('{')}${h.cmd('\\textcolor{')}${h.arg1(escHtml(fg))}${h.brace('}')}` +
      `${h.brace('{')}${inner}${h.brace('}')}${h.brace('}')}`;
  };
  const headerCellHl = (r, c) => {
    const s = getCellStyle(r, c);
    const bg = s ? s.bg : cellColor;
    const fg = s ? s.fg : textColor;
    return styledHl(data[r][c] || '', bg, fg, bold);
  };
  const bodyCellHl = (r, c) => {
    const s = getCellStyle(r, c);
    if (s) return styledHl(data[r][c] || '', s.bg, s.fg, false);
    return escHtml(escTex(data[r][c] || ''));
  };
  const multicolHl = (n, spec, content) =>
    `${h.cmd('\\multicolumn{')}${n}${h.brace('}{')}${escHtml(spec)}${h.brace('}{')}${content}${h.brace('}')}`;
  const multirowHl = (n, content) =>
    `${h.cmd('\\multirow{')}${n}${h.brace('}{*}{')}${content}${h.brace('}')}`;

  const h3 = buildRowTokens(0, {
    align, vborder, empty: '',
    cellContent: headerCellHl, multicol: multicolHl, multirow: multirowHl,
  }).join(h.amp());

  const h4lines = [];
  for (let r = 1; r < data.length; r++) {
    const tokens = buildRowTokens(r, {
      align, vborder, empty: '',
      cellContent: bodyCellHl, multicol: multicolHl, multirow: multirowHl,
    });
    h4lines.push('    ' + tokens.join(h.amp()) + h.nl() + (hborder ? '\n    ' + h.hline() : ''));
  }
  const h4 = h4lines.length ? '\n' + h4lines.join('\n') + '\n  ' : '';

  const out = [
    `${h.cmd('\\tabla')}`,
    `  ${h.brace('{')}${h.arg1(escHtml(arg1))}${h.brace('}')}  ${h.comment('% #1 — nº columnas')}`,
    `  ${h.brace('{')}${h.arg2(escHtml(arg2))}${h.brace('}')}  ${h.comment('% #2 — col spec')}`,
    `  ${h.brace('{')}${h.arg3(h3)}${h.brace('}')}  ${h.comment('% #3 — cabecera')}`,
    `  ${h.brace('{')}${h.arg4(h4)}${h.brace('}')}  ${h.comment('% #4 — contenido')}`,
  ].join('\n');

  document.getElementById('latex-output').innerHTML = out;
  updateSwatches();
  updateStatus();
}

// Escape TeX special chars (except & and \\ which we handle structurally)
function escTex(s) {
  return (s || '')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\^/g, '\\^{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Copy Macro ─────────────────────────────────────────────────────────
function copyMacro() {
  const macro =
`\\newcommand{\\tabla}[4]{
\\begin{center}
    \\begin{longtable}{#2}
        \\hline
        #3 % Contenido de la primera fila de la tabla
        \\\\\\hline\\endfirsthead % Terminar Primera fila de tabla
        \\multicolumn{#1}{|l|}{{\\small\\sl\\tablaPreviousPage}}\\\\\\hline%Primera fila de tabla a principio de página
        #3\\\\\\endhead%Primera fila de tabla a principio de página
        \\multicolumn{#1}{|r|}{{\\small\\sl\\tablaNextPage}}\\\\ %Última fila de tabla para continuar
        \\endfoot
        \\endlastfoot
        #4%Contenido del interior de la tabla
    \\end{longtable}
\\end{center}
}`;

  navigator.clipboard.writeText(macro).then(() => {
    const btn = document.getElementById('macro-btn');
    btn.textContent = '✓ Copiado';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copiar Macro'; btn.classList.remove('copied'); }, 1800);
    showToast('\\newcommand{\\tabla} copiado');
  });
}

// ── Copy Table ─────────────────────────────────────────────────────────
function copyTable() {
  const { arg1, arg2, arg3, arg4 } = buildArgs();
  const plain = `\\tabla\n  {${arg1}}\n  {${arg2}}\n  {${arg3}}\n  {${arg4}}`;

  navigator.clipboard.writeText(plain).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✓ Copiado';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copiar Tabla'; btn.classList.remove('copied'); }, 1800);
    showToast('Código LaTeX copiado');
  });
}

// ── Status ─────────────────────────────────────────────────────────────
function updateStatus() {
  document.getElementById('st-rows').textContent = data.length;
  document.getElementById('st-cols').textContent = numCols;
  document.getElementById('st-cells').textContent = data.length * numCols;
}

// ── Toast ──────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Drag-select (Excel-like) ───────────────────────────────────────────
function getCellFromEvent(e) {
  const td = e.target.closest('#table-body td');
  if (!td || td.classList.contains('row-ctrl')) return null;
  const r = +td.dataset.row, c = +td.dataset.col;
  if (Number.isNaN(r) || Number.isNaN(c)) return null;
  return { r, c };
}

function renderSelectionHighlight() {
  document.querySelectorAll('#table-body td.cell-selected').forEach(td => td.classList.remove('cell-selected'));
  if (selection) {
    document.querySelectorAll('#table-body td').forEach(td => {
      if (td.classList.contains('row-ctrl')) return;
      const r = +td.dataset.row, c = +td.dataset.col;
      if (!Number.isNaN(r) && isCellSelected(r, c)) td.classList.add('cell-selected');
    });
  }
  updateMergeButtonsState();
}

document.addEventListener('pointerdown', e => {
  const cell = getCellFromEvent(e);
  if (!cell) return;
  dragAnchor = [cell.r, cell.c];
  isDragging = false;
  setSelection(cell.r, cell.c, cell.r, cell.c);
  renderSelectionHighlight();
});

document.addEventListener('pointermove', e => {
  if (!dragAnchor) return;
  const cell = getCellFromEvent(e);
  if (!cell) return;
  if (!isDragging && (cell.r !== dragAnchor[0] || cell.c !== dragAnchor[1])) {
    isDragging = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  if (!isDragging) return;
  setSelection(dragAnchor[0], dragAnchor[1], cell.r, cell.c);
  renderSelectionHighlight();
  e.preventDefault();
});

document.addEventListener('pointerup', () => {
  dragAnchor = null;
  isDragging = false;
});

// ── Paste event (Ctrl+V anywhere) ──────────────────────────────────────
document.addEventListener('paste', (e) => {
  if (e.target.id === 'paste-input' || e.target.tagName === 'INPUT') return;
  const text = e.clipboardData.getData('text');
  if (text.includes('\t') || text.includes('\n')) {
    e.preventDefault();
    document.getElementById('paste-input').value = text;
    importPaste();
  }
});

// ── Boot ───────────────────────────────────────────────────────────────
buildColorSelects();
initDefault();
