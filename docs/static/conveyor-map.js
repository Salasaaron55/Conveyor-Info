// SAT4 Conveyor Map
// Renders conveyors from conveyors-map.json using x/y/w/h pixel coords.

let rows = [];
let selectedId = null;
let zoom = 1;
let partsCatalog = {};
let conveyorParts = {};
let partsOpen = false;
let partsSortCol = null;
let partsSortDir = 1;
let mapEditMode = false;
let unmappedConveyors = [];
let conveyorNodeDrag = null;
let conveyorResizeDrag = null;

const MAP_W = 8580;
const MAP_H = 1525;
const MINI_W = 259;
const MINI_H = 102;

const CONVEYOR_TYPES = {
  ground_level: { bg: '#374151', border: '#9ca3af', text: '#f9fafb', label: 'Ground Level' },
  elevated:     { bg: '#7c2d12', border: '#fb923c', text: '#ffedd5', label: 'Elevated'     },
  incline:      { bg: '#14532d', border: '#4ade80', text: '#dcfce7', label: 'Incline'      },
  decline:      { bg: '#1e3a5f', border: '#60a5fa', text: '#dbeafe', label: 'Decline'      },
  flex:         { bg: '#7f1d1d', border: '#f87171', text: '#fee2e2', label: 'Flex'         },
  dock_door:    { bg: '#4a1d96', border: '#c084fc', text: '#f3e8ff', label: 'Dock Door'    },
};
const UNASSIGNED = { bg: '#374151', border: '#4b5563', text: '#f9fafb', label: 'Unassigned' };

const DEFAULT_TYPE_COLORS = Object.fromEntries(
  Object.entries(CONVEYOR_TYPES).map(([k, v]) => [k, { bg: v.bg, border: v.border, text: v.text }])
);

function getTypeColor(r) {
  if (!r || r.blank) return null;
  return CONVEYOR_TYPES[r.conveyor_type] || UNASSIGNED;
}

const els = {
  search:             document.getElementById('search'),
  matchHint:          document.getElementById('matchHint'),
  copyAllBtn:         document.getElementById('copyAllBtn'),
  centerBtn:          document.getElementById('centerBtn'),
  zoomOutBtn:         document.getElementById('zoomOutBtn'),
  zoomResetBtn:       document.getElementById('zoomResetBtn'),
  zoomInBtn:          document.getElementById('zoomInBtn'),
  viewport:           document.getElementById('viewport'),
  mapSizer:           document.getElementById('mapSizer'),
  map:                document.getElementById('map'),
  count:              document.getElementById('count'),
  toast:              document.getElementById('toast'),
  minimap:            document.getElementById('minimap'),
  minimapHeader:      document.getElementById('minimapHeader'),
  minimapToggle:      document.getElementById('minimapToggle'),
  minimapCanvas:      document.getElementById('minimapCanvas'),
  legend:             document.getElementById('legend'),
  legendHeader:       document.getElementById('legendHeader'),
  legendToggle:       document.getElementById('legendToggle'),
  legendBody:         document.getElementById('legendBody'),
  noteTextarea:       document.getElementById('noteTextarea'),
  notesConveyorLabel: document.getElementById('notesConveyorLabel'),
  notesSavedHint:     document.getElementById('notesSavedHint'),
  saveNoteBtn:        document.getElementById('saveNoteBtn'),
  exportNotesBtn:     document.getElementById('exportNotesBtn'),
  importNotesInput:   document.getElementById('importNotesInput'),
  themeSelect:        document.getElementById('themeSelect'),
  colorSettings:      document.getElementById('colorSettings'),
  showLegendChk:      document.getElementById('showLegendChk'),
  showMinimapChk:     document.getElementById('showMinimapChk'),
  showGridChk:        document.getElementById('showGridChk'),
  resetSettingsBtn:   document.getElementById('resetSettingsBtn'),
  partsTab:           document.getElementById('partsTab'),
  partsTabArrow:      document.getElementById('partsTabArrow'),
  partsDrawer:        document.getElementById('partsDrawer'),
  partsDrawerTitle:   document.getElementById('partsDrawerTitle'),
  partsTableBody:     document.getElementById('partsTableBody'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function idOf(r)    { return String(r?.section_alias ?? '').trim(); }
function shortOf(r) { const s = String(r?.shortened_alias ?? '').trim(); return s || idOf(r); }

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function sortIds(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => els.toast.classList.remove('show'), 1200);
}

async function copyText(text) {
  const t = String(text ?? '');
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove(); return true;
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY  = 'conveyor-map-state';
const NOTES_KEY    = 'conveyor-notes';
const SETTINGS_KEY = 'conveyor-map-settings';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scrollLeft: els.viewport.scrollLeft,
      scrollTop:  els.viewport.scrollTop,
      zoom,
      legendPos:       els.legend  ? { left: els.legend.style.left,  top: els.legend.style.top  } : null,
      minimapPos:      els.minimap ? { left: els.minimap.style.left, top: els.minimap.style.top } : null,
      legendMinimized,
      minimapMinimized,
    }));
  } catch {}
}

function loadSavedState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

function setZoom(newZoom, keepCenter = true) {
  const z = Math.max(0.5, Math.min(2.5, newZoom));
  if (z === zoom) return;

  const vp = els.viewport;
  const cx = vp.scrollLeft + vp.clientWidth  / 2;
  const cy = vp.scrollTop  + vp.clientHeight / 2;
  const rx = cx / zoom, ry = cy / zoom;

  zoom = z;
  els.map.style.transform = `scale(${zoom})`;
  els.mapSizer.style.width  = (MAP_W * zoom) + 'px';
  els.mapSizer.style.height = (MAP_H * zoom) + 'px';
  els.zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;

  if (keepCenter) {
    vp.scrollLeft = rx * zoom - vp.clientWidth  / 2;
    vp.scrollTop  = ry * zoom - vp.clientHeight / 2;
  }
  drawMinimap();
  saveState();
}

// ── Map geometry ──────────────────────────────────────────────────────────────

function getPathPoints(r) {
  const pts = [];
  if (Array.isArray(r?.points)) {
    for (const p of r.points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = numOrNull(p[0]), y = numOrNull(p[1]);
      if (x === null || y === null) continue;
      pts.push({ x, y });
    }
  } else if (Array.isArray(r?.path)) {
    for (const p of r.path) {
      const x = numOrNull(p?.x), y = numOrNull(p?.y);
      if (x === null || y === null) continue;
      pts.push({ x, y });
    }
  }
  return pts.length >= 2 ? pts : null;
}

function thicknessOf(r) {
  const t = numOrNull(r?.thickness);
  if (t !== null && t > 0) return t;
  const h = numOrNull(r?.h);
  if (h !== null && h > 0) return h;
  return 18;
}

function getBounds(r) {
  const pts = getPathPoints(r);
  if (pts) {
    const t = thicknessOf(r);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: (maxX - minX) + t, h: (maxY - minY) + t };
  }
  const x = numOrNull(r.x), y = numOrNull(r.y), w = numOrNull(r.w), h = numOrNull(r.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function buildSegments(r) {
  const pts = getPathPoints(r);
  if (!pts) return null;
  const t = thicknessOf(r);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx !== 0 && dy !== 0) continue;
    if (dx === 0 && dy === 0) continue;
    if (dx !== 0) {
      segs.push({ x: Math.min(a.x, b.x), y: a.y, w: Math.abs(dx), h: t });
    } else {
      segs.push({ x: a.x, y: Math.min(a.y, b.y), w: t, h: Math.abs(dy) });
    }
  }
  return segs.length ? segs : null;
}

// ── Render ────────────────────────────────────────────────────────────────────

function applyNodeColor(node, r) {
  const tc = getTypeColor(r);
  if (!tc) return;
  node.style.background  = tc.bg;
  node.style.borderColor = tc.border;
  node.style.color       = tc.text;
}

function makeNode(isBlank, id, r, seg) {
  const node = document.createElement('div');
  node.className = isBlank ? 'node blank' : 'node';
  if (!isBlank) { node.dataset.id = id; applyNodeColor(node, r); }
  node.style.left   = `${seg.x}px`;
  node.style.top    = `${seg.y}px`;
  node.style.width  = `${seg.w}px`;
  node.style.height = `${seg.h}px`;
  return node;
}

