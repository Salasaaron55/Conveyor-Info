// SAT4 Conveyor Map (non-editable)
<<<<<<< HEAD
// Renders conveyors from conveyors.json using x/y/w/h pixel coords.
// Excel-like info panel mirrors the user's spreadsheet menu.
=======
// Renders conveyors from conveyors-map.json using x/y/w/h pixel coords.
>>>>>>> parent of ab9be9c (poly lines)

let rows = [];
let selectedId = null;
let zoom = 1;

const MAP_W = 2000;
const MAP_H = 1200;
<<<<<<< HEAD
=======
const MINI_W = 260;
const MINI_H = 80;

// Conveyor type color palette.
// Add "conveyor_type" to a record in conveyors-map.json to assign a color.
const CONVEYOR_TYPES = {
  ground_level: { bg: '#1a3a2a', border: '#34d399', text: '#d1fae5', label: 'Ground Level' },
  elevated:     { bg: '#1e3a6e', border: '#60a5fa', text: '#dbeafe', label: 'Elevated'     },
  incline:      { bg: '#78350f', border: '#fbbf24', text: '#fef3c7', label: 'Incline'      },
  decline:      { bg: '#7f1d1d', border: '#f87171', text: '#fee2e2', label: 'Decline'      },
  flex:         { bg: '#3b1f6e', border: '#a78bfa', text: '#ede9fe', label: 'Flex'         },
};
const UNASSIGNED = { bg: '#374151', border: '#4b5563', text: '#f9fafb', label: 'Unassigned' };

function getTypeColor(r) {
  if (!r || r.blank) return null;
  return CONVEYOR_TYPES[r.conveyor_type] || UNASSIGNED;
}
>>>>>>> parent of ab9be9c (poly lines)

const els = {
  search: document.getElementById("search"),
  matchHint: document.getElementById("matchHint"),
  copyAllBtn: document.getElementById("copyAllBtn"),
  centerBtn: document.getElementById("centerBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomResetBtn: document.getElementById("zoomResetBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  viewport: document.getElementById("viewport"),
  map: document.getElementById("map"),
  count: document.getElementById("count"),
  toast: document.getElementById("toast"),
};

function idOf(r){
  return String(r?.section_alias ?? "").trim();
}

function shortOf(r){
  const s = String(r?.shortened_alias ?? "").trim();
  return s || idOf(r);
}

function numOrNull(v){
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function sortIds(a,b){
  return a.localeCompare(b, undefined, { numeric:true, sensitivity:"base" });
}

function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(()=> els.toast.classList.remove("show"), 1200);
}

async function copyText(text){
  const t = String(text ?? "");
  if (!t) return false;
  try{
    await navigator.clipboard.writeText(t);
    return true;
  }catch{
    // fallback
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand("copy"); }catch{}
    ta.remove();
    return true;
  }
}

function setZoom(newZoom, keepCenter = true){
  const z = Math.max(0.5, Math.min(2.5, newZoom));
  if (z === zoom) return;

  // keep viewport center stable when zooming
  const vp = els.viewport;
  const cx = vp.scrollLeft + vp.clientWidth / 2;
  const cy = vp.scrollTop + vp.clientHeight / 2;
  const rx = cx / zoom;
  const ry = cy / zoom;

  zoom = z;
  els.map.style.transform = `scale(${zoom})`;
  els.zoomResetBtn.textContent = `${Math.round(zoom*100)}%`;

  if (keepCenter){
    vp.scrollLeft = rx * zoom - vp.clientWidth / 2;
    vp.scrollTop  = ry * zoom - vp.clientHeight / 2;
  }
}

function clearNodes(){
  [...els.map.querySelectorAll('.node')].forEach(n => n.remove());
}

function getPathPoints(r){
  // Supports either:
  //  - points: [[x,y], ...]
  //  - path: [{x,y}, ...]
  const pts = [];
  if (Array.isArray(r?.points)){
    for (const p of r.points){
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = numOrNull(p[0]);
      const y = numOrNull(p[1]);
      if (x === null || y === null) continue;
      pts.push({ x, y });
    }
  } else if (Array.isArray(r?.path)){
    for (const p of r.path){
      const x = numOrNull(p?.x);
      const y = numOrNull(p?.y);
      if (x === null || y === null) continue;
      pts.push({ x, y });
    }
  }
  return pts.length >= 2 ? pts : null;
}

function thicknessOf(r){
  // thickness falls back to height (h). If none, default 18.
  const t = numOrNull(r?.thickness);
  if (t !== null && t > 0) return t;
  const h = numOrNull(r?.h);
  if (h !== null && h > 0) return h;
  return 18;
}

