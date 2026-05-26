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
  const bgOp = +document.getElementById('cell-bg-opacity').value || 100;
  const fgOp = +document.getElementById('cell-fg-opacity').value || 100;
  let count = 0;
  for (let r = selection.r1; r <= selection.r2; r++) {
    for (let c = selection.c1; c <= selection.c2; c++) {
      // Skip hidden cells under a merge — only anchor carries style
      const m = getMergeAt(r, c);
      if (m && (m.r !== r || m.c !== c)) continue;
      setCellStyleAt(r, c, { bg, fg, bgOp, fgOp });
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

function onAltRowColorChange() {
  updateSwatches();
  renderLatex();
  applyHeaderColors();
}

// ── LaTeX parsing helpers ──────────────────────────────────────────────

// Read a balanced {…} group starting at first non-space char ≥ i.
function readBraced(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== '{') return null;
  let depth = 1, j = i + 1;
  while (j < s.length && depth > 0) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }       // skip escape: \{, \}, \cmd
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    j++;
  }
  if (depth !== 0) return null;
  return { content: s.slice(i + 1, j), end: j + 1 };
}

// "Red!50" → { name: 'Red', op: 50 }
function parseColorSpec(s) {
  const m = (s || '').trim().match(/^([A-Za-z][A-Za-z0-9]*)(?:!(\d+))?$/);
  if (!m) return { name: (s || '').trim(), op: 100 };
  return { name: m[1], op: m[2] ? +m[2] : 100 };
}

// Reverse of escTex (best-effort)
function unescTex(s) {
  return (s || '')
    .replace(/\\textasciitilde\s*\{\}/g, '~')
    .replace(/\\\^\s*\{\}/g, '^')
    .replace(/\\%/g, '%')
    .replace(/\\\$/g, '$')
    .replace(/\\#/g, '#')
    .replace(/\\_/g, '_')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .trim();
}

// Split a string by single char `sep` at brace depth 0. Respects \-escapes.
function splitTopLevel(s, sep) {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

// Split table body at `\\` row terminators at depth 0; strip \hline; extract \rowcolor{}
function splitBodyRows(body) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') {
      if (i + 1 < body.length && body[i + 1] === '\\' && depth === 0) {
        out.push(body.slice(start, i));
        i += 2; start = i; continue;
      }
      i += 2; continue;                          // skip any other escape sequence
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  out.push(body.slice(start));

  return out.map(r => {
    let s = r.replace(/\\hline/g, '')
             .replace(/\\(endfirsthead|endhead|endfoot|endlastfoot)/g, '')
             .trim();
    let rowColor = null;
    const rc = s.match(/^\\rowcolor\s*\{([^}]+)\}\s*/);
    if (rc) { rowColor = rc[1]; s = s.slice(rc[0].length).trim(); }
    return { rowColor, text: s };
  }).filter(r => r.text.length > 0);
}

