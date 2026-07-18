/* table_editor.js — EXACT tabular data editor */
(function () {
'use strict';

// ---------------------------------------------------------------------------
// CSV parsing / serialisation (RFC 4180)
// ---------------------------------------------------------------------------
function parseCSV(text, delim) {
  delim = delim || ',';
  var rows = [], row = [], field = '', inQ = false, i, c, nc;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (i = 0; i <= text.length; i++) {
    c = text[i];
    if (inQ) {
      if (c === '"') { nc = text[i+1]; if (nc === '"') { field += '"'; i++; } else { inQ = false; } }
      else if (c === undefined) { row.push(field); rows.push(row); }
      else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === undefined) {
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else { field += c; }
    }
  }
  return rows;
}

function escField(v) {
  v = v == null ? '' : String(v);
  if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0)
    return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function serializeCSV(headers, data) {
  var lines = [headers.map(escField).join(',')];
  data.forEach(function(row) { lines.push(row.map(escField).join(',')); });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var cfg      = window.TE_CONFIG || {};
var headers  = [];       // array of string
var data     = [];       // array of array of string (all rows)
var colWidths = {};      // {colIdx: px}
var hiddenCols = {};     // {colIdx: true}
var hiddenRows = {};     // {rowIdx: true}
var colFilters = {};     // {colIdx: filterString}
var _filteredIndices = null; // null = no active filter
var selAnchor = null;    // {ri, ci} — mousedown origin
var selFocus  = null;    // {ri, ci} — current drag extent
var _selDragging = false;
var dirty    = false;
var currentVersion = cfg.currentVersion || 0;
var PAGE_SIZE = 150;
var page     = 0;
var totalPages = 1;
var previewingVersion = null;  // null = live, N = historical

// ---------------------------------------------------------------------------
// Internal URL / reference detection
// ---------------------------------------------------------------------------
var TE_PATTERNS = [
  { re: /^\/images\/imageset\/(\d+)\/$/, type: 'imageset', label: 'Image set' },
  { re: /^\/annotations\/(\d+)\/$/, type: 'image', label: 'Image' },
];
var _refCache   = {};  // path -> {type, name, detail}
var _refPending = {};  // path -> true

function isExactRef(val) {
  if (!val || typeof val !== 'string') return null;
  var path = val.trim();
  try {
    var u = new URL(path);
    if (u.origin !== window.location.origin) return null;
    path = u.pathname;
  } catch(e) {
    if (path[0] !== '/') return null;
  }
  for (var i = 0; i < TE_PATTERNS.length; i++) {
    var m = path.match(TE_PATTERNS[i].re);
    if (m) return { pattern: TE_PATTERNS[i], path: path, id: m[1] };
  }
  return null;
}

function renderRefChip(cell, val, refMatch) {
  var path = refMatch.path;
  var label = refMatch.pattern.label;
  var cached = _refCache[path];
  var name = cached ? cached.name : '…';
  var title = cached ? (cached.detail ? cached.detail + ' / ' + cached.name : cached.name) : '';
  cell.innerHTML = '<a class="te-ref-chip" href="' + esc(path) + '" target="_blank" rel="noopener"'
    + ' data-ref-url="' + esc(path) + '" title="' + esc(title) + '">'
    + '<i class="fa fa-link"></i>'
    + '<span class="te-ref-type">' + esc(label) + ':</span>'
    + '<span class="te-ref-name">' + esc(name) + '</span>'
    + '</a>';
  if (!cached) resolveRef(path, refMatch.pattern);
}

function resolveRef(path, pattern) {
  if (_refCache[path] || _refPending[path]) return;
  _refPending[path] = true;
  fetch(cfg.urlResolve + '?path=' + encodeURIComponent(path), { credentials: 'same-origin' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.name) {
        _refCache[path] = d;
        document.querySelectorAll('[data-ref-url="' + path.replace(/"/g, '%22') + '"]').forEach(function(chip) {
          var nameEl = chip.querySelector('.te-ref-name');
          if (nameEl) nameEl.textContent = d.name;
          var title = d.detail ? d.detail + ' / ' + d.name : d.name;
          chip.title = title;
        });
      }
    })
    .catch(function() {})
    .then(function() { delete _refPending[path]; });
}

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
var elTable    = document.getElementById('te-table');
var elThead    = document.getElementById('te-thead');
var elTbody    = document.getElementById('te-tbody');
var elLoading  = document.getElementById('te-loading');
var elFooter   = document.getElementById('te-footer');
var elStats    = document.getElementById('te-stats');
var elPageLbl  = document.getElementById('te-page-label');
var elDirty    = document.getElementById('te-dirty');
var elVerBadge = document.getElementById('te-version-badge');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', function() {
  bindToolbar();
  bindModals();
  loadSettings(function() { loadData(); });
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
function loadData() {
  showLoading(true);
  fetch(cfg.urlData, {credentials:'same-origin'})
    .then(function(r){ return r.json(); })
    .then(function(d){
      currentVersion = d.version || 0;
      previewingVersion = null;
      loadCSV(d.csv || '');
      showLoading(false);
      setVersionBadge('v' + currentVersion, false);
      setEnableWrite(true);
    })
    .catch(function(){ showLoading(false); showError('Failed to load data.'); });
}

function loadCSV(csv) {
  var rows = parseCSV(csv);
  if (rows.length === 0) { headers = []; data = []; }
  else { headers = rows[0]; data = rows.slice(1); }
  page = 0;
  colFilters = {};
  _filteredIndices = null;
  selAnchor = null; selFocus = null;
  totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  dirty = false;
  updateDirty();
  renderTable();
  updateStats();
  renderColSettings();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
var elEmpty = null; // lazy-created empty-state element

function renderTable() {
  renderHead();
  renderBody();
  var isEmpty = headers.length === 0 && data.length === 0;
  elTable.style.display  = isEmpty ? 'none' : '';
  elFooter.style.display = isEmpty ? 'none' : '';
  _renderEmptyState(isEmpty);
}

function _renderEmptyState(show) {
  var wrap = document.getElementById('te-table-wrap');
  if (!elEmpty) {
    elEmpty = document.createElement('div');
    elEmpty.className = 'te-empty-state';
    elEmpty.innerHTML =
      '<div class="te-empty-icon"><i class="fa fa-table"></i></div>' +
      '<div class="te-empty-title">Empty table</div>' +
      '<div class="te-empty-sub">Add a column to start editing, or paste data from a spreadsheet.</div>' +
      '<div class="te-empty-actions">' +
        (cfg.canWrite && !previewingVersion
          ? '<button class="te-btn te-btn-add-col" id="te-empty-add-col"><i class="fa fa-plus"></i> Add column</button>'
          : '') +
        (cfg.canWrite && !previewingVersion
          ? '<button class="te-btn" id="te-empty-paste"><i class="fa fa-clipboard"></i> Paste from clipboard</button>'
          : '') +
      '</div>';
    wrap.appendChild(elEmpty);
    var addColBtn = elEmpty.querySelector('#te-empty-add-col');
    if (addColBtn) addColBtn.addEventListener('click', function() {
      document.getElementById('btn-add-col').click();
    });
    var pasteBtn = elEmpty.querySelector('#te-empty-paste');
    if (pasteBtn) pasteBtn.addEventListener('click', function() {
      selAnchor = {ri: 0, ci: 0};
      pasteAtAnchor();
    });
  }
  elEmpty.style.display = show ? '' : 'none';
}

function renderHead() {
  var tr = document.createElement('tr');
  // Row-number gutter
  var th0 = document.createElement('th');
  th0.className = 'te-row-num-hd';
  th0.textContent = '#';
  tr.appendChild(th0);

  headers.forEach(function(h, ci) {
    var th = document.createElement('th');
    th.dataset.col = ci;
    th.style.width = (colWidths[ci] || 120) + 'px';
    if (hiddenCols[ci]) th.style.display = 'none';

    var span = document.createElement('span');
    span.className = 'te-hd-text';
    span.textContent = h;

    // Editable header
    if (cfg.canWrite && !previewingVersion) {
      span.contentEditable = 'true';
      span.addEventListener('blur', function() {
        headers[ci] = span.textContent.trim();
        markDirty();
      });
      span.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
      });
    }

    th.appendChild(span);

    // Resize handle
    var handle = document.createElement('span');
    handle.className = 'te-resize-handle';
    handle.addEventListener('mousedown', makeResizer(th, ci));
    th.appendChild(handle);

    if (cfg.canWrite && !previewingVersion) {
      th.addEventListener('contextmenu', function(e) {
        showColContextMenu(e, ci);
      });
    }

    tr.appendChild(th);
  });

  // Filter row
  var filterTr = document.createElement('tr');
  filterTr.className = 'te-filter-row';

  var clearCell = document.createElement('th');
  clearCell.className = 'te-row-num-hd te-filter-clear-cell';
  var clearBtn = document.createElement('button');
  clearBtn.className = 'te-filter-clear-all';
  clearBtn.title = 'Clear all filters';
  clearBtn.innerHTML = '&times;';
  var anyActive = Object.keys(colFilters).some(function(k) { return !!colFilters[k]; });
  clearBtn.style.display = anyActive ? '' : 'none';
  clearBtn.addEventListener('click', function() {
    colFilters = {};
    filterTr.querySelectorAll('.te-filter-input').forEach(function(inp) {
      inp.value = '';
      inp.classList.remove('te-filter-active');
    });
    clearBtn.style.display = 'none';
    _applyFilters(true);
  });
  clearCell.appendChild(clearBtn);
  filterTr.appendChild(clearCell);

  headers.forEach(function(h, ci) {
    var ftd = document.createElement('th');
    ftd.className = 'te-filter-cell';
    if (hiddenCols[ci]) ftd.style.display = 'none';

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'te-filter-input';
    inp.placeholder = 'Filter…';
    inp.dataset.col = ci;
    inp.value = colFilters[ci] || '';
    if (colFilters[ci]) inp.classList.add('te-filter-active');

    inp.addEventListener('input', function() {
      var c = parseInt(inp.dataset.col);
      var v = inp.value;
      if (v) { colFilters[c] = v; inp.classList.add('te-filter-active'); }
      else   { delete colFilters[c]; inp.classList.remove('te-filter-active'); }
      var still = Object.keys(colFilters).some(function(k) { return !!colFilters[k]; });
      clearBtn.style.display = still ? '' : 'none';
      _applyFilters(true);
    });

    ftd.appendChild(inp);
    filterTr.appendChild(ftd);
  });

  elThead.innerHTML = '';
  elThead.appendChild(tr);
  elThead.appendChild(filterTr);
}

