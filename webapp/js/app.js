// ── State ──────────────────────────────────────────────────────────────
let data = [];        // data[row][col] = string
let numCols = 0;

// ── Init ───────────────────────────────────────────────────────────────
function initDefault() {
  data = [
    ['Primera', 'Segunda', 'Tercera'],
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
    ['G', 'H', 'I'],
  ];
  numCols = 3;
  renderTable();
  renderLatex();
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
  // empty corner for row-ctrl
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

  // Data rows
  data.forEach((row, r) => {
    const tr = document.createElement('tr');
    const isHeader = r === 0;
    if (isHeader) tr.classList.add('header-row');

    // Row control
    const ctrlTd = document.createElement('td');
    ctrlTd.className = 'row-ctrl';
    ctrlTd.innerHTML = `<button class="row-del-btn" title="Eliminar fila" onclick="delRow(${r})">×</button>`;
    tr.appendChild(ctrlTd);

    for (let c = 0; c < numCols; c++) {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = row[c] || '';
      inp.dataset.row = r;
      inp.dataset.col = c;
      inp.addEventListener('input', onCellInput);
      inp.addEventListener('keydown', onCellKeydown);
      td.appendChild(inp);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  updateStatus();
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
  data.push(Array(numCols).fill(''));
  renderTable();
  renderLatex();
  setTimeout(() => focusCell(data.length - 1, 0), 20);
}

function delRow(r) {
  if (data.length <= 1) return showToast('Mínimo 1 fila');
  data.splice(r, 1);
  renderTable();
  renderLatex();
}

function delLastRow() { delRow(data.length - 1); }

function addCol() {
  numCols++;
  data.forEach(row => row.push(''));
  renderTable();
  renderLatex();
  setTimeout(() => focusCell(0, numCols - 1), 20);
}

function delCol(c) {
  if (numCols <= 1) return showToast('Mínimo 1 columna');
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
  renderTable();
  renderLatex();
  showToast('Tabla reseteada: cabecera + 3 filas × 3 columnas');
  setTimeout(() => focusCell(0, 0), 20);
}

function clearAll() {
  if (!confirm('¿Limpiar toda la tabla?')) return;
  data = data.map(row => Array(numCols).fill(''));
  renderTable();
  renderLatex();
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
  ['cell-color-select', 'text-color-select'].forEach(id => {
    const sel = document.getElementById(id);
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
  // Set defaults
  document.getElementById('cell-color-select').value = 'black';
  document.getElementById('text-color-select').value = 'white';
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
  const cellHex = getColorHex(getCellColor());
  const textHex = getColorHex(getTextColor());
  const headerTds = document.querySelectorAll('#table-body tr.header-row td');
  headerTds.forEach(td => {
    td.style.background = cellHex;
    td.style.color = textHex;
    const inp = td.querySelector('input');
    if (inp) {
      inp.style.color = textHex;
      inp.style.background = 'transparent';
      inp.style.caretColor = textHex;
    }
  });
}

function wrapHeaderCell(text, cellColor, textColor, bold) {
  const t = escTex(text);
  const inner = bold ? `\\textbf{${t}}` : t;
  return `\\cellcolor{${cellColor}}{\\textcolor{${textColor}}{${inner}}}`;
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
  const headerRow = data[0] || [];
  const bodyRows = data.slice(1);
  const rowSep = hborder ? ' \\\\\n    \\hline' : ' \\\\';

  const arg1 = String(numCols);
  const arg2 = manualSpec || (vb + Array(numCols).fill(align).join(vb) + vb);
  const arg3 = headerRow.map(c => wrapHeaderCell(c, cellColor, textColor, bold)).join(' & ');
  const arg4 = bodyRows.length
    ? '\n' + bodyRows.map(row => '    ' + row.map(c => escTex(c)).join(' & ') + rowSep).join('\n') + '\n  '
    : '';

  return { arg1, arg2, arg3, arg4, headerRow, bodyRows, cellColor, textColor, bold, hborder };
}

function renderLatex() {
  const { arg1, arg2, headerRow, bodyRows, cellColor, textColor, bold, hborder } = buildArgs();

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

  const h3cells = headerRow.map(c => {
    const t = escHtml(escTex(c));
    const inner = bold ? `${h.cmd('\\textbf{')}${t}${h.brace('}')}` : t;
    return `${h.cmd('\\cellcolor{')}${h.arg1(escHtml(cellColor))}${h.brace('}')}` +
      `${h.brace('{')}${h.cmd('\\textcolor{')}${h.arg1(escHtml(textColor))}${h.brace('}')}` +
      `${h.brace('{')}${inner}${h.brace('}')}${h.brace('}')}`;
  }).join(h.amp());

  const h4lines = bodyRows.map(row =>
    '    ' + row.map(c => escHtml(escTex(c))).join(h.amp()) + h.nl() + (hborder ? '\n    ' + h.hline() : '')
  );
  const h4 = h4lines.length ? '\n' + h4lines.join('\n') + '\n  ' : '';

  const out = [
    `${h.cmd('\\tabla')}`,
    `  ${h.brace('{')}${h.arg1(escHtml(arg1))}${h.brace('}')}  ${h.comment('% #1 — nº columnas')}`,
    `  ${h.brace('{')}${h.arg2(escHtml(arg2))}${h.brace('}')}  ${h.comment('% #2 — col spec')}`,
    `  ${h.brace('{')}${h.arg3(h3cells)}${h.brace('}')}  ${h.comment('% #3 — cabecera')}`,
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