// Parse a single cell's LaTeX into structured info
function parseLatexCell(raw) {
  let s = (raw || '').trim();
  const out = { text: '', bold: false, bg: null, fg: null, bgOp: 100, fgOp: 100, colspan: 1, rowspan: 1 };

  // \multicolumn{n}{spec}{content}
  if (/^\\multicolumn\s*\{/.test(s)) {
    const p = s.match(/^\\multicolumn\s*/)[0].length;
    const n = readBraced(s, p);  if (!n)  { out.text = unescTex(s); return out; }
    const sp = readBraced(s, n.end); if (!sp) { out.text = unescTex(s); return out; }
    const ix = readBraced(s, sp.end); if (!ix) { out.text = unescTex(s); return out; }
    out.colspan = Math.max(1, parseInt(n.content) || 1);
    s = ix.content.trim();
  }

  // \multirow{n}{*}{content}
  if (/^\\multirow\s*\{/.test(s)) {
    const p = s.match(/^\\multirow\s*/)[0].length;
    const n = readBraced(s, p);  if (!n)  { out.text = unescTex(s); return out; }
    const ast = readBraced(s, n.end); if (!ast) { out.text = unescTex(s); return out; }
    const ix = readBraced(s, ast.end); if (!ix) { out.text = unescTex(s); return out; }
    out.rowspan = Math.max(1, parseInt(n.content) || 1);
    s = ix.content.trim();
  }

  // \cellcolor{X}{...}   (the outer-wrap form generated by this tool)
  if (/^\\cellcolor\s*\{/.test(s)) {
    const p = s.match(/^\\cellcolor\s*/)[0].length;
    const bg = readBraced(s, p);
    if (bg) {
      const spec = parseColorSpec(bg.content);
      out.bg = spec.name; out.bgOp = spec.op;
      const wrap = readBraced(s, bg.end);
      if (wrap) s = wrap.content.trim();
      else      s = s.slice(bg.end).trim();
    }
  }

  // \textcolor{Y}{...}
  if (/^\\textcolor\s*\{/.test(s)) {
    const p = s.match(/^\\textcolor\s*/)[0].length;
    const fg = readBraced(s, p);
    if (fg) {
      const spec = parseColorSpec(fg.content);
      out.fg = spec.name; out.fgOp = spec.op;
      const inner = readBraced(s, fg.end);
      if (inner) s = inner.content.trim();
    }
  }

  // \textbf{...}
  if (/^\\textbf\s*\{/.test(s)) {
    const p = s.match(/^\\textbf\s*/)[0].length;
    const inner = readBraced(s, p);
    if (inner) { out.bold = true; s = inner.content.trim(); }
  }

  out.text = unescTex(s);
  return out;
}

// Detect dominant alignment from a col spec
function detectAlign(spec) {
  const m = (spec || '').match(/p\s*\{[^}]*\}|[lcr]/);
  if (!m) return 'l';
  const t = m[0];
  if (t.startsWith('p')) return 'p{2cm}';
  return t;
}

function colsFromSpec(spec) {
  return ((spec || '').match(/p\s*\{[^}]*\}|[lcr]/g) || []).length;
}

// ── LaTeX import ───────────────────────────────────────────────────────

function parseTablaMacro(text) {
  const idx = text.indexOf('\\tabla');
  if (idx < 0) return null;
  let pos = idx + '\\tabla'.length;
  const a1 = readBraced(text, pos); if (!a1) return null;
  const a2 = readBraced(text, a1.end); if (!a2) return null;
  const a3 = readBraced(text, a2.end); if (!a3) return null;
  const a4 = readBraced(text, a3.end); if (!a4) return null;
  return {
    numCols: parseInt(a1.content.trim()) || 0,
    spec: a2.content.trim(),
    header: a3.content,
    body: a4.content,
  };
}

function parseTabularEnv(text) {
  const m = text.match(/\\begin\s*\{(tabular|longtable)\}\s*\{([^}]*)\}/);
  if (!m) return null;
  const env = m[1];
  const spec = m[2];
  const startBody = m.index + m[0].length;
  const endIdx = text.indexOf(`\\end{${env}}`, startBody);
  if (endIdx < 0) return null;
  const rawBody = text.slice(startBody, endIdx);

  const rows = splitBodyRows(rawBody);
  if (!rows.length) return null;

  // Treat first row as header
  const headerRow = rows.shift();
  const bodyJoined = rows
    .map(r => (r.rowColor ? `\\rowcolor{${r.rowColor}} ` : '') + r.text)
    .join(' \\\\\n');
  return {
    numCols: 0,                                  // derived from spec later
    spec,
    header: headerRow.text,
    body: bodyJoined + (rows.length ? ' \\\\' : ''),
  };
}

// Apply a parsed { numCols, spec, header, body } to global state and re-render
function applyParsedTable(parsed) {
  if (!parsed.numCols) parsed.numCols = colsFromSpec(parsed.spec) || 1;

  // Reset state
  numCols = parsed.numCols;
  data = [];
  merges = [];
  cellStyles = {};
  clearSelection();

  // Col spec / borders
  document.getElementById('align-select').value = detectAlign(parsed.spec);
  document.getElementById('vborder').checked = (parsed.spec || '').includes('|');
  document.getElementById('manual-spec').value = '';
  document.getElementById('hborder').checked = (parsed.body || '').includes('\\hline');

  // Header row
  const headerCells = parsed.header && parsed.header.trim()
    ? splitTopLevel(parsed.header, '&').map(parseLatexCell)
    : [];

  const firstColored = headerCells.find(c => c.bg);
  if (firstColored) {
    document.getElementById('cell-color-select').value = firstColored.bg;
    document.getElementById('cell-color-opacity').value = firstColored.bgOp;
    if (firstColored.fg) {
      document.getElementById('text-color-select').value = firstColored.fg;
      document.getElementById('text-color-opacity').value = firstColored.fgOp;
    }
    document.getElementById('header-bold').checked = !!firstColored.bold;
  }

  const headerData = [];
  let hC = 0;
  for (const cell of headerCells) {
    headerData.push(cell.text);
    for (let k = 1; k < cell.colspan; k++) headerData.push('');
    if (cell.colspan > 1 || cell.rowspan > 1) {
      merges.push({ r: 0, c: hC, rowspan: cell.rowspan, colspan: cell.colspan });
    }
    // Per-cell override if differs from global header style
    if (cell.bg && firstColored && (cell.bg !== firstColored.bg || cell.fg !== firstColored.fg ||
        cell.bgOp !== firstColored.bgOp || cell.fgOp !== firstColored.fgOp)) {
      setCellStyleAt(0, hC, { bg: cell.bg, fg: cell.fg || 'white', bgOp: cell.bgOp, fgOp: cell.fgOp });
    }
    hC += cell.colspan;
  }
  while (headerData.length < numCols) headerData.push('');
  data.push(headerData);

  // Body rows
  const rows = splitBodyRows(parsed.body);

  // Detect alt-row colors from rowColor specs
  const altSpecs = [];
  for (const r of rows) if (r.rowColor && !altSpecs.includes(r.rowColor)) altSpecs.push(r.rowColor);
  const altEl = document.getElementById('alt-rows-enabled');
  if (altSpecs.length >= 1 && altEl) {
    altEl.checked = true;
    const s1 = parseColorSpec(altSpecs[0]);
    document.getElementById('alt-color1-select').value = s1.name;
    document.getElementById('alt-color1-opacity').value = s1.op;
    if (altSpecs.length >= 2) {
      const s2 = parseColorSpec(altSpecs[1]);
      document.getElementById('alt-color2-select').value = s2.name;
      document.getElementById('alt-color2-opacity').value = s2.op;
    }
  } else if (altEl) {
    altEl.checked = false;
  }

  for (const row of rows) {
    const r = data.length;
    const cells = splitTopLevel(row.text, '&').map(parseLatexCell);

    const rowData = [];
    let c = 0;

    for (const cell of cells) {
      // Is `c` covered by a merge from a previous row? Then this input cell
      // is the placeholder (empty or \multicolumn{n}{spec}{}).
      const existing = merges.find(mm => mm.r < r && mm.r + mm.rowspan > r && mm.c === c);
      if (existing) {
        for (let k = 0; k < existing.colspan; k++) rowData.push('');
        c += existing.colspan;
        continue;
      }

      rowData.push(cell.text);
      for (let k = 1; k < cell.colspan; k++) rowData.push('');

      if (cell.colspan > 1 || cell.rowspan > 1) {
        merges.push({ r, c, rowspan: cell.rowspan, colspan: cell.colspan });
      }
      if (cell.bg) {
        setCellStyleAt(r, c, { bg: cell.bg, fg: cell.fg || 'white', bgOp: cell.bgOp, fgOp: cell.fgOp });
      }
      c += cell.colspan;
    }

    while (rowData.length < numCols) rowData.push('');
    data.push(rowData);
  }

  if (!data.length) data.push(Array(numCols).fill(''));

  updateSwatches();
  renderTable();
  renderLatex();
  applyHeaderColors();
}

// Strip `% comments to end of line` (but not escaped \%)
function stripLatexComments(text) {
  return text.split('\n').map(line => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] === '%') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

function importLatex(text) {
  try {
    text = stripLatexComments(text);
    const tabla = parseTablaMacro(text);
    if (tabla) { applyParsedTable(tabla); return 'tabla'; }
    const tab = parseTabularEnv(text);
    if (tab)   { applyParsedTable(tab);   return 'tabular'; }
  } catch (e) {
    console.error('LaTeX parse error:', e);
  }
  return null;
}

// ── Import ─────────────────────────────────────────────────────────────
function importPaste() {
  const raw = document.getElementById('paste-input').value.trim();
  if (!raw) return showToast('Nada que importar');

  // Try LaTeX first if it looks like LaTeX (an instance, not a \newcommand definition)
  if (/\\tabla\s*\{/.test(raw) || /\\begin\s*\{(tabular|longtable)\}/.test(raw)) {
    const kind = importLatex(raw);
    if (kind) {
      document.getElementById('paste-input').value = '';
      showToast(`Tabla LaTeX importada (${data.length}×${numCols})`);
      return;
    }
    showToast('No se pudo parsear LaTeX — intento CSV');
  }

  // CSV / Excel fallback
  const rows = raw.split(/\r?\n/).map(line => {
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
  ['cell-color-select', 'text-color-select', 'cell-bg-select', 'cell-fg-select', 'alt-color1-select', 'alt-color2-select'].forEach(id => {
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
  // Alt-row defaults
  const alt1 = document.getElementById('alt-color1-select');
  const alt2 = document.getElementById('alt-color2-select');
  if (alt1) alt1.value = 'gray';
  if (alt2) alt2.value = 'white';
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
  const cellHex = tintHex(getColorHex(getCellColor()), getCellColorOp());
  const textHex = tintHex(getColorHex(getTextColor()), getTextColorOp());
  document.getElementById('cell-swatch').style.background = cellHex;
  document.getElementById('text-swatch').style.background = textHex;
  const prev = document.getElementById('header-cell-preview');
  prev.style.background = cellHex;
  prev.style.color = textHex;
  prev.style.fontWeight = isBold() ? '700' : '400';
  // Selected-cells swatches
  const bgSel = document.getElementById('cell-bg-select');
  const fgSel = document.getElementById('cell-fg-select');
  if (bgSel && fgSel) {
    const bgOp = +document.getElementById('cell-bg-opacity').value || 100;
    const fgOp = +document.getElementById('cell-fg-opacity').value || 100;
    document.getElementById('cell-bg-swatch').style.background = tintHex(getColorHex(bgSel.value), bgOp);
    document.getElementById('cell-fg-swatch').style.background = tintHex(getColorHex(fgSel.value), fgOp);
  }
  // Alt-row swatches
  const a1 = document.getElementById('alt-color1-swatch');
  const a2 = document.getElementById('alt-color2-swatch');
  if (a1 && a2) {
    a1.style.background = getAltColorHex(1);
    a2.style.background = getAltColorHex(2);
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
function getCellColorOp() { return +document.getElementById('cell-color-opacity').value || 100; }
function getTextColorOp() { return +document.getElementById('text-color-opacity').value || 100; }
function isBold() { return document.getElementById('header-bold').checked; }

// xcolor spec: `Red!50` for 50% tint, bare name when 100
function colorSpec(name, op) {
  const o = +op || 100;
  return o >= 100 ? name : `${name}!${o}`;
}

// Mix hex with white (visual approximation of xcolor !xx tint)
function tintHex(hex, op) {
  const o = (+op || 100) / 100;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = c => Math.round(c * o + 255 * (1 - o));
  const h = c => mix(c).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function altRowsEnabled() {
  const el = document.getElementById('alt-rows-enabled');
  return !!(el && el.checked);
}
function getAltColorSpec(idx) {
  const name = document.getElementById(`alt-color${idx}-select`).value;
  const op = +document.getElementById(`alt-color${idx}-opacity`).value || 100;
  return colorSpec(name, op);
}
function getAltColorHex(idx) {
  const name = document.getElementById(`alt-color${idx}-select`).value;
  const op = +document.getElementById(`alt-color${idx}-opacity`).value || 100;
  return tintHex(getColorHex(name), op);
}

function applyHeaderColors() {
  const headerBg = tintHex(getColorHex(getCellColor()), getCellColorOp());
  const headerFg = tintHex(getColorHex(getTextColor()), getTextColorOp());
  const altOn = altRowsEnabled();
  const alt1Hex = altOn ? getAltColorHex(1) : null;
  const alt2Hex = altOn ? getAltColorHex(2) : null;

  document.querySelectorAll('#table-body td').forEach(td => {
    if (td.classList.contains('row-ctrl')) return;
    const r = +td.dataset.row, c = +td.dataset.col;
    if (Number.isNaN(r)) return;
    const custom = getCellStyle(r, c);
    let bg = null, fg = null;
    if (custom) {
      bg = tintHex(getColorHex(custom.bg), custom.bgOp || 100);
      fg = tintHex(getColorHex(custom.fg), custom.fgOp || 100);
    } else if (r === 0) {
      bg = headerBg;
      fg = headerFg;
    } else if (altOn) {
      const altIdx = (r - 1) % 2;
      bg = altIdx === 0 ? alt1Hex : alt2Hex;
    }
    if (bg !== null) {
      td.style.background = bg;
      td.style.color = fg || '';
      const inp = td.querySelector('input');
      if (inp) {
        inp.style.color = fg || '';
        inp.style.background = 'transparent';
        inp.style.caretColor = fg || '';
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
  const cellOp = getCellColorOp();
  const textOp = getTextColorOp();
  const bold = isBold();
  const altOn = altRowsEnabled();
  const altSpec1 = altOn ? getAltColorSpec(1) : null;
  const altSpec2 = altOn ? getAltColorSpec(2) : null;

  const vb = vborder ? '|' : '';
  const rowSep = hborder ? ' \\\\\n    \\hline' : ' \\\\';

  const arg1 = String(numCols);
  const arg2 = manualSpec || (vb + Array(numCols).fill(align).join(vb) + vb);

  const plainMulticol = (n, spec, content) => `\\multicolumn{${n}}{${spec}}{${content}}`;
  const plainMultirow = (n, content) => `\\multirow{${n}}{*}{${content}}`;

  // Header cell: custom per-cell colors win; else fall back to global header colors
  const headerCellPlain = (r, c) => {
    const s = getCellStyle(r, c);
    const bg = s ? colorSpec(s.bg, s.bgOp) : colorSpec(cellColor, cellOp);
    const fg = s ? colorSpec(s.fg, s.fgOp) : colorSpec(textColor, textOp);
    return wrapStyledCell(data[r][c] || '', bg, fg, bold);
  };
  // Body cell: wrap with cellcolor/textcolor only if a custom style is set
  const bodyCellPlain = (r, c) => {
    const s = getCellStyle(r, c);
    if (s) return wrapStyledCell(data[r][c] || '', colorSpec(s.bg, s.bgOp), colorSpec(s.fg, s.fgOp), false);
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
    const altPrefix = altOn ? `\\rowcolor{${((r - 1) % 2 === 0) ? altSpec1 : altSpec2}} ` : '';
    bodyLines.push('    ' + altPrefix + tokens.join(' & ') + rowSep);
  }
  const arg4 = bodyLines.length ? '\n' + bodyLines.join('\n') + '\n  ' : '';

  return { arg1, arg2, arg3, arg4, align, vborder, hborder, cellColor, textColor, cellOp, textOp, bold, altOn, altSpec1, altSpec2 };
}

function renderLatex() {
  const { arg1, arg2, align, vborder, hborder, cellColor, textColor, cellOp, textOp, bold, altOn, altSpec1, altSpec2 } = buildArgs();

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
    const bg = s ? colorSpec(s.bg, s.bgOp) : colorSpec(cellColor, cellOp);
    const fg = s ? colorSpec(s.fg, s.fgOp) : colorSpec(textColor, textOp);
    return styledHl(data[r][c] || '', bg, fg, bold);
  };
  const bodyCellHl = (r, c) => {
    const s = getCellStyle(r, c);
    if (s) return styledHl(data[r][c] || '', colorSpec(s.bg, s.bgOp), colorSpec(s.fg, s.fgOp), false);
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
    const altPrefix = altOn
      ? `${h.cmd('\\rowcolor{')}${h.arg1(escHtml((r - 1) % 2 === 0 ? altSpec1 : altSpec2))}${h.brace('}')} `
      : '';
    h4lines.push('    ' + altPrefix + tokens.join(h.amp()) + h.nl() + (hborder ? '\n    ' + h.hline() : ''));
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
    setTimeout(() => { btn.textContent = '1. Copiar Macro'; btn.classList.remove('copied'); }, 1800);
    showToast('\\newcommand{\\tabla} copiado');
  });
}

// ── Ribbon tabs ────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.ribbon-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.ribbon-pane').forEach(p => {
    p.classList.toggle('active', p.dataset.pane === name);
  });
}

// ── Toggle output ──────────────────────────────────────────────────────
function toggleOutput() {
  const panel = document.getElementById('output-collapsible');
  const btn = document.getElementById('toggle-btn');
  const open = panel.classList.toggle('open');
  btn.textContent = open ? '▼ Ver código' : '▲ Ver código';
  btn.classList.toggle('open', open);
}

// ── Copy Table ─────────────────────────────────────────────────────────
function copyTable() {
  const { arg1, arg2, arg3, arg4 } = buildArgs();
  const plain = `\\tabla\n  {${arg1}}\n  {${arg2}}\n  {${arg3}}\n  {${arg4}}`;

  navigator.clipboard.writeText(plain).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✓ Copiado';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '2. Copiar Tabla'; btn.classList.remove('copied'); }, 1800);
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