// _applyFilters: recompute _filteredIndices + totalPages; if resetPage, jump to 0 and re-render.
function _applyFilters(resetPage) {
  var active = Object.keys(colFilters).filter(function(k) { return !!colFilters[k]; });
  if (active.length === 0) {
    _filteredIndices = null;
    totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  } else {
    _filteredIndices = [];
    for (var ri = 0; ri < data.length; ri++) {
      if (hiddenRows[ri]) continue;
      var row = data[ri];
      var ok = true;
      for (var ai = 0; ai < active.length; ai++) {
        var ci = parseInt(active[ai]);
        var val = (row[ci] != null ? String(row[ci]) : '').toLowerCase();
        if (val.indexOf(colFilters[active[ai]].toLowerCase()) === -1) { ok = false; break; }
      }
      if (ok) _filteredIndices.push(ri);
    }
    totalPages = Math.max(1, Math.ceil(_filteredIndices.length / PAGE_SIZE));
  }
  if (resetPage) page = 0;
  page = Math.min(page, Math.max(0, totalPages - 1));
  renderBody();
  updateStats();
  updatePageLabel();
}

function renderBody() {
  elTbody.innerHTML = '';
  var indices = [];
  if (_filteredIndices !== null) {
    var fs = page * PAGE_SIZE;
    var fe = Math.min(fs + PAGE_SIZE, _filteredIndices.length);
    indices = _filteredIndices.slice(fs, fe);
  } else {
    var start = page * PAGE_SIZE;
    var end   = Math.min(start + PAGE_SIZE, data.length);
    for (var i = start; i < end; i++) indices.push(i);
  }
  for (var idx = 0; idx < indices.length; idx++) {
    var ri  = indices[idx];
    var row = data[ri];
    var tr  = document.createElement('tr');
    tr.dataset.row = ri;
    if (_filteredIndices === null && hiddenRows[ri]) tr.style.display = 'none';

    // Row number
    var rn = document.createElement('td');
    rn.className = 'te-row-num';
    rn.textContent = ri + 1;
    if (cfg.canWrite && !previewingVersion) {
      rn.title = 'Right-click for row options';
      rn.addEventListener('contextmenu', function(e) {
        showRowContextMenu(e, parseInt(e.currentTarget.parentElement.dataset.row));
      });
    }
    tr.appendChild(rn);

    headers.forEach(function(_, ci) {
      var td = document.createElement('td');
      td.dataset.row = ri;
      td.dataset.col = ci;
      if (hiddenCols[ci]) td.style.display = 'none';

      var val = row[ci] != null ? row[ci] : '';
      var cell = document.createElement('div');
      cell.className = 'te-cell-inner';
      var refMatch = isExactRef(val);
      if (refMatch) {
        td.title = '';
        renderRefChip(cell, val, refMatch);
      } else {
        td.title = val;
        cell.textContent = val;
      }
      td.appendChild(cell);

      // Selection: mousedown sets anchor; shift+click extends; drag updates focus
      td.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        e.preventDefault(); // prevent native text selection during drag
        var el = e.currentTarget;
        var r = parseInt(el.dataset.row), c = parseInt(el.dataset.col);
        if (e.shiftKey && selAnchor) {
          selFocus = {ri: r, ci: c};
        } else {
          selAnchor = {ri: r, ci: c};
          selFocus  = {ri: r, ci: c};
        }
        _selDragging = true;
        applySelectionHighlight();
      });
      td.addEventListener('mouseover', function(e) {
        if (!_selDragging) return;
        var el = e.currentTarget;
        selFocus = {ri: parseInt(el.dataset.row), ci: parseInt(el.dataset.col)};
        applySelectionHighlight();
      });

      if (cfg.canWrite && !previewingVersion) {
        td.addEventListener('dblclick', function(e) {
          var el = e.currentTarget;
          startEdit(el, parseInt(el.dataset.row), parseInt(el.dataset.col));
        });
        td.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          var el = e.currentTarget;
          var r = parseInt(el.dataset.row), c = parseInt(el.dataset.col);
          // If right-click is outside current selection, reset to that cell
          if (!_cellInSel(r, c)) { selAnchor = {ri:r,ci:c}; selFocus = {ri:r,ci:c}; applySelectionHighlight(); }
          showCellContextMenu(e, r, c);
        });
      } else {
        td.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          var el = e.currentTarget;
          var r = parseInt(el.dataset.row), c = parseInt(el.dataset.col);
          if (!_cellInSel(r, c)) { selAnchor = {ri:r,ci:c}; selFocus = {ri:r,ci:c}; applySelectionHighlight(); }
          showCellContextMenu(e, r, c);
        });
      }
      tr.appendChild(td);
    });
    elTbody.appendChild(tr);
  }
  applySelectionHighlight();
}

