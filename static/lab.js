// ── State ──────────────────────────────────────────────────────
let words = [];
let categories = [];
let categoryFilter = null; // null = all, '' = no category, 'name' = filter by category
let practiceQueue = [];
let practiceIndex = 0;
let editingIndex = null;
let bookmarkedWords = JSON.parse(localStorage.getItem('bookmarkedWords') || '[]');

function saveBookmarks() {
  localStorage.setItem('bookmarkedWords', JSON.stringify(bookmarkedWords));
}

function isBookmarked(english) {
  return bookmarkedWords.includes(english);
}

function toggleBookmark(english) {
  const i = bookmarkedWords.indexOf(english);
  if (i === -1) {
    bookmarkedWords.push(english);
  } else {
    bookmarkedWords.splice(i, 1);
  }
  saveBookmarks();
}

// ── Auto-sync categoryFilter → add-category selects ───────────
function syncAddCategorySelects() {
  const val = categoryFilter || '';
  const addSel = document.getElementById('add-category');
  const fnSel = document.getElementById('fn-add-category');
  if (addSel) addSel.value = val;
  if (fnSel) fnSel.value = val;
}

// ── Categories ─────────────────────────────────────────────────
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    categories = data.categories || [];
    renderCategoryBar();
    updateCategorySelects();
  } catch (e) {
    console.error('Failed to load categories:', e);
  }
}

function renderCategoryBar() {
  const container = document.getElementById('category-badges');
  if (!container) return;
  container.innerHTML = categories.map(c => `
    <div class="category-badge ${categoryFilter === c.name ? 'active' : ''}" data-cat="${escHtml(c.name)}" title="${escHtml(c.description || '')}">
      <span class="cat-name">${escHtml(c.name)}</span>
      <button class="cat-delete" data-cat="${escHtml(c.name)}" title="Delete category">&times;</button>
    </div>
  `).join('');

  // Update filter button states — use individual checks to avoid double-toggle
  const allBtn = document.querySelector('.cat-filter-btn[data-cat="all"]');
  const noneBtn = document.querySelector('.cat-filter-btn[data-cat=""]');
  if (allBtn) allBtn.classList.toggle('active', categoryFilter === null);
  if (noneBtn) noneBtn.classList.toggle('active', categoryFilter === '');

  // Add click handlers to badges
  container.querySelectorAll('.category-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      if (e.target.classList.contains('cat-delete')) return;
      categoryFilter = badge.dataset.cat;
      renderCategoryBar();
      syncAddCategorySelects();
      renderList(document.getElementById('search-input').value);
    });
  });

  // Add delete handlers
  container.querySelectorAll('.cat-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCategory(btn.dataset.cat);
    });
  });
}

function updateCategorySelects() {
  // Update edit modal category dropdown
  const editSelect = document.getElementById('edit-category');
  if (editSelect) {
    const currentVal = editSelect.value;
    editSelect.innerHTML = '<option value="">No Category</option>' +
      categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('');
    editSelect.value = currentVal;
  }

  // Update bulk move select dropdown
  const moveSelect = document.getElementById('bulk-move-select');
  if (moveSelect) {
    const currentVal = moveSelect.value;
    moveSelect.innerHTML = '<option value="">— Select Category —</option>' +
      '<option value="__none__">No Category</option>' +
      categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('');
    moveSelect.value = currentVal;
  }

  // Update add word category dropdown
  const addSelect = document.getElementById('add-category');
  if (addSelect) {
    const currentVal = addSelect.value;
    addSelect.innerHTML = '<option value="">No Category</option>' +
      categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('');
    addSelect.value = currentVal;
  }
}

async function createCategory(name, description) {
  try {
    const res = await fetchWithRetry('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok) {
      showAlert('cat-alert', data.error || 'Failed to create category.', 'error');
      return false;
    }
    categories.push(data.category);
    renderCategoryBar();
    updateCategorySelects();
    showToast(`Category "${name}" created`, 'success');
    return true;
  } catch (e) {
    showAlert('cat-alert', 'Network error: ' + e.message, 'error');
    return false;
  }
}

async function deleteCategory(name) {
  if (!confirm(`Delete category "${name}"? Words in this category will have no category.`)) return;

  try {
    const res = await fetchWithRetry(`/api/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to delete category.', 'error');
      return;
    }

    categories = categories.filter(c => c.name !== name);
    // Clear category from local words
    words.forEach(w => {
      if (w.category === name) w.category = null;
    });
    if (categoryFilter === name) categoryFilter = null;
    renderCategoryBar();
    renderList(document.getElementById('search-input').value);
    showToast(`Category "${name}" deleted`, 'success');
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

async function moveWordsToCategory(indices, categoryName) {
  const cat = categoryName || null;
  const catLabel = cat ? `"${cat}"` : "No Category";

  // Optimistic: update local state
  indices.forEach(i => {
    words[i].category = cat;
  });
  renderList(document.getElementById('search-input').value);

  try {
    const res = await fetchWithRetry('/api/words/move-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indices, category: cat })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Move failed.', 'error');
      // Revert
      indices.forEach(i => {
        words[i].category = words[i].category === cat ? null : cat;
      });
      renderList(document.getElementById('search-input').value);
    } else {
      showToast(`${indices.length} word(s) moved to ${catLabel}`, 'success');
    }
  } catch (e) {
    showToast('Move failed: ' + e.message, 'error');
    indices.forEach(i => {
      words[i].category = words[i].category === cat ? null : cat;
    });
    renderList(document.getElementById('search-input').value);
  }
}

// ── Helpers ────────────────────────────────────────────────────
const RETRY_MAX = 3;
const RETRY_DELAY = 3000; // ms

async function fetchWithRetry(url, options = {}, retries = RETRY_MAX) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      const wait = RETRY_DELAY / 1000;
      showToast(`Network error — retrying in ${wait}s… (${i}/${retries})`, 'warn');
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
}

function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `pointer-events:auto;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;color:#fff;background:${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : type === 'warn' ? '#f59e0b' : '#3b82f6'};box-shadow:0 4px 12px rgba(0,0,0,.25);opacity:0;transform:translateY(-10px);transition:opacity .25s,transform .25s;max-width:360px;word-wrap:break-word;`;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = msg;
  if (id === 'add-alert' || id === 'fn-add-alert') {
    el.className = `inline-add-alert show alert-${type === 'success' ? 'success' : type === 'warn' ? 'warn' : 'error'}`;
  } else {
    el.className = `alert show alert-${type === 'success' ? 'success' : type === 'warn' ? 'warn' : 'error'}`;
  }
  setTimeout(() => {
    if (id === 'add-alert' || id === 'fn-add-alert') {
      el.className = 'inline-add-alert';
    } else {
      el.className = 'alert';
    }
  }, 80000);
}

function updateHeaderCount() {
  const c = words.length;
  document.getElementById('header-count').textContent = `${c} word${c !== 1 ? 's' : ''} saved`;
}

// ── Tabs ───────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'practice') initPractice();
  });
});

