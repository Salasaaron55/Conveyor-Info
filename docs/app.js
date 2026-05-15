// ---- Data + render ----
let DATA = [];
let currentSortKey = "section_alias";
let currentSortDir = "asc";

// ---- UI state (persisted) ----
const STORAGE_COL_ORDER = "conveyor_col_order_pages_v1";
const STORAGE_COL_VIS = "conveyor_col_visibility_v1";
const STORAGE_VIEW_MODE = "conveyor_view_mode_v1";

function headerRowEl() {
  return document.getElementById("header-row");
}
function tableEl() {
  return document.getElementById("equip-table");
}
function viewportEl() {
  return document.getElementById("table-viewport");
}

function currentOrderKeys() {
  return Array.from(headerRowEl().cells).map((th) => th.dataset.key);
}
function keyToLabel(key) {
  const th = headerRowEl().querySelector(`th[data-key="${key}"]`);
  return (th?.innerText || th?.textContent || key).trim() || key;
}

function loadHiddenKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_COL_VIS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveHiddenKeys(hiddenSet) {
  localStorage.setItem(STORAGE_COL_VIS, JSON.stringify(Array.from(hiddenSet)));
}

function applyHiddenKeys(hiddenSet) {
  const keys = currentOrderKeys();
  // header
  keys.forEach((key, idx) => {
    const th = headerRowEl().cells[idx];
    if (!th) return;
    th.classList.toggle("is-hidden", hiddenSet.has(key));
  });
  // body
  for (const tr of tableEl().tBodies[0].rows) {
    keys.forEach((key, idx) => {
      const td = tr.cells[idx];
      if (!td) return;
      td.classList.toggle("is-hidden", hiddenSet.has(key));
    });
  }
}

function setViewMode(mode) {
  const vp = viewportEl();
  vp.classList.toggle("fit-screen", mode === "fit-screen");
  localStorage.setItem(STORAGE_VIEW_MODE, mode);
  updateHScroll();
}

function updateHScroll() {
  const vp = viewportEl();
  const hs = document.getElementById("hscroll");
  const inner = document.getElementById("hscroll-inner");
  const table = tableEl();

  const needed = table.scrollWidth > vp.clientWidth + 2;
  hs.style.display = needed ? "block" : "none";
  inner.style.width = table.scrollWidth + "px";
}

function setupScrollSync() {
  const vp = viewportEl();
  const hs = document.getElementById("hscroll");
  let syncing = false;

  vp.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    hs.scrollLeft = vp.scrollLeft;
    syncing = false;
  });
  hs.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    vp.scrollLeft = hs.scrollLeft;
    syncing = false;
  });
}

function buildColumnsPanel() {
  const grid = document.getElementById("columns-grid");
  const hidden = loadHiddenKeys();
  grid.innerHTML = "";

  for (const key of currentOrderKeys()) {
    const label = keyToLabel(key);
    const id = "col-toggle-" + key;
    const item = document.createElement("label");
    item.className = "col-item";
    item.innerHTML = `
      <input type="checkbox" id="${id}" ${hidden.has(key) ? "" : "checked"} />
      <span>${label}</span>
    `;
    item.querySelector("input").addEventListener("change", (e) => {
      const isOn = e.target.checked;
      if (isOn) hidden.delete(key);
      else hidden.add(key);
      saveHiddenKeys(hidden);
      applyHiddenKeys(hidden);
      updateHScroll();
    });
    grid.appendChild(item);
  }

  document.getElementById("cols-show-all").onclick = () => {
    hidden.clear();
    saveHiddenKeys(hidden);
    buildColumnsPanel();
    applyHiddenKeys(hidden);
    updateHScroll();
  };
  document.getElementById("cols-hide-all").onclick = () => {
    for (const key of currentOrderKeys()) hidden.add(key);
    saveHiddenKeys(hidden);
    buildColumnsPanel();
    applyHiddenKeys(hidden);
    updateHScroll();
  };
}

async function loadData() {
  try {
    const res = await fetch("./data/conveyors.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load data (" + res.status + ")");
    DATA = await res.json();
    render();
  } catch (err) {
    const el = document.getElementById("err");
    el.textContent =
      "Error: " +
      err.message +
      ". Make sure docs/data/conveyors.json exists in the repository.";
    el.style.display = "";
  }
}