// ---------------------------------------------------------------------------
// Cell editing
// ---------------------------------------------------------------------------
var activeInput = null;

function startEdit(td, ri, ci) {
  if (activeInput) commitEdit();
  var val = data[ri][ci] != null ? data[ri][ci] : '';
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'te-cell-input';
  inp.value = val;
  td.innerHTML = '';
  td.appendChild(inp);
  inp.focus();
  inp.select();
  activeInput = {inp: inp, ri: ri, ci: ci, td: td};

  inp.addEventListener('blur', commitEdit);
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter')       { e.preventDefault(); commitEdit(); moveEdit(ri + 1, ci); }
    if (e.key === 'Tab')         { e.preventDefault(); commitEdit(); moveEdit(ri, ci + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape')      { e.preventDefault(); cancelEdit(); }
    if (e.key === 'ArrowDown')   { e.preventDefault(); commitEdit(); moveEdit(ri + 1, ci); }
    if (e.key === 'ArrowUp')     { e.preventDefault(); commitEdit(); moveEdit(ri - 1, ci); }
    if (e.key === 'ArrowRight' && inp.selectionStart >= inp.value.length) {
      e.preventDefault(); commitEdit(); moveEdit(ri, ci + 1);
    }
    if (e.key === 'ArrowLeft' && inp.selectionStart === 0) {
      e.preventDefault(); commitEdit(); moveEdit(ri, ci - 1);
    }
  });
}

function commitEdit() {
  if (!activeInput) return;
  var ri = activeInput.ri, ci = activeInput.ci;
  var val = activeInput.inp.value;
  data[ri][ci] = val;
  var cell = document.createElement('div');
  cell.className = 'te-cell-inner';
  cell.textContent = val;
  activeInput.td.innerHTML = '';
  activeInput.td.appendChild(cell);
  activeInput.td.title = val;
  activeInput = null;
  markDirty();
}

function cancelEdit() {
  if (!activeInput) return;
  var ri = activeInput.ri, ci = activeInput.ci;
  var cell = document.createElement('div');
  cell.className = 'te-cell-inner';
  var val = data[ri][ci] != null ? data[ri][ci] : '';
  cell.textContent = val;
  activeInput.td.innerHTML = '';
  activeInput.td.appendChild(cell);
  activeInput = null;
}

function moveEdit(ri, ci) {
  ci = Math.max(0, Math.min(ci, headers.length - 1));
  ri = Math.max(0, Math.min(ri, data.length - 1));
  // Ensure on correct page
  var targetPage = Math.floor(ri / PAGE_SIZE);
  if (targetPage !== page) { page = targetPage; renderBody(); }
  var rowEl = ri - (page * PAGE_SIZE);
  var rows = elTbody.querySelectorAll('tr');
  if (rows[rowEl]) {
    var tds = rows[rowEl].querySelectorAll('td[data-col]');
    if (tds[ci]) startEdit(tds[ci], ri, ci);
  }
}