function render() {
  [...els.map.querySelectorAll('.node')].forEach(n => n.remove());

  const drawable = rows.filter(r => getBounds(r) !== null);
  els.count.textContent = String(drawable.filter(r => !r.blank).length);

  for (const r of drawable) {
    const isBlank = r.blank === true;
    const id = isBlank ? null : idOf(r);
    if (!isBlank && !id) continue;

    const segs = buildSegments(r);
    if (segs) {
      segs.forEach((seg, i) => {
        const node = makeNode(isBlank, id, r, seg);
        if (!isBlank) {
          node.dataset.segment = String(i);
          if (i === 0) node.innerHTML = `<span class="label">${escapeHtml(id)}</span>`;
          node.addEventListener('click', () => select(id, { center: false }));
          node.addEventListener('dblclick', () => { select(id, { center: false }); if (!partsOpen) togglePartsPanel(); });
        } else {
          node.setAttribute('aria-hidden', 'true');
        }
        els.map.appendChild(node);
      });
      continue;
    }

    const b = getBounds(r);
    const node = makeNode(isBlank, id, r, b);
    if (!isBlank) {
      node.innerHTML = `<span class="label">${escapeHtml(id)}</span>`;
      node.addEventListener('click', () => select(id, { center: false }));
      node.addEventListener('dblclick', () => { select(id, { center: false }); if (!partsOpen) togglePartsPanel(); });
    } else {
      node.setAttribute('aria-hidden', 'true');
    }
    els.map.appendChild(node);
  }

  highlightSelected();
}

function highlightSelected() {
  for (const n of els.map.querySelectorAll('.node'))
    n.classList.toggle('selected', n.dataset.id === selectedId);
}

// ── Selection & info panel ────────────────────────────────────────────────────

function fillCells(r) {
  for (const c of document.querySelectorAll('[data-field]')) {
    const key = c.getAttribute('data-field');
    let v = r ? (r[key] ?? '') : '';
    if (key === 'shortened_alias' && (!v || String(v).trim() === '')) v = r ? idOf(r) : '';
    c.textContent = String(v ?? '');
    c.tabIndex = 0;
  }
}

function getRow(id) { return rows.find(r => idOf(r) === id) || null; }

function select(id, { center = true } = {}) {
  selectedId = id;
  fillCells(getRow(id));
  highlightSelected();
  if (center) centerOnSelected();
  drawMinimap();
  updateNotesPanel();
  if (partsOpen) updatePartsPanel();
  if (mapEditMode) { updateResizeOverlay(); renderMapEditPanel(); }
}

function updatePartsPanel() {
  if (!els.partsDrawerTitle || !els.partsTableBody) return;
  if (!selectedId) {
    els.partsDrawerTitle.textContent = 'Parts — select a conveyor';
    els.partsTableBody.innerHTML = '<tr><td colspan="8" class="partsEmpty">Select a conveyor on the map to view its parts.</td></tr>';
    return;
  }
  const r = getRow(selectedId);
  els.partsDrawerTitle.textContent = `Parts — ${r ? shortOf(r) : selectedId}`;
  const EAM_BASE = 'https://us1.eam.hxgnsmartcloud.com/web/base/logindisp?tenant=AMAZONRMENA_PRD&SYSTEM_FUNCTION_NAME=SSPART&USER_FUNCTION_NAME=SSPART&DRILLBACK=YES&partcode=';
  const entries = conveyorParts[selectedId] || [];
  if (!entries.length) {
    els.partsTableBody.innerHTML = '<tr><td colspan="8" class="partsEmpty">No parts listed for this conveyor.</td></tr>';
    return;
  }

  // Update header sort indicators
  const ths = els.partsTableBody.closest('table').querySelectorAll('thead th[data-sort]');
  ths.forEach(th => {
    th.classList.toggle('sort-asc', th.dataset.sort === partsSortCol && partsSortDir === 1);
    th.classList.toggle('sort-desc', th.dataset.sort === partsSortCol && partsSortDir === -1);
  });

  // Build row objects for sorting
  let rows = entries.map(entry => {
    const apn = typeof entry === 'object' ? entry.part : entry;
    const qty = typeof entry === 'object' ? entry.qty : '';
    const p = partsCatalog[apn] || {};
    return { apn, qty, bin: p.bin ?? '', description: p.description ?? '', part_class: p.part_class ?? '', supplier: p.supplier ?? '', supplier_part_number: p.supplier_part_number ?? '', image: p.image ?? '' };
  });

  if (partsSortCol) {
    rows.sort((a, b) => {
      const av = a[partsSortCol];
      const bv = b[partsSortCol];
      const an = parseFloat(av), bn = parseFloat(bv);
      const cmp = (!isNaN(an) && !isNaN(bn))
        ? an - bn
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return cmp * partsSortDir;
    });
  }

  const PARTS_IMG_BASE = './static/parts-thumbnails/';
  els.partsTableBody.innerHTML = rows.map(({ apn, qty, bin, description, part_class, supplier, supplier_part_number, image }) => {
    const apnLink = apn
      ? `<a class="partsApnLink" href="${EAM_BASE}${encodeURIComponent(apn)}" target="_blank" rel="noopener" title="Open in EAM">↗</a>`
      : '';
    const imgSrc = image ? PARTS_IMG_BASE + escapeHtml(image) : PARTS_IMG_BASE + 'placeholder.svg';
    const imgCell = `<td class="partsImgCell"><img class="partsThumb${image ? '' : ' partsThumbPlaceholder'}" src="${imgSrc}" alt="" data-apn="${escapeHtml(apn)}" data-desc="${escapeHtml(description)}" data-img="${escapeHtml(image)}" /></td>`;
    return `<tr>
      ${imgCell}
      <td class="partsApnCell"><span>${escapeHtml(apn)}${apnLink}</span></td>
      <td class="partsQtyCell">${escapeHtml(String(qty ?? ''))}</td>
      <td>${escapeHtml(bin)}</td>
      <td>${escapeHtml(description)}</td>
      <td>${escapeHtml(part_class)}</td>
      <td>${escapeHtml(supplier)}</td>
      <td>${escapeHtml(supplier_part_number)}</td>
    </tr>`;
  }).join('');
}

function initPartsLightbox() {
  const lb = document.getElementById('partsLightbox');
  const lbImg = document.getElementById('partsLightboxImg');
  const lbCaption = document.getElementById('partsLightboxCaption');
  const lbClose = document.getElementById('partsLightboxClose');
  if (!lb) return;

  function openLightbox(src, alt, caption) {
    lbImg.src = src;
    lbImg.alt = alt;
    lbCaption.textContent = caption;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lb.hidden = true;
    document.body.style.overflow = '';
    lbImg.src = '';
  }

  lb.addEventListener('click', e => {
    if (e.target === lb || e.target.classList.contains('partsLightboxBackdrop')) closeLightbox();
  });
  lbClose.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLightbox(); });

  document.addEventListener('click', e => {
    const thumb = e.target.closest('.partsThumb');
    if (!thumb || thumb.classList.contains('partsThumbPlaceholder')) return;
    openLightbox(thumb.src, thumb.alt, `${thumb.dataset.apn} — ${thumb.dataset.desc}`);
  });
}

function initPartsSorting() {
  const thead = document.querySelector('.partsTable thead');
  if (!thead) return;
  thead.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    if (partsSortCol === col) {
      partsSortDir *= -1;
    } else {
      partsSortCol = col;
      partsSortDir = 1;
    }
    updatePartsPanel();
  });
}

function togglePartsPanel() {
  partsOpen = !partsOpen;
  els.partsDrawer.classList.toggle('open', partsOpen);
  els.partsTab.classList.toggle('open', partsOpen);
  if (partsOpen) updatePartsPanel();
}

if (els.partsTab) els.partsTab.addEventListener('click', togglePartsPanel);

function centerOnSelected() {
  const r = getRow(selectedId);
  if (!r) return;
  const b = getBounds(r);
  if (!b) return;
  const vp = els.viewport;
  vp.scrollLeft = (b.x + b.w / 2) * zoom - vp.clientWidth  / 2;
  vp.scrollTop  = (b.y + b.h / 2) * zoom - vp.clientHeight / 2;
}

// ── Search ────────────────────────────────────────────────────────────────────

function normalize(str) { return String(str ?? '').trim().toLowerCase(); }

function searchMatches(q) {
  const needle = normalize(q);
  if (!needle) return [];
  const hits = [];
  for (const r of rows) {
    const id = idOf(r);
    if (!id) continue;
    const hay = `${normalize(shortOf(r))} ${normalize(id)} ${normalize(r.amazon_alias ?? '')}`;
    if (hay.includes(needle)) hits.push(id);
  }
  return hits.sort(sortIds);
}