function render() {
  const tbody = document.querySelector("#equip-table tbody");
  const q = (document.getElementById("filter-box").value || "").toLowerCase();

  const filtered = DATA.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(q),
  );

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  filtered.sort((a, b) => {
    const A = (a[currentSortKey] ?? "").toString();
    const B = (b[currentSortKey] ?? "").toString();
    const cmp = collator.compare(A, B);
    return currentSortDir === "asc" ? cmp : -cmp;
  });

  const keys = currentOrderKeys();
  tbody.innerHTML = "";
  for (const r of filtered) {
    const tr = document.createElement("tr");
    for (const key of keys) {
      const td = document.createElement("td");
      let val = (r?.[key] ?? "").toString();
      if (key === "shortened_alias" && !val.trim()) val = (r?.section_alias ?? "").toString();
      td.textContent = val;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  document.getElementById("row-count").textContent = filtered.length;

  applyHiddenKeys(loadHiddenKeys());
  updateHScroll();
}

function sortBy(key) {
  if (currentSortKey === key) {
    currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
  } else {
    currentSortKey = key;
    currentSortDir = "asc";
  }
  render();
}

// Make sortBy callable from your inline onclick="" in the table headers
window.sortBy = sortBy;

// ---- Drag-to-reorder columns (persist in localStorage) ----
(function () {
  const table = document.getElementById("equip-table");
  const theadRow = document.getElementById("header-row");

  function moveColumn(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const th = theadRow.cells[fromIndex];
    if (toIndex < theadRow.cells.length) theadRow.insertBefore(th, theadRow.cells[toIndex]);
    else theadRow.appendChild(th);

    for (const tr of table.tBodies[0].rows) {
      const td = tr.cells[fromIndex];
      if (toIndex < tr.cells.length) tr.insertBefore(td, tr.cells[toIndex]);
      else tr.appendChild(td);
    }
  }

  let dragStartIndex = null;
  for (const th of theadRow.cells) {
    th.addEventListener("dragstart", () => {
      dragStartIndex = Array.prototype.indexOf.call(theadRow.cells, th);
      th.style.opacity = "0.5";
    });
    th.addEventListener("dragover", (e) => e.preventDefault());
    th.addEventListener("drop", (e) => {
      e.preventDefault();
      const dropIndex = Array.prototype.indexOf.call(theadRow.cells, th);
      moveColumn(dragStartIndex, dropIndex);
      saveOrder();
      applyHiddenKeys(loadHiddenKeys());
      buildColumnsPanel();
      updateHScroll();
    });
    th.addEventListener("dragend", () => {
      th.style.opacity = "";
    });
  }

  function saveOrder() {
    localStorage.setItem(STORAGE_COL_ORDER, JSON.stringify(currentOrderKeys()));
  }

  (function applySavedOrder() {
    const saved = localStorage.getItem(STORAGE_COL_ORDER);
    if (!saved) return;
    const keys = JSON.parse(saved);
    keys.forEach((key, targetIndex) => {
      const currentIndex = Array.prototype.indexOf.call(
        theadRow.cells,
        theadRow.querySelector(`th[data-key="${key}"]`),
      );
      if (currentIndex !== -1 && currentIndex !== targetIndex) {
        moveColumn(currentIndex, targetIndex);
      }
    });

    applyHiddenKeys(loadHiddenKeys());
    buildColumnsPanel();
    updateHScroll();
  })();
})();

// ---- Back to top ----
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.scrollToTop = scrollToTop;

function updateBackToTopVisibility() {
  const btn = document.getElementById("backToTop");
  if (!btn) return;

  if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
    btn.style.display = "block";
  } else {
    btn.style.display = "none";
  }
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("filter-box").addEventListener("input", render);

  const savedMode = localStorage.getItem(STORAGE_VIEW_MODE) || "fit-rows";
  const viewSel = document.getElementById("view-mode");
  viewSel.value = savedMode;
  setViewMode(savedMode);
  viewSel.addEventListener("change", () => setViewMode(viewSel.value));

  const panel = document.getElementById("columns-panel");
  const openBtn = document.getElementById("columns-btn");
  const closeBtn = document.getElementById("cols-close");

  function openPanel() {
    panel.style.display = "";
    buildColumnsPanel();
    applyHiddenKeys(loadHiddenKeys());
    updateHScroll();
  }
  function closePanel() {
    panel.style.display = "none";
  }

  openBtn.addEventListener("click", () => {
    const isOpen = panel.style.display !== "none";
    if (isOpen) closePanel();
    else openPanel();
  });
  closeBtn.addEventListener("click", closePanel);

  setupScrollSync();
  buildColumnsPanel();
  applyHiddenKeys(loadHiddenKeys());
  updateHScroll();

  window.addEventListener("resize", updateHScroll);
  window.addEventListener("scroll", updateBackToTopVisibility);
  updateBackToTopVisibility();

  loadData();
});