// ---------------------------------------------------------------------------
// Column resize
// ---------------------------------------------------------------------------
function makeResizer(th, ci) {
  return function(e) {
    e.preventDefault();
    var startX = e.clientX;
    var startW = th.offsetWidth;
    function onMove(ev) {
      var w = Math.max(40, startW + ev.clientX - startX);
      th.style.width = w + 'px';
      colWidths[ci] = w;
      // Keep all cells in this column the same width via CSS variable trick
      document.querySelectorAll('td[data-col="'+ci+'"]').forEach(function(td){
        td.style.maxWidth = w + 'px';
      });
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveSettings();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
var ctxMenu = null;

function showContextMenu(e, items) {
  hideContextMenu();
  e.preventDefault();
  e.stopPropagation();
  var menu = document.createElement('div');
  menu.className = 'te-ctx-menu';
  items.forEach(function(item) {
    if (item === '-') {
      var sep = document.createElement('div'); sep.className = 'te-ctx-sep'; menu.appendChild(sep);
    } else {
      var el = document.createElement('div');
      el.className = 'te-ctx-item' + (item.danger ? ' te-ctx-danger' : '') + (item.muted ? ' te-ctx-muted' : '');
      el.innerHTML = (item.icon ? '<i class="fa ' + item.icon + '"></i> ' : '') + esc(item.label);
      el.addEventListener('mousedown', function(ev) { ev.preventDefault(); hideContextMenu(); item.action(); });
      menu.appendChild(el);
    }
  });
  document.body.appendChild(menu);
  ctxMenu = menu;
  var x = e.clientX, y = e.clientY;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  var r = menu.getBoundingClientRect();
  if (r.right  > window.innerWidth)  menu.style.left = (x - r.width)  + 'px';
  if (r.bottom > window.innerHeight) menu.style.top  = (y - r.height) + 'px';
}

function hideContextMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hideContextMenu(); });

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------
document.addEventListener('mouseup', function() { _selDragging = false; });

function getSelRange() {
  if (!selAnchor || !selFocus) return null;
  return {
    r1: Math.min(selAnchor.ri, selFocus.ri),
    c1: Math.min(selAnchor.ci, selFocus.ci),
    r2: Math.max(selAnchor.ri, selFocus.ri),
    c2: Math.max(selAnchor.ci, selFocus.ci),
  };
}

function _cellInSel(r, c) {
  var rng = getSelRange();
  return rng && r >= rng.r1 && r <= rng.r2 && c >= rng.c1 && c <= rng.c2;
}

function applySelectionHighlight() {
  var rng = getSelRange();
  elTbody.querySelectorAll('td[data-row]').forEach(function(td) {
    var r = parseInt(td.dataset.row), c = parseInt(td.dataset.col);
    if (rng && r >= rng.r1 && r <= rng.r2 && c >= rng.c1 && c <= rng.c2) {
      td.classList.add('te-selected');
    } else {
      td.classList.remove('te-selected');
    }
  });
}

// ---------------------------------------------------------------------------
// Clipboard: copy / cut / paste
// ---------------------------------------------------------------------------
function _selToTSV() {
  var rng = getSelRange();
  if (!rng) return '';
  var lines = [];
  for (var r = rng.r1; r <= rng.r2; r++) {
    var cells = [];
    for (var c = rng.c1; c <= rng.c2; c++) {
      cells.push(data[r] && data[r][c] != null ? String(data[r][c]) : '');
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

function copySelection() {
  var rng = getSelRange();
  if (!rng) return;
  var text = _selToTSV();
  navigator.clipboard.writeText(text).then(function() {
    var rows = rng.r2 - rng.r1 + 1, cols = rng.c2 - rng.c1 + 1;
    notify('Copied ' + rows + ' × ' + cols + ' cell' + (rows * cols > 1 ? 's' : ''), 'info');
  }).catch(function() { notify('Copy failed — clipboard permission denied', 'error'); });
}

function cutSelection() {
  if (!cfg.canWrite || previewingVersion) return;
  var rng = getSelRange();
  if (!rng) return;
  copySelection();
  for (var r = rng.r1; r <= rng.r2; r++) {
    for (var c = rng.c1; c <= rng.c2; c++) {
      if (data[r]) data[r][c] = '';
    }
  }
  renderBody();
  markDirty();
}

function pasteAtAnchor() {
  if (!cfg.canWrite || previewingVersion) return;
  var activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
  navigator.clipboard.readText().then(function(text) {
    if (!text) return;
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    if (!lines.length) return;

    // Bootstrap: if the table has no structure, build it from the pasted data.
    if (headers.length === 0) {
      var colCount = lines.reduce(function(m, l) { return Math.max(m, l.split('\t').length); }, 0);
      for (var k = 0; k < colCount; k++) headers.push('Col ' + (k + 1));
      data = [];
      lines.forEach(function(l) {
        var cells = l.split('\t');
        while (cells.length < colCount) cells.push('');
        data.push(cells);
      });
      selAnchor = {ri: 0, ci: 0};
      selFocus  = {ri: data.length - 1, ci: headers.length - 1};
      renderTable();
      renderColSettings();
      markDirty();
      notify('Pasted ' + data.length + ' × ' + headers.length + ' cell' + (data.length * headers.length > 1 ? 's' : ''), 'info');
      return;
    }

    if (!selAnchor) return;
    var ar = selAnchor.ri, ac = selAnchor.ci;
    var pastedRows = 0, pastedCols = 0;
    for (var dr = 0; dr < lines.length; dr++) {
      var ri = ar + dr;
      if (ri >= data.length) break;
      var cols = lines[dr].split('\t');
      pastedCols = Math.max(pastedCols, cols.length);
      for (var dc = 0; dc < cols.length; dc++) {
        var ci = ac + dc;
        if (ci >= headers.length) break;
        if (data[ri]) { data[ri][ci] = cols[dc]; pastedRows = dr + 1; }
      }
    }
    if (!pastedRows) return;
    selFocus = {ri: ar + pastedRows - 1, ci: Math.min(ac + pastedCols - 1, headers.length - 1)};
    renderBody();
    markDirty();
    notify('Pasted ' + pastedRows + ' × ' + pastedCols + ' cell' + (pastedRows * pastedCols > 1 ? 's' : ''), 'info');
  }).catch(function() { notify('Paste failed — clipboard permission denied', 'error'); });
}

// Keyboard shortcuts for clipboard
document.addEventListener('keydown', function(e) {
  var ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;
  var active = document.activeElement;
  var inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (e.key === 'c' && !inInput && getSelRange()) { e.preventDefault(); copySelection(); }
  if (e.key === 'x' && !inInput && getSelRange()) { e.preventDefault(); cutSelection(); }
  if (e.key === 'v' && !inInput && (selAnchor || headers.length === 0)) { e.preventDefault(); pasteAtAnchor(); }
});

// Escape clears selection
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && !ctxMenu && !activeInput) {
    selAnchor = null; selFocus = null; applySelectionHighlight();
  }
});

function showRowContextMenu(e, ri) {
  var isHidden = !!hiddenRows[ri];
  showContextMenu(e, [
    { icon: 'fa-arrow-up',    label: 'Insert row above', action: function() { insertRow(ri, false); } },
    { icon: 'fa-arrow-down',  label: 'Insert row below', action: function() { insertRow(ri, true);  } },
    '-',
    { icon: isHidden ? 'fa-eye' : 'fa-eye-slash',
      label: isHidden ? 'Show row' : 'Hide row',
      action: function() { toggleHideRow(ri); } },
    { icon: 'fa-trash', label: 'Delete row', danger: true, action: function() {
        if (confirm('Delete row ' + (ri + 1) + '?')) deleteRow(ri);
    }},
  ]);
}

function showCellContextMenu(e, ri, ci) {
  var val = data[ri] && data[ri][ci] != null ? data[ri][ci] : '';
  var ref = isExactRef(val);
  var items = [];
  if (ref) {
    items.push({ icon: 'fa-external-link', label: 'Open in new tab', action: function() {
      window.open(ref.path, '_blank', 'noopener');
    }});
    items.push({ icon: 'fa-times', label: 'Remove reference', danger: true, action: function() {
      data[ri][ci] = '';
      var td = elTbody.querySelector('td[data-row="' + ri + '"][data-col="' + ci + '"]');
      if (td) {
        var cell = td.querySelector('.te-cell-inner');
        if (cell) { cell.innerHTML = ''; cell.textContent = ''; }
        td.title = '';
      }
      markDirty();
    }});
    items.push('-');
  }
  // Clipboard items — only when something is selected
  var rng = getSelRange();
  if (rng) {
    items.push('-');
    items.push({ icon: 'fa-copy',  label: 'Copy',  action: function() { copySelection(); } });
    if (cfg.canWrite && !previewingVersion) {
      items.push({ icon: 'fa-cut', label: 'Cut', action: function() { cutSelection(); } });
    }
  }
  if (cfg.canWrite && !previewingVersion) {
    items.push('-');
    items.push({ icon: 'fa-link', label: 'Insert reference…', action: function() { openRefPicker(ri, ci); } });
  }
  showContextMenu(e, items);
}

function showColContextMenu(e, ci) {
  var isHidden = !!hiddenCols[ci];
  showContextMenu(e, [
    { icon: 'fa-arrow-left',  label: 'Insert column left',  action: function() { insertCol(ci, false); } },
    { icon: 'fa-arrow-right', label: 'Insert column right', action: function() { insertCol(ci, true);  } },
    '-',
    { icon: isHidden ? 'fa-eye' : 'fa-eye-slash',
      label: isHidden ? 'Show column' : 'Hide column',
      action: function() { toggleHideCol(ci); } },
    { icon: 'fa-trash', label: 'Delete column', danger: true, action: function() {
        if (confirm('Delete column "' + (headers[ci] || ci) + '"?')) deleteCol(ci);
    }},
  ]);
}

// ---------------------------------------------------------------------------
// Row / column insert & delete
// ---------------------------------------------------------------------------
function insertRow(ri, after) {
  var pos = after ? ri + 1 : ri;
  data.splice(pos, 0, new Array(headers.length).fill(''));
  var shifted = {};
  Object.keys(hiddenRows).forEach(function(k) {
    var idx = parseInt(k); shifted[idx < pos ? idx : idx + 1] = true;
  });
  hiddenRows = shifted;
  _applyFilters(false);
  markDirty();
}

function deleteRow(ri) {
  data.splice(ri, 1);
  var shifted = {};
  Object.keys(hiddenRows).forEach(function(k) {
    var idx = parseInt(k);
    if (idx !== ri) shifted[idx > ri ? idx - 1 : idx] = true;
  });
  hiddenRows = shifted;
  _applyFilters(false);
  markDirty(); renderRowSettings();
}

function toggleHideRow(ri) {
  if (hiddenRows[ri]) { delete hiddenRows[ri]; } else { hiddenRows[ri] = true; }
  saveSettings(); _applyFilters(false); renderRowSettings();
}

function insertCol(ci, after) {
  var name = prompt('Column name:');
  if (name === null) return;
  name = name.trim() || ('Col ' + (headers.length + 1));
  var pos = after ? ci + 1 : ci;
  headers.splice(pos, 0, name);
  data.forEach(function(row) { row.splice(pos, 0, ''); });
  var shiftedC = {}, shiftedW = {};
  Object.keys(hiddenCols).forEach(function(k) {
    var idx = parseInt(k); shiftedC[idx < pos ? idx : idx + 1] = true;
  });
  Object.keys(colWidths).forEach(function(k) {
    var idx = parseInt(k); shiftedW[idx < pos ? idx : idx + 1] = colWidths[k];
  });
  var shiftedF = {};
  Object.keys(colFilters).forEach(function(k) {
    var idx = parseInt(k); shiftedF[idx < pos ? idx : idx + 1] = colFilters[k];
  });
  hiddenCols = shiftedC; colWidths = shiftedW; colFilters = shiftedF;
  renderTable(); _applyFilters(false); markDirty();
}

function deleteCol(ci) {
  headers.splice(ci, 1);
  data.forEach(function(row) { row.splice(ci, 1); });
  var shiftedC = {}, shiftedW = {}, shiftedF = {};
  Object.keys(hiddenCols).forEach(function(k) {
    var idx = parseInt(k);
    if (idx !== ci) shiftedC[idx > ci ? idx - 1 : idx] = true;
  });
  Object.keys(colWidths).forEach(function(k) {
    var idx = parseInt(k);
    if (idx !== ci) shiftedW[idx > ci ? idx - 1 : idx] = colWidths[k];
  });
  Object.keys(colFilters).forEach(function(k) {
    var idx = parseInt(k);
    if (idx !== ci) shiftedF[idx > ci ? idx - 1 : idx] = colFilters[k];
  });
  hiddenCols = shiftedC; colWidths = shiftedW; colFilters = shiftedF;
  renderTable(); renderColSettings(); _applyFilters(false); markDirty();
}

function toggleHideCol(ci) {
  if (hiddenCols[ci]) { delete hiddenCols[ci]; } else { hiddenCols[ci] = true; }
  saveSettings(); renderTable(); renderColSettings();
}

// ---------------------------------------------------------------------------
// Add row / column (toolbar buttons)
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
  var btnAddRow = document.getElementById('btn-add-row');
  var btnAddCol = document.getElementById('btn-add-col');
  if (btnAddRow) btnAddRow.addEventListener('click', function() {
    if (headers.length === 0) {
      // No columns yet — create a first column then add a row
      var name = prompt('Column name:');
      if (!name) return;
      headers.push(name.trim() || 'Col 1');
      renderTable(); renderColSettings();
    }
    var row = new Array(headers.length).fill('');
    data.push(row);
    _applyFilters(false);
    page = totalPages - 1;
    renderBody();
    markDirty();
    var rows = elTbody.querySelectorAll('tr');
    if (rows.length) {
      var last = rows[rows.length - 1];
      var tds = last.querySelectorAll('td[data-col]');
      if (tds[0]) startEdit(tds[0], data.length - 1, 0);
    }
  });
  if (btnAddCol) btnAddCol.addEventListener('click', function() {
    var name = prompt('Column name:');
    if (!name) return;
    headers.push(name.trim() || ('Col ' + headers.length));
    data.forEach(function(r) { r.push(''); });
    renderTable(); renderColSettings(); markDirty();
  });
});