function setMatchHint(q) {
  if (!q) { els.matchHint.textContent = ''; return; }
  const hits = searchMatches(q);
  els.matchHint.textContent = hits.length ? `Matches: ${hits.length}  (Enter to select)` : 'No matches';
}

function applyDim(hits) {
  const active = new Set(hits);
  for (const node of els.map.querySelectorAll('.node:not(.blank)'))
    node.classList.toggle('dimmed', active.size > 0 && !active.has(node.dataset.id));
}

// ── Copy cells ────────────────────────────────────────────────────────────────

function wireCopyCells() {
  for (const td of document.querySelectorAll('.copyCell')) {
    td.addEventListener('click', async () => {
      // In edit mode the value lives in a child [data-field] span; fall back to td itself
      const valueEl = td.querySelector('[data-field]') || td;
      const value = valueEl.textContent.trim();
      if (!value) { showToast('Nothing to copy'); return; }
      if (await copyText(value)) {
        const thEl = td.parentElement?.querySelector('th');
        // Use .rowLabel span (edit mode) or full th text (normal mode)
        const label = (thEl?.querySelector('.rowLabel') ?? thEl)?.textContent?.trim() || 'Copied';
        showToast(`Copied ${label}`);
      }
    });
    td.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); td.click(); }
    });
  }
}

function buildCopyAllText() {
  return [...document.querySelectorAll('.infoTable tr')]
    .map(tr => {
      const th = tr.querySelector('th');
      const td = tr.querySelector('[data-field]');
      return (th && td) ? `${th.textContent.trim()}:\t${td.textContent.trim()}` : null;
    })
    .filter(Boolean).join('\n');
}

// ── Minimap ───────────────────────────────────────────────────────────────────

let minimapMinimized = false;
let legendMinimized  = false;

function drawMinimap() {
  if (!els.minimapCanvas || minimapMinimized || els.minimap?.hidden) return;
  const ctx = els.minimapCanvas.getContext('2d');
  ctx.clearRect(0, 0, MINI_W, MINI_H);

  const sx = MINI_W / MAP_W, sy = MINI_H / MAP_H;

  for (const r of rows) {
    const b = getBounds(r);
    if (!b) continue;
    const isSelected = !r.blank && idOf(r) === selectedId;
    const tc = getTypeColor(r);
    ctx.fillStyle = r.blank ? '#2a3a4a' : (isSelected ? '#facc15' : (tc?.bg || UNASSIGNED.bg));
    ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  }

  const vp = els.viewport;
  const vx = (vp.scrollLeft / zoom) * sx, vy = (vp.scrollTop  / zoom) * sy;
  const vw = (vp.clientWidth  / zoom) * sx, vh = (vp.clientHeight / zoom) * sy;
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(Math.max(0, vx), Math.max(0, vy),
    Math.min(MINI_W - Math.max(0, vx), vw), Math.min(MINI_H - Math.max(0, vy), vh));
}

// ── Legend ────────────────────────────────────────────────────────────────────

function buildLegend() {
  els.legendBody.innerHTML = '';
  for (const [, tc] of Object.entries(CONVEYOR_TYPES)) {
    const item = document.createElement('div');
    item.className = 'legendItem';
    item.innerHTML =
      `<span class="legendSwatch" style="background:${tc.bg};border-color:${tc.border}"></span>` +
      `<span class="legendLabel">${escapeHtml(tc.label)}</span>`;
    els.legendBody.appendChild(item);
  }
}

// ── Draggable float panels ────────────────────────────────────────────────────

let panelDragState = null;

function makeDraggable(el, handle) {
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.floatPanelToggle')) return;
    const rect = el.getBoundingClientRect();
    el.style.left   = rect.left + 'px';
    el.style.top    = rect.top  + 'px';
    el.style.right  = 'auto';
    el.style.bottom = 'auto';
    panelDragState = { el, startX: e.clientX, startY: e.clientY,
      origLeft: rect.left, origTop: rect.top };
    e.preventDefault();
    e.stopPropagation();
  });
}

function getSidebarWidth() {
  return document.querySelector('.sidebar')?.offsetWidth ?? 340;
}

function clampPanel(el, left, top) {
  const minLeft = getSidebarWidth();
  const maxLeft = window.innerWidth  - el.offsetWidth;
  const maxTop  = window.innerHeight - el.offsetHeight;
  el.style.left = Math.max(minLeft, Math.min(maxLeft, left)) + 'px';
  el.style.top  = Math.max(0, Math.min(maxTop,  top))  + 'px';
}

function initPanelPositions() {
  if (!els.legend || !els.minimap) return;
  const saved = loadSavedState();
  const gap = 16, topBarH = 720;
  const sidebarW = getSidebarWidth();

  if (saved?.legendPos?.left) {
    const l = parseFloat(saved.legendPos.left), t = parseFloat(saved.legendPos.top);
    const maxL = window.innerWidth  - els.legend.offsetWidth;
    const maxT = window.innerHeight - els.legend.offsetHeight;
    Object.assign(els.legend.style, {
      left: Math.max(sidebarW, Math.min(maxL, l)) + 'px',
      top:  Math.max(0, Math.min(maxT, t)) + 'px',
      right: 'auto', bottom: 'auto',
    });
  } else {
    Object.assign(els.legend.style, { left: (sidebarW + gap) + 'px', top: (topBarH + gap) + 'px', right: 'auto', bottom: 'auto' });
  }

  if (saved?.minimapPos?.left) {
    const l = parseFloat(saved.minimapPos.left), t = parseFloat(saved.minimapPos.top);
    const maxL = window.innerWidth  - MINI_W, maxT = window.innerHeight - MINI_H - 32;
    Object.assign(els.minimap.style, {
      left: Math.max(sidebarW, Math.min(maxL, l)) + 'px',
      top:  Math.max(0, Math.min(maxT, t)) + 'px',
      right: 'auto', bottom: 'auto',
    });
  } else {
    Object.assign(els.minimap.style, {
      left:  Math.max(sidebarW + gap, window.innerWidth  - MINI_W - gap) + 'px',
      top:   Math.max(0,              window.innerHeight - MINI_H - 32 - gap) + 'px',
      right: 'auto', bottom: 'auto',
    });
  }

  if (saved?.legendMinimized) {
    legendMinimized = true;
    els.legend.classList.add('minimized');
    if (els.legendToggle) { els.legendToggle.textContent = '+'; els.legendToggle.title = 'Expand'; }
  }

  if (saved?.minimapMinimized) {
    minimapMinimized = true;
    els.minimap.classList.add('minimized');
    if (els.minimapToggle) { els.minimapToggle.textContent = '+'; els.minimapToggle.title = 'Expand'; }
  }
}

// ── Minimap drag-to-scroll ────────────────────────────────────────────────────

let minimapDragActive = false;

function scrollToMinimapPoint(clientX, clientY) {
  const rect = els.minimapCanvas.getBoundingClientRect();
  const mx = ((clientX - rect.left) / MINI_W) * MAP_W;
  const my = ((clientY - rect.top)  / MINI_H) * MAP_H;
  const vp = els.viewport;
  vp.scrollLeft = mx * zoom - vp.clientWidth  / 2;
  vp.scrollTop  = my * zoom - vp.clientHeight / 2;
  drawMinimap();
}