// ── Render word list ───────────────────────────────────────────
function renderList(filter = '') {
  const list = document.getElementById('word-list');
  const f = filter.toLowerCase().trim();
  let filtered = f
    ? words.filter(w => w.english.toLowerCase().includes(f) || w.persian.includes(f) || (w.category && w.category.toLowerCase().includes(f)))
    : words;

  if (bookmarkFilter === 'bookmarked') {
    filtered = filtered.filter(w => isBookmarked(w.english));
  } else if (bookmarkFilter === 'unbookmarked') {
    filtered = filtered.filter(w => !isBookmarked(w.english));
  }

  // Category filter
  if (categoryFilter !== null) {
    if (categoryFilter === '') {
      // "No Category" — show words with null, undefined, or empty category
      filtered = filtered.filter(w => !w.category);
    } else {
      filtered = filtered.filter(w => w.category === categoryFilter);
    }
  }

  if (!filtered.length) {
    const msg = f ? 'No matches found.' : bookmarkFilter === 'bookmarked' ? 'No bookmarked words yet.' : bookmarkFilter === 'unbookmarked' ? 'All words are bookmarked.' : 'No words yet — add one below!';
    list.innerHTML = `<div class="no-words">${msg}</div>`;
    return;
  }

  list.innerHTML = filtered.map((w, i) => {
    const realIndex = words.indexOf(w);
    const alts = w.alternatives || [];
    const altHtml = alts.length
      ? `<div class="word-alts" id="alts-${realIndex}">
           ${alts.map(a => `<div class="word-alt-item">- ${escHtml(a)}</div>`).join('')}
         </div>`
      : '';
    const altCheckHtml = alts.length
      ? `<span class="word-alt-arrow" data-index="${realIndex}" title="Show alternatives"></span>`
      : '';
    const checkboxHtml = selectMode
      ? `<input type="checkbox" class="word-checkbox" data-index="${realIndex}" ${selectedIndices.has(realIndex) ? 'checked' : ''} />`
      : '';
    const selectedClass = selectMode && selectedIndices.has(realIndex) ? ' selected' : '';
    return `
      <div class="word-row-wrap">
        <div class="word-row${selectedClass}" data-index="${realIndex}">
          ${checkboxHtml}
          <span class="word-index">${realIndex + 1}</span>
          ${altCheckHtml}
          <span class="word-en">${escHtml(w.english)}</span>
          <span class="word-fa">${w.isGenerating ? renderGeneratingWave() : escHtml(w.persian)}</span>
          <div class="word-actions">
            <button class="btn btn-speak-row btn-sm" data-word="${escHtml(w.english)}" title="Listen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm edit-btn" data-index="${realIndex}">Edit</button>
            <button class="btn btn-danger btn-sm delete-btn" data-index="${realIndex}">✕</button>
          </div>
        </div>
        ${altHtml}
      </div>`;
  }).join('');

  list.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', () => openEdit(+b.dataset.index)));
  list.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', () => deleteWord(+b.dataset.index)));
  list.querySelectorAll('.word-alt-arrow').forEach(b => {
    b.addEventListener('click', () => {
      const idx = b.dataset.index;
      const altsEl = document.getElementById('alts-' + idx);
      if (!altsEl) return;
      const isOpen = altsEl.classList.toggle('open');
      b.classList.toggle('open', isOpen);
    });
  });
  list.querySelectorAll('.word-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = +cb.dataset.index;
      if (cb.checked) {
        selectedIndices.add(idx);
      } else {
        selectedIndices.delete(idx);
      }
      cb.closest('.word-row').classList.toggle('selected', cb.checked);
      updateBulkCount();
    });
  });
  list.querySelectorAll('.btn-speak-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      speakWord(btn.dataset.word);
    });
  });
  list.querySelectorAll('.word-row').forEach(row => {
    const enEl = row.querySelector('.word-en');
    if (!enEl || enEl.dataset.segBound === '1') return;
    enEl.dataset.segBound = '1';
    const rawText = enEl.textContent;
    let segmented = false;
    function doSegment() {
      if (segmented) return;
      segmented = true;
      enEl.innerHTML = segmentEnglish(rawText);
      const isTouch = 'ontouchstart' in window;
      enEl.querySelectorAll('.word-segment').forEach(span => {
        if (isTouch) {
          // Mobile: double-tap or long-press to open popup
          let lastTap = 0;
          let longPressTimer = null;
          span.addEventListener('touchstart', (e) => {
            if (typeof window._segTap === 'function') window._segTap();
            const now = Date.now();
            if (now - lastTap < 300) {
              // Double-tap detected
              e.preventDefault();
              e.stopPropagation();
              clearTimeout(longPressTimer);
              openWordPopup(span.dataset.word);
              lastTap = 0;
              return;
            }
            lastTap = now;
            // Start long-press timer
            longPressTimer = setTimeout(() => {
              e.preventDefault();
              e.stopPropagation();
              openWordPopup(span.dataset.word);
            }, 500);
          }, { passive: false });
          span.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
          });
          span.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
          });
        } else {
          // Desktop: double-click to open popup
          span.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openWordPopup(span.dataset.word);
          });
        }
      });
    }
    row.addEventListener('mouseenter', doSegment);
    row.addEventListener('touchstart', doSegment, { passive: true });
  });
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const RAINBOW_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#0ABDE3', '#A29BFE',
  '#6C5CE7', '#FD79A8', '#FDCB6E', '#00CEC9', '#E17055', '#74B9FF'
];

function renderGeneratingWave() {
  const text = 'GENERATE';
  const chars = text.split('');
  const total = chars.length;
  const maxDelay = 1.6;
  const step = total > 1 ? maxDelay / (total - 1) : 0;

  const spans = chars.map((ch, i) => {
    const color = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
    const delay = (i * step).toFixed(2);
    return `<span style="color:${color};text-shadow:0 0 12px ${color}80,0 0 40px ${color}40;animation-delay:${delay}s">${ch}</span>`;
  }).join('');

  return `<span class="wave-generating">${spans}</span>`;
}

// ── Word segmentation (lazy — on hover only) ───────────────
const wordSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('en', { granularity: 'word' })
  : null;