// ---------------------------------------------------------------------------
// Dirty state
// ---------------------------------------------------------------------------
function markDirty() {
  dirty = true;
  updateDirty();
}

function updateDirty() {
  elDirty.style.display = dirty ? '' : 'none';
  var btn = document.getElementById('btn-save');
  if (btn) btn.disabled = !dirty;
}

// ---------------------------------------------------------------------------
// Stats & pagination
// ---------------------------------------------------------------------------
function updateStats() {
  var vis = data.length - Object.keys(hiddenRows).length;
  var text = data.length + ' rows · ' + headers.length + ' cols';
  if (Object.keys(hiddenRows).length) text += ' (' + vis + ' visible)';
  if (_filteredIndices !== null) text += ' — ' + _filteredIndices.length + ' match filter';
  elStats.textContent = text;
  updatePageLabel();
}

function updatePageLabel() {
  elPageLbl.textContent = 'Page ' + (page+1) + ' / ' + totalPages;
  document.getElementById('btn-prev-page').disabled = page <= 0;
  document.getElementById('btn-next-page').disabled = page >= totalPages - 1;
}

// ---------------------------------------------------------------------------
// Toolbar wiring
// ---------------------------------------------------------------------------
function bindToolbar() {
  on('btn-prev-page', 'click', function() { if (page > 0) { page--; renderBody(); updatePageLabel(); }});
  on('btn-next-page', 'click', function() { if (page < totalPages-1) { page++; renderBody(); updatePageLabel(); }});

  on('btn-save', 'click', function() {
    if (!dirty) return;
    document.getElementById('te-save-comment').value = '';
    showModal('te-save-modal');
  });

  on('btn-export-csv', 'click', function() {
    window.location.href = cfg.urlExportCsv;
  });
  on('btn-export-xlsx', 'click', function() {
    window.location.href = cfg.urlExportXlsx;
  });

  on('btn-history', 'click', function() {
    closeAllPanels();
    openPanel('te-history-panel');
    loadHistory();
  });
  on('btn-history-close', 'click', function() { closePanel('te-history-panel'); });

  on('btn-settings', 'click', function() {
    closeAllPanels();
    openPanel('te-settings-panel');
    renderRowSettings();
  });
  on('btn-settings-close', 'click', function() { closePanel('te-settings-panel'); });

  on('btn-import', 'click', function() {
    document.getElementById('te-import-file').value = '';
    document.getElementById('te-import-preview').innerHTML = '';
    document.getElementById('te-import-comment').value = '';
    document.getElementById('btn-import-confirm').disabled = true;
    var warn = document.getElementById('te-import-warning');
    warn.style.display = currentVersion > 0 ? '' : 'none';
    showModal('te-import-modal');
  });
}