function wireFloatPanels() {
  if (els.minimapHeader) makeDraggable(els.minimap, els.minimapHeader);
  if (els.legendHeader)  makeDraggable(els.legend,  els.legendHeader);

  if (els.minimapCanvas) {
    els.minimapCanvas.addEventListener('mousedown', (e) => {
      if (panelDragState) return;
      minimapDragActive = true;
      scrollToMinimapPoint(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  if (els.minimapToggle) {
    els.minimapToggle.addEventListener('click', () => {
      minimapMinimized = !minimapMinimized;
      els.minimap.classList.toggle('minimized', minimapMinimized);
      els.minimapToggle.textContent = minimapMinimized ? '+' : '−';
      els.minimapToggle.title = minimapMinimized ? 'Expand' : 'Minimize';
      if (!minimapMinimized) drawMinimap();
      saveState();
    });
  }

  if (els.legendToggle) {
    els.legendToggle.addEventListener('click', () => {
      legendMinimized = !legendMinimized;
      els.legend.classList.toggle('minimized', legendMinimized);
      els.legendToggle.textContent = legendMinimized ? '+' : '−';
      els.legendToggle.title = legendMinimized ? 'Expand' : 'Minimize';
      saveState();
    });
  }
}

// ── Drag to pan viewport ──────────────────────────────────────────────────────

let dragState = null;

els.map.addEventListener('mousedown', (e) => {
  if (!mapEditMode) return;

  // Resize handle drag
  const handle = e.target.closest('.resizeHandle');
  if (handle) {
    const id = selectedId;
    const r  = id ? getRow(id) : null;
    if (!r) return;
    const b = getBounds(r);
    if (!b) return;
    const mp = getViewportMapCoords(e.clientX, e.clientY);
    conveyorResizeDrag = { id, r, pos: handle.dataset.pos, startMapX: mp.x, startMapY: mp.y, origBounds: { ...b }, currentBounds: { ...b } };
    e.preventDefault(); e.stopPropagation(); return;
  }

  // Conveyor node drag
  const node = e.target.closest('.node:not(.blank)');
  if (node && node.dataset.id) {
    const id = node.dataset.id;
    const r  = getRow(id);
    if (!r) return;
    select(id, { center: false });
    const b  = getBounds(r);
    const mp = getViewportMapCoords(e.clientX, e.clientY);
    const origSegs = buildSegments(r);
    conveyorNodeDrag = {
      id, r,
      startMapX: mp.x, startMapY: mp.y,
      origX: b?.x ?? 0, origY: b?.y ?? 0,
      hasPath: getPathPoints(r) !== null,
      origSegments: origSegs ? origSegs.map(s => ({ ...s })) : null,
    };
    e.preventDefault(); e.stopPropagation(); return;
  }
}, { capture: true });

els.viewport.addEventListener('mousedown', (e) => {
  if (e.target.closest('.node')) return;
  if (e.target.closest('.resizeHandle')) return;
  dragState = {
    startX: e.clientX, startY: e.clientY,
    scrollLeft: els.viewport.scrollLeft, scrollTop: els.viewport.scrollTop,
    moved: false,
  };
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (minimapDragActive) {
    scrollToMinimapPoint(e.clientX, e.clientY);
    return;
  }
  if (panelDragState) {
    const { el, startX, startY, origLeft, origTop } = panelDragState;
    clampPanel(el, origLeft + (e.clientX - startX), origTop + (e.clientY - startY));
    return;
  }

  // ── Conveyor resize drag ──
  if (conveyorResizeDrag) {
    const mp = getViewportMapCoords(e.clientX, e.clientY);
    const dx = mp.x - conveyorResizeDrag.startMapX;
    const dy = mp.y - conveyorResizeDrag.startMapY;
    let { x, y, w, h } = conveyorResizeDrag.origBounds;
    const pos = conveyorResizeDrag.pos;
    const MIN = 10;

    if (pos.includes('n')) { const ny = y + dy; const nh = h - dy; if (nh >= MIN) { y = ny; h = nh; } }
    if (pos.includes('s')) { h = Math.max(MIN, h + dy); }
    if (pos.includes('w')) { const nx = x + dx; const nw = w - dx; if (nw >= MIN) { x = nx; w = nw; } }
    if (pos.includes('e')) { w = Math.max(MIN, w + dx); }

    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    conveyorResizeDrag.currentBounds = { x, y, w, h };

    // Move the node visually
    const node = els.map.querySelector(`.node[data-id="${CSS.escape(conveyorResizeDrag.id)}"]`);
    if (node) { node.style.left = x+'px'; node.style.top = y+'px'; node.style.width = w+'px'; node.style.height = h+'px'; }
    // Move the overlay visually
    const ov = document.getElementById('resizeOverlay');
    if (ov) { ov.style.left = x+'px'; ov.style.top = y+'px'; ov.style.width = w+'px'; ov.style.height = h+'px'; }
    return;
  }

  // ── Conveyor node drag ──
  if (conveyorNodeDrag) {
    const mp = getViewportMapCoords(e.clientX, e.clientY);
    const dx = Math.round(mp.x - conveyorNodeDrag.startMapX);
    const dy = Math.round(mp.y - conveyorNodeDrag.startMapY);

    if (conveyorNodeDrag.hasPath && conveyorNodeDrag.origSegments) {
      const nodes = els.map.querySelectorAll(`.node[data-id="${CSS.escape(conveyorNodeDrag.id)}"]`);
      nodes.forEach((n, i) => {
        const s = conveyorNodeDrag.origSegments[i];
        if (s) { n.style.left = (s.x + dx)+'px'; n.style.top = (s.y + dy)+'px'; }
      });
    } else {
      const node = els.map.querySelector(`.node[data-id="${CSS.escape(conveyorNodeDrag.id)}"]`);
      if (node) { node.style.left = (conveyorNodeDrag.origX + dx)+'px'; node.style.top = (conveyorNodeDrag.origY + dy)+'px'; }
    }
    // Move the overlay visually
    const ov = document.getElementById('resizeOverlay');
    if (ov && !ov.hidden) { ov.style.left = (conveyorNodeDrag.origX + dx)+'px'; ov.style.top = (conveyorNodeDrag.origY + dy)+'px'; }
    return;
  }

  if (!dragState) return;
  const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(dx, dy) > 4) {
    dragState.moved = true;
    els.viewport.classList.add('dragging');
  }
  if (dragState.moved) {
    els.viewport.scrollLeft = dragState.scrollLeft - dx;
    els.viewport.scrollTop  = dragState.scrollTop  - dy;
  }
});

window.addEventListener('mouseup', (e) => {
  if (minimapDragActive) { minimapDragActive = false; saveState(); }
  if (panelDragState) { panelDragState = null; saveState(); }
  if (dragState) { els.viewport.classList.remove('dragging'); dragState = null; }

  // ── Commit resize drag ──
  if (conveyorResizeDrag) {
    const { r, currentBounds } = conveyorResizeDrag;
    if (currentBounds) { r.x = currentBounds.x; r.y = currentBounds.y; r.w = currentBounds.w; r.h = currentBounds.h; }
    conveyorResizeDrag = null;
    render(); updateResizeOverlay(); renderMapEditPanel();
    return;
  }

  // ── Commit node drag ──
  if (conveyorNodeDrag) {
    const mp = getViewportMapCoords(e.clientX, e.clientY);
    const dx = Math.round(mp.x - conveyorNodeDrag.startMapX);
    const dy = Math.round(mp.y - conveyorNodeDrag.startMapY);
    const r  = conveyorNodeDrag.r;

    if (conveyorNodeDrag.hasPath) {
      if (Array.isArray(r.points)) {
        r.points = r.points.map(p => [p[0] + dx, p[1] + dy]);
      } else if (Array.isArray(r.path)) {
        r.path = r.path.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
      }
    } else {
      r.x = conveyorNodeDrag.origX + dx;
      r.y = conveyorNodeDrag.origY + dy;
    }
    conveyorNodeDrag = null;
    render(); updateResizeOverlay(); renderMapEditPanel();
    return;
  }
});

// ── Ctrl+scroll zoom ──────────────────────────────────────────────────────────

els.viewport.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const rect = els.viewport.getBoundingClientRect();
  const mouseMapX = (e.clientX - rect.left + els.viewport.scrollLeft) / zoom;
  const mouseMapY = (e.clientY - rect.top  + els.viewport.scrollTop)  / zoom;
  setZoom(zoom + (e.deltaY > 0 ? -0.1 : 0.1), false);
  els.viewport.scrollLeft = mouseMapX * zoom - (e.clientX - rect.left);
  els.viewport.scrollTop  = mouseMapY * zoom - (e.clientY - rect.top);
  drawMinimap();
}, { passive: false });

// ── Touch pan + pinch zoom ────────────────────────────────────────────────────

let touchState = null;

els.viewport.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    touchState = { type: 'pan',
      startX: e.touches[0].clientX, startY: e.touches[0].clientY,
      scrollLeft: els.viewport.scrollLeft, scrollTop: els.viewport.scrollTop };
  } else if (e.touches.length === 2) {
    touchState = { type: 'pinch',
      startDist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY),
      startZoom: zoom };
  }
  e.preventDefault();
}, { passive: false });

els.viewport.addEventListener('touchmove', (e) => {
  if (!touchState) return;
  e.preventDefault();
  if (touchState.type === 'pan' && e.touches.length === 1) {
    els.viewport.scrollLeft = touchState.scrollLeft - (e.touches[0].clientX - touchState.startX);
    els.viewport.scrollTop  = touchState.scrollTop  - (e.touches[0].clientY - touchState.startY);
  } else if (touchState.type === 'pinch' && e.touches.length === 2) {
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY);
    setZoom(touchState.startZoom * (dist / touchState.startDist), true);
  }
  drawMinimap();
}, { passive: false });