function getBounds(r){
  // Returns {x,y,w,h} in map coords for centering.
  const pts = getPathPoints(r);
  if (pts){
    const t = thicknessOf(r);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts){
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    // Expand by thickness so the bbox reflects the drawn stroke.
    return { x: minX, y: minY, w: (maxX - minX) + t, h: (maxY - minY) + t };
  }

  const x = numOrNull(r.x);
  const y = numOrNull(r.y);
  const w = numOrNull(r.w);
  const h = numOrNull(r.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function buildSegments(r){
<<<<<<< HEAD
  // Returns array of rect segments: [{x,y,w,h,isTurn:boolean}]
  const pts = getPathPoints(r);
  if (!pts) return null;

  const t = thicknessOf(r);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i];
    const b = pts[i+1];

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Only axis-aligned segments are supported.
    if (dx !== 0 && dy !== 0) continue;
    if (dx === 0 && dy === 0) continue;

    if (dx !== 0){
      const x = Math.min(a.x, b.x);
      const y = a.y;
      const w = Math.abs(dx);
      segs.push({ x, y, w, h: t });
    } else {
      const x = a.x;
      const y = Math.min(a.y, b.y);
      const h = Math.abs(dy);
      segs.push({ x, y, w: t, h });
    }
  }
  return segs.length ? segs : null;
}

function render(){
  clearNodes();
=======
  const pts = getPathPoints(r);
  if (!pts) return null;
  const t = thicknessOf(r);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i+1];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx !== 0 && dy !== 0) continue;
    if (dx === 0 && dy === 0) continue;
    if (dx !== 0){
      segs.push({ x: Math.min(a.x, b.x), y: a.y, w: Math.abs(dx), h: t });
    } else {
      segs.push({ x: a.x, y: Math.min(a.y, b.y), w: t, h: Math.abs(dy) });
    }
  }
  return segs.length ? segs : null;
}

// ── Render ────────────────────────────────────────────────────────────────────

function applyNodeColor(node, r){
  const tc = getTypeColor(r);
  if (!tc) return;
  node.style.background  = tc.bg;
  node.style.borderColor = tc.border;
  node.style.color       = tc.text;
}

function makeNode(isBlank, id, r, seg){
  const node = document.createElement('div');
  node.className = isBlank ? 'node blank' : 'node';
  if (!isBlank){ node.dataset.id = id; applyNodeColor(node, r); }
  node.style.left   = `${seg.x}px`;
  node.style.top    = `${seg.y}px`;
  node.style.width  = `${seg.w}px`;
  node.style.height = `${seg.h}px`;
  return node;
}