// ---------------------------------------------------------------------------
// Save modal
// ---------------------------------------------------------------------------
function bindModals() {
  on('btn-save-confirm', 'click', function() {
    var comment = document.getElementById('te-save-comment').value.trim();
    hideModal('te-save-modal');
    doSave(comment);
  });
  on('btn-save-cancel', 'click', function() { hideModal('te-save-modal'); });

  on('btn-import-cancel', 'click', function() { hideModal('te-import-modal'); });

  on('btn-restore', 'click', function() {
    if (!previewingVersion) return;
    var v = previewingVersion;
    if (!confirm('Restore version ' + v + '? This creates a new version with that content.')) return;
    fetch(cfg.urlVersionData.replace('{v}', v), {credentials:'same-origin'})
      .then(function(r){ return r.json(); })
      .then(function(d){
        closePanel('te-history-panel');
        doSaveCSV(d.csv, 'Restored from v' + v);
      });
  });

  // Import file picker
  var fileInput = document.getElementById('te-import-file');
  var delimSelect = document.getElementById('te-import-delimiter');

  var hasHeaderCb = document.getElementById('te-import-has-header');

  function refreshImportPreview() {
    if (!fileInput || !fileInput._csvText) return;
    var delim     = delimSelect  ? delimSelect.value  : ',';
    var hasHeader = hasHeaderCb  ? hasHeaderCb.checked : true;
    var rows = parseCSV(fileInput._csvText, delim);
    var preview = document.getElementById('te-import-preview');
    if (rows.length === 0) { preview.innerHTML = '<p class="te-hint">Empty file.</p>'; return; }

    var hdrs, body;
    if (hasHeader) {
      hdrs = rows[0];
      body = rows.slice(1, 6);
      var extra = rows.length - 6;
    } else {
      hdrs = rows[0].map(function(_, i) { return 'Col ' + (i + 1); });
      body = rows.slice(0, 5);
      var extra = rows.length - 5;
    }

    var t = '<table class="te-preview-table"><thead><tr>';
    hdrs.forEach(function(h) { t += '<th>' + esc(h) + '</th>'; });
    t += '</tr></thead><tbody>';
    body.forEach(function(r) {
      t += '<tr>';
      r.forEach(function(c) { t += '<td>' + esc(c) + '</td>'; });
      t += '</tr>';
    });
    if (extra > 0) t += '<tr><td colspan="' + hdrs.length + '" class="te-hint">…and ' + extra + ' more rows</td></tr>';
    t += '</tbody></table>';
    preview.innerHTML = t;
    document.getElementById('btn-import-confirm').disabled = false;
  }

  if (fileInput) fileInput.addEventListener('change', function() {
    var file = fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      fileInput._csvText = e.target.result;
      refreshImportPreview();
    };
    reader.readAsText(file, 'UTF-8');
  });

  if (delimSelect)  delimSelect.addEventListener('change',  refreshImportPreview);
  if (hasHeaderCb)  hasHeaderCb.addEventListener('change',  refreshImportPreview);

  on('btn-import-confirm', 'click', function() {
    var file = document.getElementById('te-import-file');
    if (!file || !file._csvText) return;
    var comment   = document.getElementById('te-import-comment').value.trim() || 'CSV import';
    var delim     = delimSelect ? delimSelect.value  : ',';
    var hasHeader = hasHeaderCb ? hasHeaderCb.checked : true;
    hideModal('te-import-modal');
    doImport(file._csvText, comment, delim, hasHeader);
  });
}

function doSave(comment) {
  if (activeInput) commitEdit();
  var csv = serializeCSV(headers, data);
  doSaveCSV(csv, comment);
}

function doSaveCSV(csv, comment) {
  fetch(cfg.urlSave, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {'Content-Type':'application/json', 'X-CSRFToken': cfg.csrfToken},
    body: JSON.stringify({csv: csv, comment: comment})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.ok) {
      currentVersion = d.version;
      dirty = false;
      updateDirty();
      setVersionBadge('v' + currentVersion, false);
      notify('Saved as version ' + currentVersion, 'success');
    } else { notify(d.error || 'Save failed', 'error'); }
  })
  .catch(function(){ notify('Save failed', 'error'); });
}

function doImport(csvText, comment, delim, hasHeader) {
  var fd = new FormData();
  fd.append('file', new Blob([csvText], {type:'text/csv'}), 'import.csv');
  fd.append('comment', comment);
  fd.append('force', 'true');
  fd.append('delimiter', delim || ',');
  fd.append('has_header', hasHeader ? '1' : '0');

  fetch(cfg.urlImport, {
    method: 'POST', credentials: 'same-origin',
    headers: {'X-CSRFToken': cfg.csrfToken},
    body: fd
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.ok) {
      currentVersion = d.version;
      setVersionBadge('v' + currentVersion, false);
      notify('Imported as version ' + currentVersion, 'success');
      loadData();
    } else { notify(d.error || 'Import failed', 'error'); }
  })
  .catch(function(){ notify('Import failed', 'error'); });
}