els.viewport.addEventListener('touchend', () => { touchState = null; });

// ── Search events ─────────────────────────────────────────────────────────────

let activeHits = [], activeIndex = 0;

function updateHits() {
  activeHits = searchMatches(els.search.value);
  activeIndex = 0;
  setMatchHint(els.search.value);
}

els.search.addEventListener('input', () => {
  updateHits();
  applyDim(activeHits);
  const q = normalize(els.search.value);
  if (!q) { applyDim([]); return; }
  const exact = rows.find(r => normalize(shortOf(r)) === q || normalize(idOf(r)) === q);
  if (exact) select(idOf(exact), { center: true });
});

els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    updateHits();
    if (activeHits.length) {
      select(activeHits[Math.min(activeIndex, activeHits.length - 1)], { center: true });
      showToast('Selected');
    } else { showToast('No matches'); }
  }
  if (e.key === 'ArrowDown') {
    if (!activeHits.length) updateHits();
    if (activeHits.length) { e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, activeHits.length - 1);
      select(activeHits[activeIndex], { center: true }); }
  }
  if (e.key === 'ArrowUp') {
    if (!activeHits.length) updateHits();
    if (activeHits.length) { e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      select(activeHits[activeIndex], { center: true }); }
  }
  if (e.key === 'Escape') {
    els.search.value = ''; els.matchHint.textContent = '';
    activeHits = []; activeIndex = 0; applyDim([]);
  }
});

els.centerBtn.addEventListener('click', () => centerOnSelected());
els.zoomOutBtn.addEventListener('click',  () => setZoom(zoom - 0.1));
els.zoomInBtn.addEventListener('click',   () => setZoom(zoom + 0.1));
els.zoomResetBtn.addEventListener('click', () => setZoom(1));

els.copyAllBtn.addEventListener('click', async () => {
  if (await copyText(buildCopyAllText())) showToast('Copied all fields');
});

els.map.addEventListener('click', async (e) => {
  const node = e.target.closest?.('.node');
  if (!node || !(e.ctrlKey || e.metaKey)) return;
  const id = node.dataset.id;
  if (!id) return;
  const r = getRow(id);
  await copyText(r ? shortOf(r) : id);
  showToast('Copied Shortened Alias');
});

els.viewport.addEventListener('scroll', () => { drawMinimap(); saveState(); });

// ── Tab system ────────────────────────────────────────────────────────────────

const TABS = ['info', 'notes', 'settings', 'help', 'mapEdit'];

function switchTab(name) {
  for (const t of TABS) {
    const btn   = document.querySelector(`.tabBtn[data-tab="${t}"]`);
    const panel = document.getElementById(`tab-${t}`);
    const active = t === name;
    if (btn)   { btn.classList.toggle('active', active); btn.setAttribute('aria-selected', String(active)); }
    if (panel) panel.hidden = !active;
  }
  if (name === 'notes') updateNotesPanel();
  // Activate/deactivate map edit mode based on tab
  const entering = name === 'mapEdit';
  if (entering !== mapEditMode) {
    mapEditMode = entering;
    document.body.classList.toggle('mapEditMode', mapEditMode);
    updateResizeOverlay();
    if (mapEditMode) renderMapEditPanel();
  }
}

document.querySelectorAll('.tabBtn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Notes ─────────────────────────────────────────────────────────────────────

function allNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; }
}

function updateNotesPanel() {
  if (!els.noteTextarea) return;
  if (selectedId) {
    const r = getRow(selectedId);
    els.notesConveyorLabel.textContent = `Notes: ${r ? shortOf(r) : selectedId}`;
    els.noteTextarea.value = allNotes()[selectedId] || '';
    els.noteTextarea.disabled = false;
  } else {
    els.notesConveyorLabel.textContent = 'No conveyor selected';
    els.noteTextarea.value = '';
    els.noteTextarea.disabled = true;
  }
  if (els.notesSavedHint) els.notesSavedHint.textContent = '';
}

if (els.saveNoteBtn) {
  els.saveNoteBtn.addEventListener('click', () => {
    if (!selectedId) return;
    const notes = allNotes();
    const text = els.noteTextarea.value;
    if (text.trim()) { notes[selectedId] = text; } else { delete notes[selectedId]; }
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    if (els.notesSavedHint) {
      els.notesSavedHint.textContent = 'Saved!';
      setTimeout(() => { if (els.notesSavedHint) els.notesSavedHint.textContent = ''; }, 1500);
    }
  });
}

if (els.exportNotesBtn) {
  els.exportNotesBtn.addEventListener('click', () => {
    const notes = allNotes();
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'conveyor-notes.json';
    a.click(); URL.revokeObjectURL(url);
  });
}

if (els.importNotesInput) {
  els.importNotesInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error('Invalid format');
        const merged = { ...allNotes(), ...imported };
        localStorage.setItem(NOTES_KEY, JSON.stringify(merged));
        updateNotesPanel();
        showToast(`Imported ${Object.keys(imported).length} notes`);
      } catch {
        showToast('Import failed: invalid JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

function loadUserSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch { return null; }
}

function saveUserSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      theme:       document.documentElement.dataset.theme || 'dark',
      colors:      Object.fromEntries(Object.entries(CONVEYOR_TYPES).map(([k, v]) => [k, { bg: v.bg, border: v.border, text: v.text }])),
      showLegend:  !els.legend?.hidden,
      showMinimap: !els.minimap?.hidden,
      showGrid:    !els.map.classList.contains('no-grid'),
    }));
  } catch {}
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (els.themeSelect) els.themeSelect.value = theme;
}

function applyUserSettings(s) {
  if (!s) return;
  if (s.theme) applyTheme(s.theme);
  if (s.colors) {
    for (const [key, c] of Object.entries(s.colors)) {
      if (CONVEYOR_TYPES[key]) Object.assign(CONVEYOR_TYPES[key], c);
    }
  }
  if (s.showLegend  === false && els.legend)  els.legend.hidden  = true;
  if (s.showMinimap === false && els.minimap) els.minimap.hidden = true;
  if (s.showGrid    === false) els.map.classList.add('no-grid');
}

function syncSettingsUI() {
  if (els.showLegendChk)  els.showLegendChk.checked  = !els.legend?.hidden;
  if (els.showMinimapChk) els.showMinimapChk.checked = !els.minimap?.hidden;
  if (els.showGridChk)    els.showGridChk.checked    = !els.map.classList.contains('no-grid');
  if (els.themeSelect)    els.themeSelect.value = document.documentElement.dataset.theme || 'dark';
  for (const [key] of Object.entries(CONVEYOR_TYPES)) {
    const bgEl = document.getElementById(`color-${key}-bg`);
    const boEl = document.getElementById(`color-${key}-border`);
    const txEl = document.getElementById(`color-${key}-text`);
    if (bgEl) bgEl.value = CONVEYOR_TYPES[key].bg;
    if (boEl) boEl.value = CONVEYOR_TYPES[key].border;
    if (txEl) txEl.value = CONVEYOR_TYPES[key].text;
  }
}

function buildColorSettings() {
  if (!els.colorSettings) return;
  els.colorSettings.innerHTML = '';
  for (const [key, tc] of Object.entries(CONVEYOR_TYPES)) {
    const row = document.createElement('div');
    row.className = 'colorRow';
    row.innerHTML =
      `<span class="colorRowLabel">${escapeHtml(tc.label)}</span>` +
      `<div class="colorPickers">` +
        `<label class="colorPickerLabel">Fill` +
          `<input type="color" id="color-${key}-bg" value="${tc.bg}" data-type="${key}" data-prop="bg">` +
        `</label>` +
        `<label class="colorPickerLabel">Border` +
          `<input type="color" id="color-${key}-border" value="${tc.border}" data-type="${key}" data-prop="border">` +
        `</label>` +
        `<label class="colorPickerLabel">Text` +
          `<input type="color" id="color-${key}-text" value="${tc.text}" data-type="${key}" data-prop="text">` +
        `</label>` +
      `</div>`;
    els.colorSettings.appendChild(row);
  }

  els.colorSettings.addEventListener('input', (e) => {
    const input = e.target;
    if (input.type !== 'color') return;
    const type = input.dataset.type, prop = input.dataset.prop;
    if (CONVEYOR_TYPES[type]) {
      CONVEYOR_TYPES[type][prop] = input.value;
      render(); buildLegend(); drawMinimap(); saveUserSettings();
    }
  });
}