function render(){
  [...els.map.querySelectorAll('.node')].forEach(n => n.remove());
>>>>>>> parent of ab9be9c (poly lines)

  // A conveyor is drawable if it has either:
  //  - valid x/y/w/h
  //  - or a path via points/path
  const drawable = rows.filter(r => getBounds(r) !== null);

<<<<<<< HEAD
els.count.textContent = String(drawable.filter(r => !r.blank).length);

for (const r of drawable){
  const isBlank = r.blank === true;

  // Only require an id for non-blank conveyors
  const id = isBlank ? null : idOf(r);
  if (!isBlank && !id) continue;

  const segs = buildSegments(r);
  if (segs){
    // Render turned conveyor as multiple rectangles.
    segs.forEach((seg, i) => {
      const node = document.createElement('div');
      node.className = isBlank ? 'node blank' : 'node';

      if (!isBlank){
        node.dataset.id = id;
        node.dataset.segment = String(i);
      }

      node.style.left = `${seg.x}px`;
      node.style.top = `${seg.y}px`;
      node.style.width = `${seg.w}px`;
      node.style.height = `${seg.h}px`;

      if (!isBlank){
        // Only label the first segment to avoid clutter.
        if (i === 0){
          node.innerHTML = `<span class="label">${escapeHtml(id)}</span>`;
        } else {
          node.innerHTML = '';
        }
        node.addEventListener('click', () => select(id, { center:false }));
      } else {
        node.innerHTML = '';
        node.setAttribute('aria-hidden', 'true');
      }

      els.map.appendChild(node);
    });
    continue;
=======
  for (const r of drawable){
    const isBlank = r.blank === true;
    const id = isBlank ? null : idOf(r);
    if (!isBlank && !id) continue;

    const segs = buildSegments(r);
    if (segs){
      segs.forEach((seg, i) => {
        const node = makeNode(isBlank, id, r, seg);
        if (!isBlank){
          node.dataset.segment = String(i);
          if (i === 0) node.innerHTML = `<span class="label">${escapeHtml(id)}</span>`;
          node.addEventListener('click', () => select(id, { center: false }));
        } else {
          node.setAttribute('aria-hidden', 'true');
        }
        els.map.appendChild(node);
      });
      continue;
    }

    const b = getBounds(r);
    const node = makeNode(isBlank, id, r, b);
    if (!isBlank){
      node.innerHTML = `<span class="label">${escapeHtml(id)}</span>`;
      node.addEventListener('click', () => select(id, { center: false }));
    } else {
      node.setAttribute('aria-hidden', 'true');
    }
    els.map.appendChild(node);
>>>>>>> parent of ab9be9c (poly lines)
  }

  // Fallback: single rectangle conveyor.
  const node = document.createElement('div');
  node.className = isBlank ? 'node blank' : 'node';

  if (!isBlank) {
    node.dataset.id = id;
  }

  node.style.left = `${Number(r.x)}px`;
  node.style.top = `${Number(r.y)}px`;
  node.style.width = `${Number(r.w)}px`;
  node.style.height = `${Number(r.h)}px`;

  if (!isBlank) {
    node.innerHTML = `<span class="label">${escapeHtml(id)}</span>`;
    node.addEventListener('click', () => select(id, { center:false }));
  } else {
    node.innerHTML = ""; // no label
    node.setAttribute('aria-hidden', 'true');
  }

  els.map.appendChild(node);
}

  highlightSelected();
}

function highlightSelected(){
<<<<<<< HEAD
  for (const n of els.map.querySelectorAll('.node')){
    n.classList.toggle('selected', n.dataset.id === selectedId);
  }
=======
  for (const n of els.map.querySelectorAll('.node'))
    n.classList.toggle('selected', n.dataset.id === selectedId);
>>>>>>> parent of ab9be9c (poly lines)
}

function fillCells(r){
  const cells = document.querySelectorAll('[data-field]');
  for (const c of cells){
    const key = c.getAttribute('data-field');
    let v = r ? (r[key] ?? '') : '';
    // Friendly fallbacks so the menu is never blank for key fields
    if (key === 'shortened_alias' && (!v || String(v).trim() === '')) v = r ? idOf(r) : '';
    c.textContent = String(v ?? '');
    c.tabIndex = 0;
  }
}

function getRow(id){
  return rows.find(r => idOf(r) === id) || null;
}

function select(id, { center = true } = {}){
  selectedId = id;
  const r = getRow(id);
  fillCells(r);
  highlightSelected();
  if (center) centerOnSelected();
}

function centerOnSelected(){
  const r = getRow(selectedId);
  if (!r) return;

  const b = getBounds(r);
  if (!b) return;
  const { x, y, w, h } = b;

  // px -> scroll coords, then scale
  const cx = (x + w/2) * zoom;
  const cy = (y + h/2) * zoom;
  const vp = els.viewport;
  vp.scrollLeft = cx - vp.clientWidth / 2;
  vp.scrollTop  = cy - vp.clientHeight / 2;
}

function normalize(str){
  return String(str ?? '').trim().toLowerCase();
}

function searchMatches(q){
  const needle = normalize(q);
  if (!needle) return [];
  const hits = [];
  for (const r of rows){
    const id = idOf(r);
    if (!id) continue;
    const hay = `${normalize(shortOf(r))} ${normalize(id)} ${normalize(r.amazon_alias ?? '')}`;
    if (hay.includes(needle)) hits.push(id);
  }
  return hits.sort(sortIds);
}

function setMatchHint(q){
  const hits = searchMatches(q);
  if (!q){
    els.matchHint.textContent = '';
    return;
  }
  els.matchHint.textContent = hits.length ? `Matches: ${hits.length}  (Enter to select)` : 'No matches';
}

<<<<<<< HEAD
=======
function applyDim(hits){
  const active = new Set(hits);
  for (const node of els.map.querySelectorAll('.node:not(.blank)')){
    node.classList.toggle('dimmed', active.size > 0 && !active.has(node.dataset.id));
  }
}

// ── Copy cells ────────────────────────────────────────────────────────────────

>>>>>>> parent of ab9be9c (poly lines)
function wireCopyCells(){
  for (const td of document.querySelectorAll('.copyCell')){
    td.addEventListener('click', async () => {
      const value = td.textContent.trim();
      if (!value){
        showToast('Nothing to copy');
        return;
      }
      const ok = await copyText(value);
      if (ok){
        const label = td.parentElement?.querySelector('th')?.textContent?.trim() || 'Copied';
        showToast(`Copied ${label}`);
      }
    });

    // keyboard
    td.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        td.click();
      }
    });
  }
}