// ---------------------------------------------------------------------------
// History panel
// ---------------------------------------------------------------------------
function loadHistory() {
  var body = document.getElementById('te-history-body');
  body.innerHTML = '<div class="te-panel-loading">Loading…</div>';
  document.getElementById('te-history-footer').style.display = 'none';
  document.getElementById('btn-restore').style.display = 'none';

  fetch(cfg.urlVersions, {credentials:'same-origin'})
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.versions || d.versions.length === 0) {
        body.innerHTML = '<p class="te-hint">No versions yet.</p>';
        return;
      }
      var html = '';
      d.versions.forEach(function(v) {
        html += '<div class="te-version-item' + (v.is_current ? ' te-version-current' : '') + '" data-v="' + v.version + '">'
          + '<div class="te-version-num">v' + v.version + (v.is_current ? ' <span class="te-badge">current</span>' : '') + '</div>'
          + '<div class="te-version-meta">' + esc(v.created_at) + ' — ' + esc(v.created_by) + '</div>'
          + (v.comment ? '<div class="te-version-comment">' + esc(v.comment) + '</div>' : '')
          + '<div class="te-version-dims">' + v.row_count + ' rows × ' + v.col_count + ' cols</div>'
          + '</div>';
      });
      body.innerHTML = html;

      body.querySelectorAll('.te-version-item').forEach(function(el) {
        el.addEventListener('click', function() {
          body.querySelectorAll('.te-version-item').forEach(function(x){ x.classList.remove('te-version-selected'); });
          el.classList.add('te-version-selected');
          var v = parseInt(el.dataset.v);
          previewVersion(v);
        });
      });
    });
}

function previewVersion(v) {
  var footer = document.getElementById('te-history-footer');
  var lbl = document.getElementById('te-preview-label');
  footer.style.display = '';
  lbl.textContent = 'Loading v' + v + '…';

  fetch(cfg.urlVersionData.replace('{v}', v), {credentials:'same-origin'})
    .then(function(r){ return r.json(); })
    .then(function(d){
      lbl.textContent = 'Previewing v' + v;
      previewingVersion = v;
      loadCSV(d.csv || '');
      setVersionBadge('v' + v + ' (read-only)', true);
      setEnableWrite(false);

      var restoreBtn = document.getElementById('btn-restore');
      // Only show restore if not already current
      restoreBtn.style.display = (v !== currentVersion) ? '' : 'none';
    });
}

function setEnableWrite(yes) {
  var btns = ['btn-save', 'btn-add-row', 'btn-add-col'];
  btns.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.disabled = !yes || !dirty;
  });
  if (yes) { updateDirty(); }
}

// ---------------------------------------------------------------------------
// Column settings panel
// ---------------------------------------------------------------------------
function renderColSettings() {
  var el = document.getElementById('te-col-list');
  if (!el) return;
  var html = '';
  headers.forEach(function(h, ci) {
    html += '<label class="te-col-check">'
      + '<input type="checkbox" data-ci="' + ci + '"' + (hiddenCols[ci] ? '' : ' checked') + '>'
      + ' ' + esc(h || ('Col ' + (ci+1)))
      + '</label>';
  });
  el.innerHTML = html;
  el.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var ci = parseInt(cb.dataset.ci);
      if (cb.checked) { delete hiddenCols[ci]; }
      else { hiddenCols[ci] = true; }
      saveSettings();
      renderTable();
    });
  });
}

function renderRowSettings() {
  var section = document.getElementById('te-hidden-rows-section');
  var el = document.getElementById('te-row-list');
  if (!el || !section) return;
  var hiddenKeys = Object.keys(hiddenRows).map(Number).filter(function(k) { return hiddenRows[k]; });
  hiddenKeys.sort(function(a, b) { return a - b; });
  section.style.display = hiddenKeys.length ? '' : 'none';
  if (!hiddenKeys.length) { el.innerHTML = ''; return; }
  var html = '';
  hiddenKeys.forEach(function(ri) {
    var preview = (data[ri] || []).slice(0, 3).join(', ').substring(0, 40);
    html += '<div class="te-row-hidden-item" data-ri="' + ri + '">'
      + '<span class="te-row-hidden-num">Row ' + (ri + 1) + '</span>'
      + '<span class="te-row-hidden-preview">' + esc(preview) + '</span>'
      + '<button class="te-row-show-btn" data-ri="' + ri + '" title="Show row"><i class="fa fa-eye"></i></button>'
      + '</div>';
  });
  el.innerHTML = html;
  el.querySelectorAll('.te-row-show-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      toggleHideRow(parseInt(btn.dataset.ri));
      renderRowSettings();
    });
  });
  var showAll = document.getElementById('btn-show-all-rows');
  if (showAll) {
    showAll.onclick = function() {
      hiddenKeys.forEach(function(ri) { delete hiddenRows[ri]; });
      saveSettings();
      renderBody();
      updateStats();
      renderRowSettings();
    };
  }
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------
function loadSettings(cb) {
  fetch(cfg.urlSettings, {credentials:'same-origin'})
    .then(function(r){ return r.json(); })
    .then(function(d){
      colWidths   = d.col_widths    || {};
      hiddenCols  = d.hidden_cols   || {};
      hiddenRows  = d.hidden_rows   || {};
      if (cb) cb();
    })
    .catch(function(){ if (cb) cb(); });
}

var saveSettingsTimer = null;
function saveSettings() {
  clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(function() {
    fetch(cfg.urlSettings, {
      method: 'PUT', credentials: 'same-origin',
      headers: {'Content-Type':'application/json', 'X-CSRFToken': cfg.csrfToken},
      body: JSON.stringify({col_widths: colWidths, hidden_cols: hiddenCols, hidden_rows: hiddenRows})
    });
  }, 600);
}

// ---------------------------------------------------------------------------
// Panel helpers
// ---------------------------------------------------------------------------
function openPanel(id)  { document.getElementById(id).classList.add('te-panel-open'); }
function closePanel(id) { document.getElementById(id).classList.remove('te-panel-open'); }
function closeAllPanels() {
  document.querySelectorAll('.te-panel').forEach(function(p){ p.classList.remove('te-panel-open'); });
}

function showModal(id)  { document.getElementById(id).style.display = 'flex'; }
function hideModal(id)  { document.getElementById(id).style.display = 'none'; }

// Close modals on backdrop click
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.te-modal-bg').forEach(function(bg) {
    bg.addEventListener('click', function(e) { if (e.target === bg) bg.style.display = 'none'; });
  });
});

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function showLoading(yes) {
  elLoading.style.display = yes ? '' : 'none';
  elTable.style.display   = yes ? 'none' : '';
}

function setVersionBadge(text, preview) {
  elVerBadge.textContent = text;
  elVerBadge.className = 'te-version-badge' + (preview ? ' te-version-preview' : '');
}

function showError(msg) { notify(msg, 'error'); }

function notify(msg, type) {
  if (window.jQuery && window.$.notify) {
    $.notify(msg, type);
  } else {
    var el = document.createElement('div');
    el.className = 'te-toast te-toast-' + (type || 'info');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 3500);
  }
}