if (els.themeSelect) {
  els.themeSelect.addEventListener('change', () => {
    applyTheme(els.themeSelect.value);
    saveUserSettings();
  });
}

if (els.showLegendChk) {
  els.showLegendChk.addEventListener('change', () => {
    if (els.legend) els.legend.hidden = !els.showLegendChk.checked;
    saveUserSettings();
  });
}

if (els.showMinimapChk) {
  els.showMinimapChk.addEventListener('change', () => {
    if (els.minimap) {
      els.minimap.hidden = !els.showMinimapChk.checked;
      if (!els.minimap.hidden) drawMinimap();
    }
    saveUserSettings();
  });
}

if (els.showGridChk) {
  els.showGridChk.addEventListener('change', () => {
    els.map.classList.toggle('no-grid', !els.showGridChk.checked);
    saveUserSettings();
  });
}

if (els.resetSettingsBtn) {
  els.resetSettingsBtn.addEventListener('click', () => {
    for (const [key, defaults] of Object.entries(DEFAULT_TYPE_COLORS))
      Object.assign(CONVEYOR_TYPES[key], defaults);
    applyTheme('dark');
    if (els.legend)  els.legend.hidden  = false;
    if (els.minimap) { els.minimap.hidden = false; drawMinimap(); }
    els.map.classList.remove('no-grid');
    render(); buildLegend(); syncSettingsUI(); saveUserSettings();
  });
}

// ── Load ──────────────────────────────────────────────────────────────────────

buildLegend();
buildColorSettings();
wireFloatPanels();
initPanelPositions();
applyUserSettings(loadUserSettings());
syncSettingsUI();

async function load() {
  const [res, catalogRes, conveyorPartsRes, allConveyorsRes] = await Promise.all([
    fetch('./data/conveyors-map.json', { cache: 'no-store' }),
    fetch('./data/parts-catalog.json', { cache: 'no-store' }).catch(() => null),
    fetch('./data/conveyor-parts.json', { cache: 'no-store' }).catch(() => null),
    fetch('./data/conveyors.json',     { cache: 'no-store' }).catch(() => null),
  ]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  rows = await res.json();
  if (catalogRes?.ok) partsCatalog = await catalogRes.json();
  if (conveyorPartsRes?.ok) conveyorParts = await conveyorPartsRes.json();
  if (allConveyorsRes?.ok) {
    const all = await allConveyorsRes.json();
    unmappedConveyors = Array.isArray(all) ? all : [];
  }
  rows.sort((a, b) => sortIds(idOf(a), idOf(b)));

  render();
  wireCopyCells();

  const saved = loadSavedState();
  setZoom(saved?.zoom ?? 1, false);
  if (saved) {
    els.viewport.scrollLeft = saved.scrollLeft ?? 0;
    els.viewport.scrollTop  = saved.scrollTop  ?? 0;
  }

  selectedId = rows[0] ? idOf(rows[0]) : null;
  if (selectedId) select(selectedId, { center: !saved });

  drawMinimap();
}

initPartsSorting();
initPartsLightbox();

load().catch(err => {
  console.error(err);
  showToast('Failed to load map data — check console');
});

// ── Info Panel Layout System ──────────────────────────────────────────────────

const LAYOUT_KEY = 'conveyor-map-layout';

const ALL_FIELDS = [
  { field: 'shortened_alias',          label: 'Shortened Alias' },
  { field: 'control_panel',            label: 'Control Panel' },
  { field: 'incident_energy',          label: 'Incident Energy' },
  { field: 'cp_location',              label: 'CP Location' },
  { field: 'mcp',                      label: 'MCP' },
  { field: 'conveyance_group',         label: 'Conveyance Group' },
  { field: 'position',                 label: 'Equipment ID' },
  { field: 'description',              label: 'Description' },
  { field: 'manufacturer',             label: 'Manufacturer' },
  { field: 'model',                    label: 'Model' },
  { field: 'class',                    label: 'Class' },
  { field: 'amazon_alias',             label: 'Amazon Alias' },
  { field: 'amazon_alias_description', label: 'Amazon Alias Description' },
  { field: 'equipment_configuration',  label: 'Equipment Configuration' },
  { field: 'na_eam_object_code',       label: 'NA EAM Object Code' },
];

const DEFAULT_LAYOUT = {
  panels: [
    {
      id: 'panel-quick-ref', title: 'Quick Reference',
      rows: [
        { id: 'r-shortened_alias',  field: 'shortened_alias',  label: 'Shortened Alias',  color: null },
        { id: 'r-control_panel',    field: 'control_panel',    label: 'Control Panel',    color: '#ff6a6a' },
        { id: 'r-incident_energy',  field: 'incident_energy',  label: 'Incident Energy',  color: '#ff6a6a' },
        { id: 'r-cp_location',      field: 'cp_location',      label: 'CP Location',      color: null },
        { id: 'r-mcp',              field: 'mcp',              label: 'MCP',              color: null },
        { id: 'r-conveyance_group', field: 'conveyance_group', label: 'Conveyance Group', color: null },
      ],
    },
    {
      id: 'panel-apm-ref', title: 'APM Reference',
      rows: [
        { id: 'r-position',                 field: 'position',                 label: 'Equipment ID',               color: null },
        { id: 'r-description',              field: 'description',              label: 'Description',                color: null },
        { id: 'r-manufacturer',             field: 'manufacturer',             label: 'Manufacturer',               color: null },
        { id: 'r-model',                    field: 'model',                    label: 'Model',                      color: null },
        { id: 'r-class',                    field: 'class',                    label: 'Class',                      color: null },
        { id: 'r-amazon_alias',             field: 'amazon_alias',             label: 'Amazon Alias',               color: null },
        { id: 'r-amazon_alias_description', field: 'amazon_alias_description', label: 'Amazon Alias Description',   color: null },
        { id: 'r-equipment_configuration',  field: 'equipment_configuration',  label: 'Equipment Configuration',    color: null },
        { id: 'r-na_eam_object_code',       field: 'na_eam_object_code',       label: 'NA EAM Object Code',         color: null },
      ],
    },
  ],
};

let layout = loadLayout();
let editMode = false;
let dragSrc  = null;

function loadLayout() {
  try {
    const s = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    if (s && Array.isArray(s.panels)) return s;
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
}

function saveLayout() {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
}

function uid() { return 'id-' + Math.random().toString(36).slice(2, 9); }

function contrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a0000' : '#ffffff';
}

// ── Render info panels ────────────────────────────────────────────────────────

function renderInfoPanels() {
  const container = document.getElementById('infoPanels');
  if (!container) return;
  container.innerHTML = '';

  for (const panel of layout.panels) {
    const section = document.createElement('section');
    section.className = 'panel';
    section.dataset.panelId = panel.id;
    section.setAttribute('aria-label', panel.title);

    // Header
    const header = document.createElement('div');
    header.className = 'panelTitle';

    if (editMode) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = panel.title;
      inp.className = 'panelTitleInput';
      inp.addEventListener('change', e => {
        panel.title = e.target.value.trim() || panel.title;
        section.setAttribute('aria-label', panel.title);
        saveLayout();
      });
      header.appendChild(inp);

      const delBtn = document.createElement('button');
      delBtn.className = 'delPanelBtn';
      delBtn.type = 'button';
      delBtn.title = 'Delete section';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        if (layout.panels.length <= 1) { showToast('Cannot remove last section'); return; }
        layout.panels = layout.panels.filter(p => p.id !== panel.id);
        saveLayout();
        renderInfoPanels();
        wireCopyCells();
        if (selectedId) fillCells(getRow(selectedId));
      });
      header.appendChild(delBtn);
    } else {
      header.textContent = panel.title;
    }
    section.appendChild(header);

    // Table
    const table = document.createElement('table');
    table.className = editMode ? 'infoTable editMode' : 'infoTable';
    table.setAttribute('role', 'table');
    const tbody = document.createElement('tbody');

    for (const row of panel.rows) {
      tbody.appendChild(buildInfoRow(row, panel));
    }
    table.appendChild(tbody);
    section.appendChild(table);

    // Add row button (edit mode only)
    if (editMode) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn addRowBtn';
      addBtn.type = 'button';
      addBtn.textContent = '+ Add Row';
      addBtn.addEventListener('click', () => showAddRowForm(panel, tbody));
      section.appendChild(addBtn);
    }

    container.appendChild(section);
  }

  // Add section button (edit mode only)
  if (editMode) {
    const addSecBtn = document.createElement('button');
    addSecBtn.className = 'btn addSectionBtn';
    addSecBtn.type = 'button';
    addSecBtn.textContent = '+ Add Section';
    addSecBtn.addEventListener('click', () => {
      layout.panels.push({ id: uid(), title: 'New Section', rows: [] });
      saveLayout();
      renderInfoPanels();
      wireCopyCells();
    });
    container.appendChild(addSecBtn);
  }
}