function segmentEnglish(text) {
  if (!wordSegmenter || !text) return escHtml(text);
  const segments = [...wordSegmenter.segment(text)];
  return segments.map(seg => {
    if (seg.isWordLike) {
      return `<span class="word-segment" data-word="${escHtml(seg.segment)}">${escHtml(seg.segment)}</span>`;
    }
    return escHtml(seg.segment);
  }).join('');
}

let bookmarkFilter = 'all'; // 'all' | 'bookmarked' | 'unbookmarked'
let selectMode = false;
let selectedIndices = new Set();

document.getElementById('search-input').addEventListener('input', e => renderList(e.target.value));
document.getElementById('bookmark-filter-btn').addEventListener('click', () => {
  const cycle = ['all', 'bookmarked', 'unbookmarked'];
  bookmarkFilter = cycle[(cycle.indexOf(bookmarkFilter) + 1) % cycle.length];
  const labels = { all: '🔖 All', bookmarked: '🔖 Bookmarked', unbookmarked: '🔖 Unbookmarked' };
  document.getElementById('bookmark-filter-btn').textContent = labels[bookmarkFilter];
  renderList(document.getElementById('search-input').value);
});

// ── Category filter bar ─────────────────────────────────────────
document.querySelectorAll('.cat-filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const cat = btn.dataset.cat;
    categoryFilter = cat === 'all' ? null : cat;
    renderCategoryBar();
    syncAddCategorySelects();
    renderList(document.getElementById('search-input').value);
  });
});

// ── Auto-filter library when category is selected in Add Word section ──
function onAddCategoryChange(e) {
  const val = e.target.value;
  categoryFilter = val || null;
  renderCategoryBar();
  renderList(document.getElementById('search-input').value);
}
document.getElementById('add-category').addEventListener('change', onAddCategoryChange);
document.getElementById('fn-add-category').addEventListener('change', (e) => {
  onAddCategoryChange(e);
  // Open floating add panel when category is selected
  const panel = document.getElementById('fn-add-panel');
  const toggle = document.getElementById('fn-add-toggle');
  if (!panel.classList.contains('open')) {
    panel.classList.add('open');
    toggle.classList.add('active');
  }
});

// Category modal
document.getElementById('create-category-btn').addEventListener('click', () => {
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-desc').value = '';
  document.getElementById('cat-alert').className = 'alert';
  document.getElementById('category-modal').classList.add('open');
  document.getElementById('cat-name').focus();
});

document.getElementById('cat-modal-cancel').addEventListener('click', () => {
  document.getElementById('category-modal').classList.remove('open');
});

document.getElementById('category-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('category-modal'))
    document.getElementById('category-modal').classList.remove('open');
});

document.getElementById('cat-modal-save').addEventListener('click', async () => {
  const name = document.getElementById('cat-name').value.trim();
  const description = document.getElementById('cat-desc').value.trim();
  if (!name) {
    showAlert('cat-alert', 'Category name is required.', 'error');
    return;
  }
  const success = await createCategory(name, description);
  if (success) {
    document.getElementById('category-modal').classList.remove('open');
  }
});

document.getElementById('cat-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('cat-modal-save').click();
});