function on(id, evt, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------------------------------------------------------------------------
// Reference picker
// ---------------------------------------------------------------------------
var _refPickerRi = -1, _refPickerCi = -1;
var _refSetsCache = null;
var _refImagesCache = {};

function openRefPicker(ri, ci) {
  _refPickerRi = ri; _refPickerCi = ci;
  document.getElementById('te-ref-search').value = '';
  showModal('te-ref-modal');
  var treeEl = document.getElementById('te-ref-tree');
  if (!_refSetsCache) {
    treeEl.innerHTML = '<div class="te-ref-msg"><i class="fa fa-spinner fa-spin"></i> Loading…</div>';
    fetch(cfg.urlRefSets, { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(d) { _refSetsCache = d.results; renderRefTree(''); })
      .catch(function() { treeEl.innerHTML = '<div class="te-ref-msg te-hint">Failed to load imagesets.</div>'; });
  } else {
    renderRefTree('');
  }
}

function renderRefTree(query) {
  var treeEl = document.getElementById('te-ref-tree');
  var sets = _refSetsCache || [];
  var q = query.toLowerCase();
  treeEl.innerHTML = '';
  var lastTeam = null;
  var shown = 0;
  sets.forEach(function(set) {
    var nameMatch = set.name.toLowerCase().indexOf(q) >= 0;
    var teamMatch = set.team && set.team.toLowerCase().indexOf(q) >= 0;
    if (q && !nameMatch && !teamMatch) return;
    if (set.team !== lastTeam) {
      var hdr = document.createElement('div');
      hdr.className = 'te-ref-team-hdr';
      hdr.textContent = set.team || 'No team';
      treeEl.appendChild(hdr);
      lastTeam = set.team;
    }
    treeEl.appendChild(makeImagesetNode(set));
    shown++;
  });
  if (!shown) treeEl.innerHTML = '<div class="te-ref-msg te-hint">No matches.</div>';
}

function makeImagesetNode(set) {
  var node = document.createElement('div');
  node.className = 'te-ref-node';

  var row = document.createElement('div');
  row.className = 'te-ref-row';

  var expBtn = document.createElement('button');
  expBtn.className = 'te-ref-expand';
  expBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';

  var icon = document.createElement('i');
  icon.className = 'fa fa-folder-o te-ref-folder-icon';

  var nameEl = document.createElement('span');
  nameEl.className = 'te-ref-item-name';
  nameEl.textContent = set.name;

  var insBtn = document.createElement('button');
  insBtn.className = 'te-ref-ins-btn';
  insBtn.title = 'Insert image set reference';
  insBtn.innerHTML = '<i class="fa fa-link"></i>';

  row.appendChild(expBtn);
  row.appendChild(icon);
  row.appendChild(nameEl);
  row.appendChild(insBtn);
  node.appendChild(row);

  var children = document.createElement('div');
  children.className = 'te-ref-children';
  node.appendChild(children);

  var expanded = false;
  function toggle() {
    expanded = !expanded;
    expBtn.innerHTML = '<i class="fa fa-chevron-' + (expanded ? 'down' : 'right') + '"></i>';
    children.style.display = expanded ? 'block' : 'none';
    if (expanded && !children._loaded) { children._loaded = true; loadRefImages(set.id, children); }
  }
  expBtn.addEventListener('click', toggle);
  icon.addEventListener('click', toggle);

  var setPath = window.location.origin + '/images/imageset/' + set.id + '/';
  nameEl.addEventListener('click', function() { insertRefValue(setPath, 'imageset', set.name); });
  insBtn.addEventListener('click', function() { insertRefValue(setPath, 'imageset', set.name); });
  return node;
}

function loadRefImages(imagesetId, container) {
  if (_refImagesCache[imagesetId]) { renderRefImages(_refImagesCache[imagesetId], container); return; }
  container.innerHTML = '<div class="te-ref-msg te-hint"><i class="fa fa-spinner fa-spin"></i></div>';
  var url = cfg.urlRefImages.replace('{id}', imagesetId);
  fetch(url, { credentials: 'same-origin' })
    .then(function(r) { return r.json(); })
    .then(function(d) { _refImagesCache[imagesetId] = d.results; renderRefImages(d.results, container); })
    .catch(function() { container.innerHTML = '<div class="te-ref-msg te-hint">Failed to load.</div>'; });
}

function renderRefImages(images, container) {
  container.innerHTML = '';
  if (!images || !images.length) {
    container.innerHTML = '<div class="te-ref-msg te-hint" style="padding-left:32px;">No images.</div>';
    return;
  }
  var q = (document.getElementById('te-ref-search').value || '').toLowerCase();
  var shown = 0;
  images.forEach(function(img) {
    if (q && img.name.toLowerCase().indexOf(q) < 0) return;
    var row = document.createElement('div');
    row.className = 'te-ref-row te-ref-image-row';

    var icon = document.createElement('i');
    icon.className = 'fa fa-file-image-o te-ref-img-icon';

    var nameEl = document.createElement('span');
    nameEl.className = 'te-ref-item-name';
    nameEl.textContent = img.name;

    var insBtn = document.createElement('button');
    insBtn.className = 'te-ref-ins-btn';
    insBtn.title = 'Insert image reference';
    insBtn.innerHTML = '<i class="fa fa-link"></i>';

    row.appendChild(icon);
    row.appendChild(nameEl);
    row.appendChild(insBtn);
    container.appendChild(row);

    var imgPath = window.location.origin + '/annotations/' + img.id + '/';
    nameEl.addEventListener('click', function() { insertRefValue(imgPath, 'image', img.name); });
    insBtn.addEventListener('click', function() { insertRefValue(imgPath, 'image', img.name); });
    shown++;
  });
  if (!shown) container.innerHTML = '<div class="te-ref-msg te-hint" style="padding-left:32px;">No matches.</div>';
}

function insertRefValue(path, type, name) {
  hideModal('te-ref-modal');
  if (_refPickerRi < 0) return;
  var ri = _refPickerRi, ci = _refPickerCi;
  _refPickerRi = -1; _refPickerCi = -1;
  if (!data[ri]) return;
  data[ri][ci] = path;
  _refCache[path] = { type: type, name: name, detail: '' };
  // Re-render the affected cell if it's visible on the current page
  var td = elTbody.querySelector('td[data-row="' + ri + '"][data-col="' + ci + '"]');
  if (td) {
    var cell = td.querySelector('.te-cell-inner');
    if (cell) {
      var refMatch = isExactRef(path);
      if (refMatch) renderRefChip(cell, path, refMatch);
    }
    td.title = '';
  }
  markDirty();
}

// Ref search box
window.addEventListener('DOMContentLoaded', function() {
  var refSearch = document.getElementById('te-ref-search');
  if (refSearch) {
    var _refSearchTimer = null;
    refSearch.addEventListener('input', function() {
      clearTimeout(_refSearchTimer);
      _refSearchTimer = setTimeout(function() { renderRefTree(refSearch.value.trim()); }, 200);
    });
  }
  on('btn-ref-cancel', 'click', function() { hideModal('te-ref-modal'); });
});

})();