function buildInfoRow(row, panel) {
  const tr = document.createElement('tr');
  tr.dataset.rowId   = row.id;
  tr.dataset.panelId = panel.id;

  if (row.color) {
    tr.classList.add('highlightRow');
    tr.style.setProperty('--row-color', row.color);
    tr.style.setProperty('--row-text',  contrastColor(row.color));
  }

  // Label cell — drag grip lives here so no extra column is added
  const th = document.createElement('th');
  th.scope = 'row';

  if (editMode) {
    const grip = document.createElement('span');
    grip.className = 'rowDragHandle';
    grip.textContent = '⠇';
    grip.title = 'Drag to reorder';
    th.appendChild(grip);
  }

  const labelSpan = document.createElement('span');
  labelSpan.className = 'rowLabel';
  labelSpan.textContent = row.label;
  th.appendChild(labelSpan);
  tr.appendChild(th);

  // Value cell — controls overlay lives here so no extra column is added
  const td = document.createElement('td');
  td.className = 'copyCell';
  td.title = 'Click to copy';

  if (editMode) {
    td.classList.add('hasRowControls');

    // Value span — data-field goes here, NOT on td, so fillCells doesn't wipe the overlay
    const valueSpan = document.createElement('span');
    valueSpan.className = 'cellValue';
    if (row.field) valueSpan.dataset.field = row.field;
    td.appendChild(valueSpan);

    const overlay = document.createElement('span');
    overlay.className = 'rowControlsOverlay';

    const colorPick = document.createElement('input');
    colorPick.type  = 'color';
    colorPick.className = 'rowColorPicker';
    colorPick.value = row.color || '#ff6a6a';
    colorPick.title = 'Set row color';
    colorPick.style.opacity = row.color ? '1' : '0.4';
    colorPick.addEventListener('click', e => e.stopPropagation());
    colorPick.addEventListener('input', e => {
      row.color = e.target.value;
      colorPick.style.opacity = '1';
      saveLayout();
      tr.classList.add('highlightRow');
      tr.style.setProperty('--row-color', row.color);
      tr.style.setProperty('--row-text',  contrastColor(row.color));
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'rowColorClearBtn';
    clearBtn.textContent = '×';
    clearBtn.title = 'Remove color';
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      row.color = null;
      colorPick.style.opacity = '0.4';
      tr.classList.remove('highlightRow');
      tr.style.removeProperty('--row-color');
      tr.style.removeProperty('--row-text');
      saveLayout();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'rowDeleteBtn';
    delBtn.textContent = '×';
    delBtn.title = 'Remove row';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      panel.rows = panel.rows.filter(r => r.id !== row.id);
      saveLayout();
      renderInfoPanels();
      wireCopyCells();
      if (selectedId) fillCells(getRow(selectedId));
    });

    overlay.append(colorPick, clearBtn, delBtn);
    td.appendChild(overlay);

    tr.draggable = true;
    tr.addEventListener('dragstart', e => {
      dragSrc = { panelId: panel.id, rowId: row.id };
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      document.querySelectorAll('.dragOver').forEach(el => el.classList.remove('dragOver'));
    });
    tr.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tr.classList.add('dragOver');
    });
    tr.addEventListener('dragleave', () => tr.classList.remove('dragOver'));
    tr.addEventListener('drop', e => {
      e.preventDefault();
      tr.classList.remove('dragOver');
      if (!dragSrc || dragSrc.rowId === row.id) return;
      const srcPanel = layout.panels.find(p => p.id === dragSrc.panelId);
      const tgtPanel = layout.panels.find(p => p.id === panel.id);
      if (!srcPanel || !tgtPanel) return;
      const si = srcPanel.rows.findIndex(r => r.id === dragSrc.rowId);
      const ti = tgtPanel.rows.findIndex(r => r.id === row.id);
      if (si === -1 || ti === -1) return;
      const [moved] = srcPanel.rows.splice(si, 1);
      tgtPanel.rows.splice(ti, 0, moved);
      saveLayout();
      renderInfoPanels();
      wireCopyCells();
      if (selectedId) fillCells(getRow(selectedId));
    });
  } else {
    // Non-edit mode: data-field goes directly on the td
    if (row.field) td.dataset.field = row.field;
  }

  tr.appendChild(td);
  return tr;
}
function showAddRowForm(panel, tbody) {
  // Remove any existing form
  tbody.querySelectorAll('.addRowForm').forEach(el => el.remove());

  const usedFields = new Set(layout.panels.flatMap(p => p.rows.map(r => r.field)).filter(Boolean));

  const tr = document.createElement('tr');
  tr.className = 'addRowForm';

  const td = document.createElement('td');
  td.colSpan = 2;

  const inner = document.createElement('div');
  inner.className = 'addRowFormInner';

  const fieldSel = document.createElement('select');
  fieldSel.className = 'addRowFieldSelect';
  fieldSel.innerHTML = '<option value="">— pick field —</option>';
  for (const { field, label } of ALL_FIELDS) {
    const opt = document.createElement('option');
    opt.value = field;
    opt.textContent = label + (usedFields.has(field) ? ' ✓' : '');
    fieldSel.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Custom (no data)';
  fieldSel.appendChild(customOpt);

  const labelInp = document.createElement('input');
  labelInp.type = 'text';
  labelInp.className = 'addRowLabelInput';
  labelInp.placeholder = 'Label';

  fieldSel.addEventListener('change', () => {
    const f = ALL_FIELDS.find(x => x.field === fieldSel.value);
    if (f) labelInp.value = f.label;
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn';
  confirmBtn.textContent = 'Add';
  confirmBtn.addEventListener('click', () => {
    const field = fieldSel.value === '__custom__' || !fieldSel.value ? '' : fieldSel.value;
    const label = labelInp.value.trim() || ALL_FIELDS.find(x => x.field === field)?.label || 'Custom';
    if (!field && !labelInp.value.trim()) { showToast('Enter a label'); return; }
    panel.rows.push({ id: uid(), field, label, color: null });
    saveLayout();
    renderInfoPanels();
    wireCopyCells();
    if (selectedId) fillCells(getRow(selectedId));
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => tr.remove());

  inner.append(fieldSel, labelInp, confirmBtn, cancelBtn);
  td.appendChild(inner);
  tr.appendChild(td);
  tbody.appendChild(tr);
  labelInp.focus();
}

// ── Edit mode toggle ──────────────────────────────────────────────────────────

function initEditMode() {
  const btn = document.getElementById('editLayoutBtn');
  if (!btn) return;

  // Pencil only makes sense on the info tab — hide it on other tabs
  const setEditBtnVisible = (tabName) => {
    btn.style.display = tabName === 'info' ? '' : 'none';
    if (tabName !== 'info' && editMode) {
      editMode = false;
      btn.classList.remove('active');
      btn.title = 'Edit info layout';
      toolbar.hidden = true;
      renderInfoPanels();
      wireCopyCells();
      if (selectedId) fillCells(getRow(selectedId));
    }
  };
  document.querySelectorAll('.tabBtn').forEach(b => {
    b.addEventListener('click', () => setEditBtnVisible(b.dataset.tab));
  });

  // Inject toolbar at the top of #tab-info, before #infoPanels
  const tabInfo = document.getElementById('tab-info');
  const infoPanels = document.getElementById('infoPanels');

  const toolbar = document.createElement('div');
  toolbar.id = 'editToolbar';
  toolbar.className = 'editToolbar';
  toolbar.hidden = true;

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn';
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset Layout';
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset info panel layout to defaults?')) return;
    layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    saveLayout();
    renderInfoPanels();
    wireCopyCells();
    if (selectedId) fillCells(getRow(selectedId));
    showToast('Layout reset');
  });
  toolbar.appendChild(resetBtn);
  tabInfo.insertBefore(toolbar, infoPanels);

  btn.addEventListener('click', () => {
    editMode = !editMode;
    btn.classList.toggle('active', editMode);
    btn.title = editMode ? 'Done editing' : 'Edit info layout';
    toolbar.hidden = !editMode;
    renderInfoPanels();
    wireCopyCells();
    if (selectedId) fillCells(getRow(selectedId));
  });
}

// ── Boot layout ───────────────────────────────────────────────────────────────
layout = loadLayout();
renderInfoPanels();
initEditMode();

// ── Conveyor Map Edit Mode ────────────────────────────────────────────────────

function getViewportMapCoords(clientX, clientY) {
  const rect = els.viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left + els.viewport.scrollLeft) / zoom,
    y: (clientY - rect.top  + els.viewport.scrollTop)  / zoom,
  };
}