document.getElementById('export-btn').addEventListener('click', () => {
  if (!words.length) return;
  const text = words.map(w => `${w.english} = ${w.persian}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vocabulary.txt';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Select mode & bulk delete ──────────────────────────────────
document.getElementById('select-toggle-btn').addEventListener('click', () => {
  selectMode = !selectMode;
  selectedIndices.clear();
  const btn = document.getElementById('select-toggle-btn');
  btn.textContent = selectMode ? 'Done' : 'Select';
  btn.classList.toggle('active', selectMode);
  document.getElementById('bulk-actions').style.display = selectMode ? 'flex' : 'none';
  updateBulkCount();
  renderList(document.getElementById('search-input').value);
});

document.getElementById('bulk-cancel-btn').addEventListener('click', () => {
  selectMode = false;
  selectedIndices.clear();
  document.getElementById('select-toggle-btn').textContent = 'Select';
  document.getElementById('select-toggle-btn').classList.remove('active');
  document.getElementById('bulk-actions').style.display = 'none';
  renderList(document.getElementById('search-input').value);
});

function updateBulkCount() {
  document.getElementById('bulk-count').textContent = `${selectedIndices.size} selected`;
  const fnCount = document.getElementById('fn-select-count');
  if (fnCount) fnCount.textContent = `${selectedIndices.size} selected`;
}

document.getElementById('bulk-delete-btn').addEventListener('click', async () => {
  if (!selectedIndices.size) return;
  const count = selectedIndices.size;
  if (!confirm(`Delete ${count} word${count !== 1 ? 's' : ''}?`)) return;

  const indices = [...selectedIndices].sort((a, b) => b - a);
  const removed = indices.map(i => words[i]);

  // Optimistic: remove from local state
  indices.forEach(i => words.splice(i, 1));
  selectedIndices.clear();
  selectMode = false;
  document.getElementById('select-toggle-btn').textContent = 'Select';
  document.getElementById('select-toggle-btn').classList.remove('active');
  document.getElementById('bulk-actions').style.display = 'none';
  renderList(document.getElementById('search-input').value);
  updateHeaderCount();
  showToast(`Deleted ${count} word${count !== 1 ? 's' : ''}`, 'success');

  // Fire delete in background
  try {
    const res = await fetchWithRetry('/api/words/delete-multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indices: indices.map(i => i) })
    });
    const data = await res.json();
    if (!res.ok) {
      // Revert
      removed.forEach((w, i) => words.splice(indices[i], 0, w));
      renderList(document.getElementById('search-input').value);
      updateHeaderCount();
      showToast(data.error || 'Delete failed — words restored.', 'error');
    }
  } catch (e) {
    removed.forEach((w, i) => words.splice(indices[i], 0, w));
    renderList(document.getElementById('search-input').value);
    updateHeaderCount();
    showToast('Delete failed — words restored: ' + e.message, 'error');
  }
});

// ── Bulk move to category (instant on select) ──────────────────
document.getElementById('bulk-move-select').addEventListener('change', async (e) => {
  if (!selectedIndices.size || e.target.value === '') return;
  const category = e.target.value === '__none__' ? null : e.target.value;
  const indices = [...selectedIndices];
  await moveWordsToCategory(indices, category);
  // Reset select mode after move
  selectMode = false;
  selectedIndices.clear();
  e.target.value = '';
  document.getElementById('select-toggle-btn').textContent = 'Select';
  document.getElementById('select-toggle-btn').classList.remove('active');
  document.getElementById('bulk-actions').style.display = 'none';
  renderList(document.getElementById('search-input').value);
});

// ── Add word (inline at end of list) ───────────────────────────
document.getElementById('add-btn').addEventListener('click', async () => {
  const en = document.getElementById('add-en').value.trim();
  const fa = document.getElementById('add-fa').value.trim();
  const aiGen = document.getElementById('add-aigen').checked;
  const alts = document.getElementById('add-alts').value.trim();
  const styleEnabled = document.getElementById('add-style-toggle').checked;
  const style = styleEnabled ? document.getElementById('add-style').value : '';
  const customStyle = styleEnabled ? document.getElementById('add-style-custom').value.trim() : '';
  const addCategory = document.getElementById('add-category').value || null;
  if (!en) { showAlert('add-alert', 'English field is required.'); return; }
  if (!aiGen && !fa) { showAlert('add-alert', 'Persian field is required.'); return; }

  // Optimistic: show placeholder word immediately
  const placeholder = { english: en, persian: fa || '(generating…)', alternatives: [], category: addCategory, isGenerating: !fa };
  words.push(placeholder);
  renderList(document.getElementById('search-input').value);
  updateHeaderCount();
  document.getElementById('add-en').value = '';
  document.getElementById('add-fa').value = '';
  document.getElementById('add-alts').value = '';

  const rows = document.querySelectorAll('.word-row');
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    lastRow.style.background = 'var(--accent-lt)';
    setTimeout(() => { lastRow.style.background = ''; }, 1200);
  }

  showToast(`Adding "${en}"…`, 'info');

  try {
    const res = await fetchWithRetry('/api/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ english: en, persian: fa, aigen: aiGen, alternatives: alts, style: style, custom_style: customStyle, category: addCategory })
    });
    const data = await res.json();

    if (!res.ok) {
      // Revert optimistic update
      words.pop();
      renderList(document.getElementById('search-input').value);
      updateHeaderCount();
      showAlert('add-alert', data.error);
      return;
    }

    // Replace placeholder with server response
    words[words.length - 1] = data.word;
    renderList(document.getElementById('search-input').value);
    showAlert('add-alert', `"${data.word.english}" added!`, 'success');
    showToast(`Added "${data.word.english}"`, 'success');
  } catch (e) {
    // Revert on network failure
    words.pop();
    renderList(document.getElementById('search-input').value);
    updateHeaderCount();
    showAlert('add-alert', 'Network error — please try again.', 'error');
    showToast('Add failed: ' + e.message, 'error');
  }

  document.getElementById('add-en').focus();
});
// Enter key support for inline add
['add-en', 'add-fa'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-btn').click();
  });
});

// ── Advanced toggle ─────────────────────────────────────────
document.getElementById('advanced-toggle').addEventListener('click', () => {
  const section = document.getElementById('advanced-section');
  const arrow = document.getElementById('advanced-arrow');
  const isOpen = section.classList.toggle('open');
  arrow.classList.toggle('open', isOpen);
});

// ── Writing style toggle ────────────────────────────────────
document.getElementById('add-style-toggle').addEventListener('change', (e) => {
  document.getElementById('style-options').classList.toggle('visible', e.target.checked);
});

// ── Delete word ────────────────────────────────────────────────
function deleteWord(index) {
  const removed = words[index];

  // Optimistic: remove instantly
  words.splice(index, 1);
  renderList(document.getElementById('search-input').value);
  updateHeaderCount();
  showToast(`Deleted "${removed.english}"`, 'success');

  // Fire delete in background
  fetchWithRetry(`/api/words/${index}`, { method: 'DELETE' })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json();
        // Revert: re-insert at original position
        words.splice(index, 0, removed);
        renderList(document.getElementById('search-input').value);
        updateHeaderCount();
        showToast(data.error || 'Delete failed — word restored.', 'error');
      }
    })
    .catch(e => {
      words.splice(index, 0, removed);
      renderList(document.getElementById('search-input').value);
      updateHeaderCount();
      showToast('Delete failed — word restored: ' + e.message, 'error');
    });
}

// ── Edit modal ─────────────────────────────────────────────────
function openEdit(index) {
  editingIndex = index;
  document.getElementById('edit-en').value = words[index].english;
  document.getElementById('edit-fa').value = words[index].persian;
  document.getElementById('edit-alts').value = (words[index].alternatives || []).join('\n');
  // Set category dropdown
  const editSelect = document.getElementById('edit-category');
  if (editSelect) {
    editSelect.value = words[index].category || '';
  }
  document.getElementById('edit-modal').classList.add('open');
  document.getElementById('edit-en').focus();
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('edit-modal').classList.remove('open');
});
document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal'))
    document.getElementById('edit-modal').classList.remove('open');
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const en = document.getElementById('edit-en').value.trim();
  const fa = document.getElementById('edit-fa').value.trim();
  const alts = document.getElementById('edit-alts').value.trim();
  const category = document.getElementById('edit-category').value || null;
  if (!en || !fa) { showAlert('edit-alert', 'Fill in both fields.'); return; }

  const idx = editingIndex;
  const oldWord = { ...words[idx] };

  // Optimistic: update local state, close modal instantly
  const updated = { english: en, persian: fa, alternatives: alts ? alts.split('\n').map(s => s.trim()).filter(Boolean) : [], category };
  words[idx] = updated;
  document.getElementById('edit-modal').classList.remove('open');
  renderList(document.getElementById('search-input').value);
  showToast(`Updated "${en}"`, 'success');

  // Fire PUT in background
  fetchWithRetry(`/api/words/${idx}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ english: en, persian: fa, alternatives: alts, category })
  })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json();
        words[idx] = oldWord;
        renderList(document.getElementById('search-input').value);
        showToast(data.error || 'Edit failed — reverted.', 'error');
      }
    })
    .catch(e => {
      words[idx] = oldWord;
      renderList(document.getElementById('search-input').value);
      showToast('Edit failed — reverted: ' + e.message, 'error');
    });
});