function buildCopyAllText(){
  const lines = [];
  for (const tr of document.querySelectorAll('.infoTable tr')){
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    if (!th || !td) continue;
    const label = th.textContent.trim();
    const value = td.textContent.trim();
    lines.push(`${label}:\t${value}`);
  }
  return lines.join('\n');
}

async function load(){
  const res = await fetch('./data/conveyors-map.json', { cache:'no-store' });
  rows = await res.json();

<<<<<<< HEAD
  // stable ordering
  rows.sort((a,b) => sortIds(idOf(a), idOf(b)));
  render();
  wireCopyCells();
  setZoom(1, false);

  selectedId = rows[0] ? idOf(rows[0]) : null;
  if (selectedId) {
    select(selectedId, { center:false });
    els.search.value = shortOf(getRow(selectedId));
  }
}

// Events
let activeHits = [];
let activeIndex = 0;
=======
function buildLegend(){
  els.legendBody.innerHTML = '';
  const entries = [['unassigned', UNASSIGNED], ...Object.entries(CONVEYOR_TYPES)];
  for (const [, tc] of entries){
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

function makeDraggable(el, handle){
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

function clampPanel(el, left, top){
  const maxLeft = window.innerWidth  - el.offsetWidth;
  const maxTop  = window.innerHeight - el.offsetHeight;
  el.style.left = Math.max(0, Math.min(maxLeft, left)) + 'px';
  el.style.top  = Math.max(0, Math.min(maxTop,  top))  + 'px';
}

function initPanelPositions(){
  if (!els.legend || !els.minimap) return;
  const gap = 16, sidebarW = 340, topBarH = 40;

  Object.assign(els.legend.style, {
    left: (sidebarW + gap) + 'px', top: (topBarH + gap) + 'px',
    right: 'auto', bottom: 'auto',
  });
  Object.assign(els.minimap.style, {
    left:  (window.innerWidth  - MINI_W - gap - 4)  + 'px',
    top:   (window.innerHeight - MINI_H - 32 - gap) + 'px',
    right: 'auto', bottom: 'auto',
  });
}

function wireFloatPanels(){
  if (els.minimapHeader) makeDraggable(els.minimap, els.minimapHeader);
  if (els.legendHeader)  makeDraggable(els.legend,  els.legendHeader);

  if (els.minimapCanvas){
    els.minimapCanvas.addEventListener('click', (e) => {
      const rect = els.minimapCanvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / MINI_W) * MAP_W;
      const my = ((e.clientY - rect.top)  / MINI_H) * MAP_H;
      const vp = els.viewport;
      vp.scrollLeft = mx * zoom - vp.clientWidth  / 2;
      vp.scrollTop  = my * zoom - vp.clientHeight / 2;
    });
  }

  if (els.minimapToggle){
    els.minimapToggle.addEventListener('click', () => {
      minimapMinimized = !minimapMinimized;
      els.minimap.classList.toggle('minimized', minimapMinimized);
      els.minimapToggle.textContent = minimapMinimized ? '+' : '−';
      els.minimapToggle.title = minimapMinimized ? 'Expand' : 'Minimize';
      if (!minimapMinimized) drawMinimap();
    });
  }

  if (els.legendToggle){
    els.legendToggle.addEventListener('click', () => {
      legendMinimized = !legendMinimized;
      els.legend.classList.toggle('minimized', legendMinimized);
      els.legendToggle.textContent = legendMinimized ? '+' : '−';
      els.legendToggle.title = legendMinimized ? 'Expand' : 'Minimize';
    });
  }
}

// ── Drag to pan viewport ──────────────────────────────────────────────────────

let dragState = null;

els.viewport.addEventListener('mousedown', (e) => {
  if (e.target.closest('.node')) return;
  dragState = {
    startX: e.clientX, startY: e.clientY,
    scrollLeft: els.viewport.scrollLeft, scrollTop: els.viewport.scrollTop,
    moved: false,
  };
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  // Float panel drag takes priority
  if (panelDragState){
    const { el, startX, startY, origLeft, origTop } = panelDragState;
    clampPanel(el, origLeft + (e.clientX - startX), origTop + (e.clientY - startY));
    return;
  }
  if (!dragState) return;
  const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(dx, dy) > 4){
    dragState.moved = true;
    els.viewport.classList.add('dragging');
  }
  if (dragState.moved){
    els.viewport.scrollLeft = dragState.scrollLeft - dx;
    els.viewport.scrollTop  = dragState.scrollTop  - dy;
  }
});

window.addEventListener('mouseup', () => {
  panelDragState = null;
  if (dragState){ els.viewport.classList.remove('dragging'); dragState = null; }
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
  if (e.touches.length === 1){
    touchState = { type: 'pan',
      startX: e.touches[0].clientX, startY: e.touches[0].clientY,
      scrollLeft: els.viewport.scrollLeft, scrollTop: els.viewport.scrollTop };
  } else if (e.touches.length === 2){
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
  if (touchState.type === 'pan' && e.touches.length === 1){
    els.viewport.scrollLeft = touchState.scrollLeft - (e.touches[0].clientX - touchState.startX);
    els.viewport.scrollTop  = touchState.scrollTop  - (e.touches[0].clientY - touchState.startY);
  } else if (touchState.type === 'pinch' && e.touches.length === 2){
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY);
    setZoom(touchState.startZoom * (dist / touchState.startDist), true);
  }
  drawMinimap();
}, { passive: false });

els.viewport.addEventListener('touchend', () => { touchState = null; });

// ── Search events ─────────────────────────────────────────────────────────────

let activeHits = [], activeIndex = 0;
>>>>>>> parent of ab9be9c (poly lines)

function updateHits(){
  activeHits = searchMatches(els.search.value);
  activeIndex = 0;
  setMatchHint(els.search.value);
}

els.search.addEventListener('input', () => {
  updateHits();

  // If the user types an exact alias, jump immediately.
  const q = normalize(els.search.value);
  if (!q) return;
  const exact = rows.find(r => normalize(shortOf(r)) === q || normalize(idOf(r)) === q);
  if (exact) select(idOf(exact), { center:false });
});

els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter'){
    updateHits();
    if (activeHits.length){
      select(activeHits[Math.min(activeIndex, activeHits.length-1)], { center:false });
      showToast('Selected');
    }else{
      showToast('No matches');
    }
  }
  if (e.key === 'ArrowDown'){
    if (!activeHits.length) updateHits();
    if (activeHits.length){
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, activeHits.length - 1);
      select(activeHits[activeIndex], { center:false });
    }
  }
  if (e.key === 'ArrowUp'){
    if (!activeHits.length) updateHits();
    if (activeHits.length){
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      select(activeHits[activeIndex], { center:false });
    }
  }
  if (e.key === 'Escape'){
    els.search.value = '';
    els.matchHint.textContent = '';
    activeHits = [];
    activeIndex = 0;
  }
});