function getUnmappedConveyors() {
  const mappedIds = new Set(rows.filter(r => !r.blank).map(r => idOf(r)));
  return unmappedConveyors.filter(r => !mappedIds.has(idOf(r)));
}

function addConveyorToMap(conveyor) {
  const vp  = els.viewport;
  const cx  = Math.round((vp.scrollLeft + vp.clientWidth  / 2) / zoom - 60);
  const cy  = Math.round((vp.scrollTop  + vp.clientHeight / 2) / zoom - 12);
  const newRow = { ...conveyor, x: cx, y: cy, w: 120, h: 25, conveyor_type: conveyor.conveyor_type || 'ground_level' };
  rows.push(newRow);
  rows.sort((a, b) => sortIds(idOf(a), idOf(b)));
  render();
  select(idOf(newRow), { center: false });
  renderMapEditPanel();
  showToast(`Added ${idOf(newRow)} to map`);
}

function removeConveyorFromMap(id) {
  rows = rows.filter(r => idOf(r) !== id || r.blank);
  selectedId = null;
  render();
  updateResizeOverlay();
  renderMapEditPanel();
  showToast(`Removed ${id} from map`);
}

function exportMapJson() {
  const data = rows.filter(r => !r.blank);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'conveyors-map.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('Exported conveyors-map.json');
}

// ── Resize overlay ────────────────────────────────────────────────────────────

function updateResizeOverlay() {
  const ov = document.getElementById('resizeOverlay');
  if (!ov) return;
  if (!mapEditMode || !selectedId) { ov.hidden = true; ov.innerHTML = ''; return; }
  const r = getRow(selectedId);
  if (!r) { ov.hidden = true; return; }
  const b = getBounds(r);
  if (!b) { ov.hidden = true; return; }

  ov.hidden = false;
  ov.style.left   = b.x + 'px';
  ov.style.top    = b.y + 'px';
  ov.style.width  = b.w + 'px';
  ov.style.height = b.h + 'px';

  ov.innerHTML = '';
  // Only show resize handles for simple x/y/w/h conveyors
  if (!getPathPoints(r)) {
    for (const pos of ['nw','n','ne','e','se','s','sw','w']) {
      const h = document.createElement('div');
      h.className = `resizeHandle rh-${pos}`;
      h.dataset.pos = pos;
      ov.appendChild(h);
    }
  }
}

// ── Map Edit sidebar panel ────────────────────────────────────────────────────

function renderMapEditPanel() {
  const panel = document.getElementById('tab-mapEdit');
  if (!panel) return;
  panel.innerHTML = '';

  const r       = selectedId ? getRow(selectedId) : null;
  const b       = r ? getBounds(r) : null;
  const hasPath = r ? getPathPoints(r) !== null : false;
  const unmapped = getUnmappedConveyors();

  // ── Selected conveyor ──
  const selSec = mkSection('Selected Conveyor');

  if (!r) {
    selSec.appendChild(mkNote('Click a conveyor on the map to select it.'));
  } else {
    const idLabel = document.createElement('div');
    idLabel.className = 'mapEditSelectedId';
    idLabel.textContent = idOf(r);
    selSec.appendChild(idLabel);

    if (b && !hasPath) {
      // x / y / w / h fields
      const grid = document.createElement('div');
      grid.className = 'mapEditPosGrid';
      for (const key of ['x','y','w','h']) {
        const lbl = document.createElement('label');
        lbl.className = 'mapEditFieldLbl';
        lbl.textContent = key.toUpperCase();
        const inp = document.createElement('input');
        inp.type  = 'number';
        inp.value = String(Math.round(r[key] ?? 0));
        inp.className = 'mapEditNumInput';
        inp.addEventListener('change', () => {
          const v = parseInt(inp.value, 10);
          if (Number.isFinite(v)) { r[key] = v; render(); updateResizeOverlay(); }
        });
        lbl.appendChild(inp);
        grid.appendChild(lbl);
      }
      selSec.appendChild(grid);
    } else if (hasPath) {
      selSec.appendChild(mkNote('Path-based conveyor — drag to move.'));
    }

    // Conveyor type selector
    const typeLbl = document.createElement('label');
    typeLbl.className = 'mapEditTypeLbl';
    typeLbl.textContent = 'Type ';
    const typeSel = document.createElement('select');
    typeSel.className = 'settingsSelect mapEditTypeSel';
    for (const [k, tc] of Object.entries(CONVEYOR_TYPES)) {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = tc.label;
      if ((r.conveyor_type || '') === k) opt.selected = true;
      typeSel.appendChild(opt);
    }
    typeSel.addEventListener('change', () => { r.conveyor_type = typeSel.value; render(); });
    typeLbl.appendChild(typeSel);
    selSec.appendChild(typeLbl);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn mapEditRemoveBtn';
    removeBtn.type = 'button';
    removeBtn.textContent = '✕ Remove from Map';
    removeBtn.addEventListener('click', () => {
      if (!confirm(`Remove "${idOf(r)}" from the map?`)) return;
      removeConveyorFromMap(idOf(r));
    });
    selSec.appendChild(removeBtn);
  }
  panel.appendChild(selSec);

  // ── Export ──
  const expSec = mkSection('Export');
  const expBtn = document.createElement('button');
  expBtn.className = 'btn';
  expBtn.type = 'button';
  expBtn.textContent = '⬇ Export conveyors-map.json';
  expBtn.addEventListener('click', exportMapJson);
  expSec.appendChild(expBtn);
  panel.appendChild(expSec);

  // ── Add to map ──
  const addSec = mkSection(`Add to Map  (${unmapped.length} off-map)`);

  const searchInp = document.createElement('input');
  searchInp.type  = 'search';
  searchInp.className = 'pickerInput';
  searchInp.placeholder = 'Filter by ID, alias…';
  searchInp.autocomplete = 'off';

  const list = document.createElement('div');
  list.className = 'mapEditAddList';

  function fillList(q) {
    const needle = normalize(q);
    list.innerHTML = '';
    const filtered = unmapped.filter(c => {
      const hay = `${normalize(idOf(c))} ${normalize(c.amazon_alias ?? '')} ${normalize(c.shortened_alias ?? '')} ${normalize(c.description ?? '')}`;
      return !needle || hay.includes(needle);
    });
    if (!filtered.length) {
      const msg = document.createElement('div');
      msg.className = 'mapEditAddEmpty';
      msg.textContent = needle ? 'No matches' : 'All conveyors are already on the map ✓';
      list.appendChild(msg);
      return;
    }
    const show = filtered.slice(0, 80);
    for (const c of show) {
      const btn = document.createElement('button');
      btn.className = 'mapEditAddItem';
      btn.type = 'button';
      const desc = c.description || c.shortened_alias || '';
      btn.innerHTML = `<span class="mapEditAddId">${escapeHtml(idOf(c))}</span>${desc ? `<span class="mapEditAddDesc">${escapeHtml(desc)}</span>` : ''}`;
      btn.addEventListener('click', () => addConveyorToMap(c));
      list.appendChild(btn);
    }
    if (filtered.length > 80) {
      const more = document.createElement('div');
      more.className = 'mapEditAddEmpty';
      more.textContent = `…${filtered.length - 80} more — refine search`;
      list.appendChild(more);
    }
  }

  searchInp.addEventListener('input', () => fillList(searchInp.value));
  fillList('');
  addSec.append(searchInp, list);
  panel.appendChild(addSec);
}

function mkSection(title) {
  const sec = document.createElement('div');
  sec.className = 'mapEditSection';
  const h = document.createElement('div');
  h.className = 'mapEditSectionTitle';
  h.textContent = title;
  sec.appendChild(h);
  return sec;
}

function mkNote(text) {
  const n = document.createElement('div');
  n.className = 'mapEditNote';
  n.textContent = text;
  return n;
}