document.getElementById('modal-aigen').addEventListener('click', async () => {
  const btn = document.getElementById('modal-aigen');
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';

  try {
    const res = await fetchWithRetry(`/api/aigen/${editingIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_edit: true })
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert('edit-alert', data.error || 'Generation failed.', 'error');
      return;
    }

    // Reload the updated word from server state
    const wordsRes = await fetchWithRetry('/api/words');
    if (wordsRes.ok) {
      const wordsData = await wordsRes.json();
      words = (wordsData.words ?? wordsData).map(w =>
        Array.isArray(w) ? { english: w[0], persian: w[1], alternatives: [], category: null } : { ...w, alternatives: w.alternatives || [], category: w.category || null }
      );
    }

    // Refresh modal fields with new values
    document.getElementById('edit-en').value = words[editingIndex].english;
    document.getElementById('edit-fa').value = words[editingIndex].persian;
    document.getElementById('edit-alts').value = (words[editingIndex].alternatives || []).join('\n');
    document.getElementById('edit-category').value = words[editingIndex].category || '';

    // Refresh the word list in the background
    renderList(document.getElementById('search-input').value);

    showAlert('edit-alert', 'Sentence generated!', 'success');
    showToast('New sentence generated', 'success');
  } catch (e) {
    showAlert('edit-alert', 'Network error: ' + e.message, 'error');
    showToast('Generation failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Generate Sentence';
  }
});

document.getElementById('import-btn').addEventListener('click', async () => {
  const text = document.getElementById('import-text').value;
  if (!text.trim()) { showAlert('import-alert', 'Paste some words first.'); return; }

  const btn = document.getElementById('import-btn');
  btn.disabled = true;
  btn.textContent = 'Importing…';

  try {
    const res = await fetchWithRetry('/api/words/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();

    if (!res.ok) { showAlert('import-alert', data.error); return; }

    words.push(...data.added);
    renderList();
    updateHeaderCount();
    document.getElementById('import-text').value = '';

    let msg = `Added ${data.added_count} word${data.added_count !== 1 ? 's' : ''}.`;
    let type = 'success';
    if (data.duplicates.length) {
      msg += ` ${data.duplicates.length} duplicate${data.duplicates.length > 1 ? 's' : ''} skipped.`;
      type = 'warn';
    }
    if (data.errors.length) msg += ` ${data.errors.length} line${data.errors.length > 1 ? 's' : ''} had errors.`;
    showAlert('import-alert', msg, type);
    showToast(msg, data.added_count > 0 ? 'success' : 'warn');
  } catch (e) {
    showAlert('import-alert', 'Network error — please try again.', 'error');
    showToast('Import failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import';
  }
});

// ── Speech synthesis ───────────────────────────────────────────
function speakWord(word) {
  if (!word || word.trim() === '') return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(word.trim());
  utterance.lang = 'en-US';
  utterance.rate = 0.8;

  const voices = speechSynthesis.getVoices();

  const preferredVoices = [
    'Google US English',
    'Google UK English Female',
    'Samantha',
    'Alex',
    'Microsoft Zira'
  ];

  let selectedVoice = null;

  for (const preferred of preferredVoices) {
    selectedVoice = voices.find(voice => voice.name.includes(preferred));
    if (selectedVoice) break;
  }

  if (!selectedVoice) {
    selectedVoice = voices.find(voice => voice.lang === 'en-US') ||
      voices.find(voice => voice.lang.startsWith('en'));
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  speechSynthesis.speak(utterance);
}

function speakCurrentWord() {
  if (!practiceQueue.length) return;
  const idx = practiceIndex % practiceQueue.length;
  const word = practiceQueue[idx];
  if (word && word.english) {
    speakWord(word.english);
    const btn = document.getElementById('speak-btn');
    btn.classList.add('speaking');
    btn.addEventListener('speechend', () => btn.classList.remove('speaking'), { once: true });
    setTimeout(() => btn.classList.remove('speaking'), 1500);
  }
}

if (window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.onvoiceschanged = () => { };
}

// ── Practice mode ──────────────────────────────────────────────
let practiceFilter = 'all'; // 'all' | 'bookmarked' | 'unbookmarked'
const PRACTICE_FILTERS = [
  { key: 'all', label: '🔖 All', title: 'Show all words' },
  { key: 'bookmarked', label: '🔖 Bookmarked', title: 'Show only bookmarked' },
  { key: 'unbookmarked', label: '🔖 Unbookmarked', title: 'Show only unbookmarked' },
];

function applyPracticeFilter() {
  const f = PRACTICE_FILTERS.find(p => p.key === practiceFilter);
  const btn = document.getElementById('practice-filter-btn');
  btn.textContent = f.label;
  btn.title = f.title;
}

function cyclePracticeFilter() {
  const idx = PRACTICE_FILTERS.findIndex(p => p.key === practiceFilter);
  practiceFilter = PRACTICE_FILTERS[(idx + 1) % PRACTICE_FILTERS.length].key;
  applyPracticeFilter();
  shuffleQueue();
  showCard();
}

document.getElementById('practice-filter-btn').addEventListener('click', cyclePracticeFilter);

function getFilteredWords() {
  if (practiceFilter === 'bookmarked') return words.filter(w => isBookmarked(w.english));
  if (practiceFilter === 'unbookmarked') return words.filter(w => !isBookmarked(w.english));
  return [...words];
}

function initPractice() {
  applyPracticeFilter();
  if (!words.length) {
    document.getElementById('practice-card-wrap').style.display = 'none';
    document.getElementById('practice-empty').style.display = 'block';
    document.getElementById('practice-empty').textContent = 'Add some words first to start practicing!';
    return;
  }
  const filtered = getFilteredWords();
  if (!filtered.length) {
    document.getElementById('practice-card-wrap').style.display = 'none';
    document.getElementById('practice-empty').style.display = 'block';
    document.getElementById('practice-empty').textContent =
      practiceFilter === 'bookmarked' ? 'No bookmarked words yet.' : 'All words are bookmarked.';
    return;
  }
  document.getElementById('practice-card-wrap').style.display = 'block';
  document.getElementById('practice-empty').style.display = 'none';
  if (!practiceQueue.length) shuffleQueue();
  showCard();
}

function shuffleQueue() {
  practiceQueue = getFilteredWords().sort(() => Math.random() - .5);
  practiceIndex = 0;
}

document.getElementById('shuffle-btn').addEventListener('click', () => {
  shuffleQueue();
  showCard();
});

document.getElementById('speak-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  speakCurrentWord();
});

document.getElementById('bookmark-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!practiceQueue.length) return;
  const idx = practiceIndex % practiceQueue.length;
  const w = practiceQueue[idx];
  toggleBookmark(w.english);
  document.getElementById('bookmark-btn').classList.toggle('active', isBookmarked(w.english));

  // Remove word from queue if it no longer matches the filter
  const matches = practiceFilter === 'all'
    || (practiceFilter === 'bookmarked' && isBookmarked(w.english))
    || (practiceFilter === 'unbookmarked' && !isBookmarked(w.english));

  if (!matches) {
    practiceQueue.splice(idx, 1);
    if (!practiceQueue.length) {
      // Queue empty — show message and auto-switch to All
      document.getElementById('card-en').textContent = practiceFilter === 'bookmarked'
        ? 'No bookmarked words.' : 'All words are bookmarked.';
      document.getElementById('card-fa').textContent = '';
      document.getElementById('flip-inner').classList.remove('flipped');
      document.getElementById('practice-stat').textContent = '';
      document.getElementById('progress-fill').style.width = '0%';
      showToast('No words match — switching to All', 'warn');
      practiceFilter = 'all';
      applyPracticeFilter();
      setTimeout(() => { shuffleQueue(); showCard(); }, 800);
      return;
    }
    // Clamp index and show next card
    practiceIndex = idx % practiceQueue.length;
  }
  showCard();
});

function showCard() {
  if (!practiceQueue.length) {
    document.getElementById('card-en').textContent = 'No bookmarked words.';
    document.getElementById('card-fa').textContent = '';
    document.getElementById('flip-inner').classList.remove('flipped');
    document.getElementById('practice-stat').textContent = '';
    document.getElementById('progress-fill').style.width = '0%';
    return;
  }
  const idx = practiceIndex % practiceQueue.length;
  const w = practiceQueue[idx];
  document.getElementById('card-en').textContent = w.english;
  document.getElementById('card-fa').textContent = w.persian;
  document.getElementById('flip-inner').classList.remove('flipped');
  const pct = Math.round(((idx + 1) / practiceQueue.length) * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('practice-stat').textContent = `${idx + 1} / ${practiceQueue.length}`;

  const bookmarkBtn = document.getElementById('bookmark-btn');
  bookmarkBtn.classList.toggle('active', isBookmarked(w.english));
}

function flipCard() {
  document.getElementById('flip-inner').classList.toggle('flipped');
}

document.getElementById('next-btn').addEventListener('click', () => {
  practiceIndex = (practiceIndex + 1) % practiceQueue.length;
  showCard();
});
document.getElementById('prev-btn').addEventListener('click', () => {
  practiceIndex = (practiceIndex - 1 + practiceQueue.length) % practiceQueue.length;
  showCard();
});

// Keyboard shortcuts in practice
document.addEventListener('keydown', e => {
  if (!document.getElementById('tab-practice').classList.contains('active')) return;
  if (e.key === ' ') { e.preventDefault(); flipCard(); }
  if (e.key === 'ArrowRight') document.getElementById('next-btn').click();
  if (e.key === 'ArrowLeft') document.getElementById('prev-btn').click();
});

// ── Init ───────────────────────────────────────────────────────
(async function init() {
  try {
    const res = await fetch('/api/words');
    const data = await res.json();
    words = (data.words ?? data).map(w => {
      if (Array.isArray(w)) return { english: w[0], persian: w[1], alternatives: [], category: null };
      return { english: w.english, persian: w.persian, alternatives: w.alternatives || [], category: w.category || null };
    });
    updateHeaderCount();
  } catch (e) {
    console.error('Failed to load words:', e);
  }
  await loadCategories();
  renderList();
})();

// ── Mobile tap-to-reveal Persian translation ───────────────────
(function () {
  const isMobile = window.matchMedia('(max-width: 540px)').matches;
  if (!isMobile) return;

  // Flag to block parent click when a word segment was tapped
  let segmentTapped = false;

  // Expose flag setter for word segment handlers
  window._segTap = function () { segmentTapped = true; };

  function attachRevealListeners() {
    document.querySelectorAll('#word-list .word-row').forEach(function (row) {
      const enEl = row.querySelector('.word-en');
      const faEl = row.querySelector('.word-fa');
      if (!enEl || !faEl) return;
      if (enEl.dataset.revealBound === '1') return;
      enEl.dataset.revealBound = '1';

      enEl.addEventListener('click', function () {
        if (segmentTapped) {
          segmentTapped = false;
          return;
        }
        const isRevealed = faEl.classList.contains('revealed');
        faEl.classList.toggle('revealed', !isRevealed);
        enEl.classList.toggle('revealed-hint', !isRevealed);
      });
    });
  }

  const originalRenderList = renderList;
  renderList = function () {
    originalRenderList.apply(this, arguments);
    setTimeout(attachRevealListeners, 0);
  };

  attachRevealListeners();
})();

// ── Multiple Meanings ───────────────────────────────────────
document.getElementById('defs-btn').addEventListener('click', async () => {
  const word = document.getElementById('defs-en').value.trim();
  if (!word) { showAlert('defs-alert', 'Enter a word first.'); return; }

  const btn = document.getElementById('defs-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Looking up…';

  document.getElementById('defs-result').style.display = 'none';
  document.getElementById('defs-empty').style.display = 'none';

  try {
    const res = await fetch(`/defs/${encodeURIComponent(word)}`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) { showAlert('defs-alert', data.error || 'Something went wrong.'); return; }

    const defs = data.definitions || [];
    if (!defs.length) {
      document.getElementById('defs-empty').style.display = 'block';
      return;
    }

    document.getElementById('defs-word-title').textContent = data.main_word || word;
    document.getElementById('defs-tbody').innerHTML = defs.map((d, i) => `
      <tr>
        <td class="defs-td defs-td-num">${i + 1}</td>
        <td class="defs-td defs-td-en">${escHtml(d.english)}</td>
        <td class="defs-td defs-td-fa">${escHtml(d.persian)}</td>
      </tr>
    `).join('');

    document.getElementById('defs-result').style.display = 'block';
  } catch (e) {
    showAlert('defs-alert', 'Network error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Look up';
  }
});

document.getElementById('defs-en').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('defs-btn').click();
});

// ── Word popup ─────────────────────────────────────────────
function openWordPopup(word) {
  document.getElementById('popup-en').value = word;
  document.getElementById('popup-fa').value = '';
  document.getElementById('popup-alert').className = 'alert';
  document.getElementById('word-popup').classList.add('open');
  document.getElementById('popup-fa').focus();
}

document.getElementById('popup-cancel').addEventListener('click', () => {
  document.getElementById('word-popup').classList.remove('open');
});
document.getElementById('word-popup').addEventListener('click', e => {
  if (e.target === document.getElementById('word-popup'))
    document.getElementById('word-popup').classList.remove('open');
});

document.getElementById('popup-generate').addEventListener('click', async () => {
  const en = document.getElementById('popup-en').value.trim();
  const fa = document.getElementById('popup-fa').value.trim();
  if (!en) return;

  const btn = document.getElementById('popup-generate');
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';

  try {
    const res = await fetchWithRetry('/api/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ english: en, persian: fa, aigen: true })
    });
    const data = await res.json();

    if (!res.ok) {
      document.getElementById('popup-alert').className = 'alert show alert-error';
      document.getElementById('popup-alert').textContent = data.error || 'Generation failed.';
      return;
    }

    words.push(data.word);
    renderList(document.getElementById('search-input').value);
    updateHeaderCount();
    document.getElementById('word-popup').classList.remove('open');
    showToast(`Added "${data.word.english}"`, 'success');
  } catch (e) {
    document.getElementById('popup-alert').className = 'alert show alert-error';
    document.getElementById('popup-alert').textContent = 'Network error — please try again.';
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Generate';
  }
});

document.getElementById('popup-fa').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('popup-generate').click();
});

// ── Floating Bottom Nav Bar (Web/PC only) ─────────────────────
(function () {
  const isDesktop = window.matchMedia('(min-width: 541px)').matches;
  if (!isDesktop) return;

  document.body.classList.add('has-floating-nav');

  const nav = document.getElementById('floating-nav');
  const toolbar = document.getElementById('fn-toolbar');
  const searchPanel = document.getElementById('fn-search-panel');
  const addPanel = document.getElementById('fn-add-panel');
  const searchToggle = document.getElementById('fn-search-toggle');
  const addToggle = document.getElementById('fn-add-toggle');
  const fnSearchInput = document.getElementById('fn-search-input');
  const fnHeaderCount = document.getElementById('fn-header-count');

  // ── Sync header count ──────────────────────────────────────
  function syncHeaderCount() {
    const c = words.length;
    fnHeaderCount.textContent = `${c} word${c !== 1 ? 's' : ''}`;
  }
  const origUpdateHeaderCount = updateHeaderCount;
  updateHeaderCount = function () {
    origUpdateHeaderCount();
    syncHeaderCount();
  };
  syncHeaderCount();

  // ── Tab switching (mirrors top tabs) ──────────────────────
  document.querySelectorAll('.fn-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update floating tabs
      document.querySelectorAll('.fn-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Update top tabs
      const topBtn = document.querySelector(`.tab-btn[data-tab="${btn.dataset.tab}"]`);
      if (topBtn) topBtn.click();
      // Close panels
      searchPanel.classList.remove('open');
      addPanel.classList.remove('open');
      searchToggle.classList.remove('active');
      addToggle.classList.remove('active');
    });
  });

  // Sync top tabs → floating tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fn-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === btn.dataset.tab);
      });
    });
  });

  // ── Select mode (mirrors top select toggle) ────────────────
  const fnSelectToggle = document.getElementById('fn-select-toggle');
  const fnSelectBar = document.getElementById('fn-select-bar');
  const fnSelectCount = document.getElementById('fn-select-count');
  const fnBulkMoveSelect = document.getElementById('fn-bulk-move-select');
  const fnBulkDeleteBtn = document.getElementById('fn-bulk-delete-btn');
  const fnBulkCancelBtn = document.getElementById('fn-bulk-cancel-btn');

  function syncFnSelectUI() {
    fnSelectToggle.classList.toggle('active', selectMode);
    fnSelectBar.classList.toggle('open', selectMode);
    fnSelectCount.textContent = `${selectedIndices.size} selected`;
  }

  // Hook into select mode changes
  const origSelectToggle = document.getElementById('select-toggle-btn');
  origSelectToggle.addEventListener('click', () => {
    setTimeout(syncFnSelectUI, 0);
  });

  document.getElementById('bulk-cancel-btn').addEventListener('click', () => {
    setTimeout(syncFnSelectUI, 0);
  });

  // Floating select toggle
  fnSelectToggle.addEventListener('click', () => {
    origSelectToggle.click();
    syncFnSelectUI();
    // Close other panels
    searchPanel.classList.remove('open');
    addPanel.classList.remove('open');
    searchToggle.classList.remove('active');
    addToggle.classList.remove('active');
  });

  // Sync fn bulk move select with main bulk move select
  fnBulkMoveSelect.addEventListener('change', async (e) => {
    if (!selectedIndices.size || e.target.value === '') return;
    const category = e.target.value === '__none__' ? null : e.target.value;
    const indices = [...selectedIndices];
    await moveWordsToCategory(indices, category);
    selectMode = false;
    selectedIndices.clear();
    e.target.value = '';
    fnBulkMoveSelect.value = '';
    document.getElementById('select-toggle-btn').textContent = 'Select';
    document.getElementById('select-toggle-btn').classList.remove('active');
    document.getElementById('bulk-actions').style.display = 'none';
    renderList(document.getElementById('search-input').value);
    syncFnSelectUI();
  });

  // Sync main bulk move → fn bulk move
  document.getElementById('bulk-move-select').addEventListener('change', (e) => {
    fnBulkMoveSelect.value = e.target.value;
    setTimeout(syncFnSelectUI, 0);
  });

  // Floating bulk delete
  fnBulkDeleteBtn.addEventListener('click', () => {
    document.getElementById('bulk-delete-btn').click();
    setTimeout(syncFnSelectUI, 0);
  });

  // Floating bulk cancel
  fnBulkCancelBtn.addEventListener('click', () => {
    document.getElementById('bulk-cancel-btn').click();
    syncFnSelectUI();
  });

  // ── Search panel toggle ──────────────────────────────────
  searchToggle.addEventListener('click', () => {
    const isOpen = searchPanel.classList.toggle('open');
    searchToggle.classList.toggle('active', isOpen);
    // Close add panel if open
    if (isOpen) {
      addPanel.classList.remove('open');
      addToggle.classList.remove('active');
      setTimeout(() => fnSearchInput.focus(), 100);
    }
  });

  // ── Add panel toggle ─────────────────────────────────────
  addToggle.addEventListener('click', () => {
    const isOpen = addPanel.classList.toggle('open');
    addToggle.classList.toggle('active', isOpen);
    // Close search panel if open
    if (isOpen) {
      searchPanel.classList.remove('open');
      searchToggle.classList.remove('active');
      setTimeout(() => document.getElementById('fn-add-en').focus(), 100);
    }
  });

  // ── Scroll toggle (top ↔ bottom based on position) ────────
  const scrollToggle = document.getElementById('fn-scroll-toggle');
  const scrollTitle = scrollToggle.querySelector('title') || scrollToggle;

  function updateScrollToggle() {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 200;
    scrollToggle.title = nearBottom ? 'Scroll to top' : 'Scroll to bottom';
  }
  window.addEventListener('scroll', updateScrollToggle, { passive: true });
  updateScrollToggle();

  scrollToggle.addEventListener('click', () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 200;
    window.scrollTo({ top: nearBottom ? 0 : document.body.scrollHeight, behavior: 'instant' });
  });

  // ── Close on Escape ──────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchPanel.classList.remove('open');
      addPanel.classList.remove('open');
      searchToggle.classList.remove('active');
      addToggle.classList.remove('active');
    }
  });

  // ── Hide floating bar → show header button ────────────────
  const showNavBtn = document.getElementById('fn-show-nav');

  document.getElementById('fn-hide-nav').addEventListener('click', () => {
    nav.style.display = 'none';
    showNavBtn.style.display = 'inline-flex';
  });

  showNavBtn.addEventListener('click', () => {
    nav.style.display = '';
    showNavBtn.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Sync search input with main search ───────────────────
  fnSearchInput.addEventListener('input', e => {
    document.getElementById('search-input').value = e.target.value;
    renderList(e.target.value);
  });

  // Also sync main search → floating search
  document.getElementById('search-input').addEventListener('input', e => {
    fnSearchInput.value = e.target.value;
  });

  // Search go button
  document.getElementById('fn-search-go').addEventListener('click', () => {
    renderList(fnSearchInput.value);
  });

  // ── Bookmark filter (cycles: All → Bookmarked → Unbookmarked) ──
  document.getElementById('fn-bookmark-filter').addEventListener('click', () => {
    document.getElementById('bookmark-filter-btn').click();
    const labels = { all: '🔖 All', bookmarked: '🔖 Bookmarked', unbookmarked: '🔖 Unbookmarked' };
    document.getElementById('fn-bookmark-filter').textContent = labels[bookmarkFilter];
  });

  // ── Category filter toggle ───────────────────────────────
  document.getElementById('fn-cat-filter-btn').addEventListener('click', () => {
    const catSection = document.getElementById('fn-categories');
    const isVisible = catSection.style.display !== 'none';
    catSection.style.display = isVisible ? 'none' : 'flex';
  });

  // ── Category create button (opens same modal as top) ──────
  document.getElementById('fn-create-category-btn').addEventListener('click', () => {
    document.getElementById('create-category-btn').click();
  });

  // Sync category chips from main category bar
  function syncFnCategories() {
    const badgeContainer = document.getElementById('fn-cat-badges');
    if (!badgeContainer) return;
    badgeContainer.innerHTML = categories.map(c => `
      <button class="fn-chip ${categoryFilter === c.name ? 'active' : ''}" data-fn-cat="${escHtml(c.name)}" title="${escHtml(c.description || '')}">
        ${escHtml(c.name)}
      </button>
    `).join('');

    // Update "All" and "No Category" states
    const allChip = document.querySelector('.fn-chip[data-fn-cat="all"]');
    const noneChip = document.querySelector('.fn-chip[data-fn-cat=""]');
    if (allChip) allChip.classList.toggle('active', categoryFilter === null);
    if (noneChip) noneChip.classList.toggle('active', categoryFilter === '');

    // Add click handlers
    badgeContainer.querySelectorAll('.fn-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        categoryFilter = chip.dataset.fnCat === 'all' ? null : chip.dataset.fnCat;
        syncFnCategories();
        renderCategoryBar();
        syncAddCategorySelects();
        renderList(document.getElementById('search-input').value);
      });
    });
  }

  // Hook into category bar render
  const origRenderCategoryBar = renderCategoryBar;
  renderCategoryBar = function () {
    origRenderCategoryBar();
    syncFnCategories();
  };

  // "All" and "No Category" chip handlers
  document.querySelectorAll('.fn-categories > .fn-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.fnCat;
      categoryFilter = cat === 'all' ? null : cat;
      syncFnCategories();
      renderCategoryBar();
      syncAddCategorySelects();
      renderList(document.getElementById('search-input').value);
    });
  });

  // ── Advanced toggle in add panel ─────────────────────────
  document.getElementById('fn-advanced-toggle').addEventListener('click', () => {
    const section = document.getElementById('fn-advanced-section');
    const arrow = document.getElementById('fn-advanced-arrow');
    const isOpen = section.classList.toggle('open');
    arrow.classList.toggle('open', isOpen);
  });

  // ── Writing style toggle ─────────────────────────────────
  document.getElementById('fn-add-style-toggle').addEventListener('change', e => {
    document.getElementById('fn-style-options').classList.toggle('visible', e.target.checked);
  });

  // ── Sync fn category select with main categories ─────────
  const origUpdateCategorySelects2 = updateCategorySelects;
  updateCategorySelects = function () {
    origUpdateCategorySelects2();
    const fnSelect = document.getElementById('fn-add-category');
    if (fnSelect) {
      const currentVal = fnSelect.value;
      fnSelect.innerHTML = '<option value="">No Category</option>' +
        categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('');
      fnSelect.value = currentVal;
    }
    syncFnCategories();
  };
  updateCategorySelects();

  // ── Enter key support ────────────────────────────────────
  ['fn-add-en', 'fn-add-fa'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('fn-add-btn').click();
    });
  });

  // ── Add word from floating panel ─────────────────────────
  document.getElementById('fn-add-btn').addEventListener('click', async () => {
    const en = document.getElementById('fn-add-en').value.trim();
    const fa = document.getElementById('fn-add-fa').value.trim();
    const aiGen = document.getElementById('fn-add-aigen').checked;
    const alts = document.getElementById('fn-add-alts').value.trim();
    const styleEnabled = document.getElementById('fn-add-style-toggle').checked;
    const style = styleEnabled ? document.getElementById('fn-add-style').value : '';
    const customStyle = styleEnabled ? document.getElementById('fn-add-style-custom').value.trim() : '';
    const addCategory = document.getElementById('fn-add-category').value || null;
    if (!en) { showAlert('fn-add-alert', 'English field is required.'); return; }
    if (!aiGen && !fa) { showAlert('fn-add-alert', 'Persian field is required.'); return; }

    const placeholder = { english: en, persian: fa || '(generating…)', alternatives: [], category: addCategory, isGenerating: !fa };
    words.push(placeholder);
    renderList(document.getElementById('search-input').value);
    updateHeaderCount();
    document.getElementById('fn-add-en').value = '';
    document.getElementById('fn-add-fa').value = '';
    document.getElementById('fn-add-alts').value = '';

    showToast(`Adding "${en}"…`, 'info');

    try {
      const res = await fetchWithRetry('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english: en, persian: fa, aigen: aiGen, alternatives: alts, style: style, custom_style: customStyle, category: addCategory })
      });
      const data = await res.json();

      if (!res.ok) {
        words.pop();
        renderList(document.getElementById('search-input').value);
        updateHeaderCount();
        showAlert('fn-add-alert', data.error);
        return;
      }

      words[words.length - 1] = data.word;
      renderList(document.getElementById('search-input').value);
      showAlert('fn-add-alert', `"${data.word.english}" added!`, 'success');
      showToast(`Added "${data.word.english}"`, 'success');
    } catch (e) {
      words.pop();
      renderList(document.getElementById('search-input').value);
      updateHeaderCount();
      showAlert('fn-add-alert', 'Network error — please try again.', 'error');
      showToast('Add failed: ' + e.message, 'error');
    }

    document.getElementById('fn-add-en').focus();
  });
})();