els.centerBtn.addEventListener('click', () => centerOnSelected());

els.zoomOutBtn.addEventListener('click', () => setZoom(zoom - 0.1));
els.zoomInBtn.addEventListener('click', () => setZoom(zoom + 0.1));
els.zoomResetBtn.addEventListener('click', () => setZoom(1));

els.copyAllBtn.addEventListener('click', async () => {
  const t = buildCopyAllText();
  const ok = await copyText(t);
  if (ok) showToast('Copied all fields');
});

// ctrl/cmd + click a conveyor to also copy the section alias quickly
els.map.addEventListener('click', async (e) => {
  const node = e.target.closest?.('.node');
<<<<<<< HEAD
  if (!node) return;
  if (!(e.ctrlKey || e.metaKey)) return;
=======
  if (!node || !(e.ctrlKey || e.metaKey)) return;
>>>>>>> parent of ab9be9c (poly lines)
  const id = node.dataset.id;
  if (!id) return;
  const r = getRow(id);
  const v = r ? shortOf(r) : id;
  await copyText(v);
  showToast('Copied Shortened Alias');
});

<<<<<<< HEAD
=======
els.viewport.addEventListener('scroll', drawMinimap);

// ── Load ──────────────────────────────────────────────────────────────────────

// Panel init runs immediately — separate from data load so errors don't kill the UI
buildLegend();
wireFloatPanels();
initPanelPositions();

async function load(){
  const res = await fetch('./data/conveyors-map.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  rows = await res.json();
  rows.sort((a, b) => sortIds(idOf(a), idOf(b)));

  render();
  wireCopyCells();
  setZoom(1, false);

  selectedId = rows[0] ? idOf(rows[0]) : null;
  if (selectedId){
    select(selectedId, { center: false });
    els.search.value = shortOf(getRow(selectedId));
  }

  drawMinimap();
}
>>>>>>> parent of ab9be9c (poly lines)

load().catch(err => {
  console.error(err);
  showToast('Failed to load conveyors.json');
});
