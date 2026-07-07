// ── State ──────────────────────────────────────────────────────
let words = [];
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
  if (id === 'add-alert') {
    el.className = `inline-add-alert show alert-${type === 'success' ? 'success' : type === 'warn' ? 'warn' : 'error'}`;
  } else {
    el.className = `alert show alert-${type === 'success' ? 'success' : type === 'warn' ? 'warn' : 'error'}`;
  }
  setTimeout(() => {
    if (id === 'add-alert') {
      el.className = 'inline-add-alert';
    } else {
      el.className = 'alert';
    }
  }, 4000);
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
    ? words.filter(w => w.english.toLowerCase().includes(f) || w.persian.includes(f))
    : words;

  if (bookmarkFilter === 'bookmarked') {
    filtered = filtered.filter(w => isBookmarked(w.english));
  } else if (bookmarkFilter === 'unbookmarked') {
    filtered = filtered.filter(w => !isBookmarked(w.english));
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
    return `
      <div class="word-row-wrap">
        <div class="word-row" data-index="${realIndex}">
          <span class="word-index">${realIndex + 1}</span>
          ${altCheckHtml}
          <span class="word-en">${escHtml(w.english)}</span>
          <span class="word-fa">${escHtml(w.persian)}</span>
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
    row.addEventListener('mouseenter', () => {
      if (segmented) return;
      segmented = true;
      enEl.innerHTML = segmentEnglish(rawText);
      enEl.querySelectorAll('.word-segment').forEach(span => {
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          openWordPopup(span.dataset.word);
        });
      });
    });
  });
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

document.getElementById('search-input').addEventListener('input', e => renderList(e.target.value));
document.getElementById('bookmark-filter-btn').addEventListener('click', () => {
  const cycle = ['all', 'bookmarked', 'unbookmarked'];
  bookmarkFilter = cycle[(cycle.indexOf(bookmarkFilter) + 1) % cycle.length];
  const labels = { all: '🔖 All', bookmarked: '🔖 Bookmarked', unbookmarked: '🔖 Unbookmarked' };
  document.getElementById('bookmark-filter-btn').textContent = labels[bookmarkFilter];
  renderList(document.getElementById('search-input').value);
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

// ── Add word (inline at end of list) ───────────────────────────
document.getElementById('add-btn').addEventListener('click', async () => {
  const en = document.getElementById('add-en').value.trim();
  const fa = document.getElementById('add-fa').value.trim();
  const aiGen = document.getElementById('add-aigen').checked;
  const alts = document.getElementById('add-alts').value.trim();
  const styleEnabled = document.getElementById('add-style-toggle').checked;
  const style = styleEnabled ? document.getElementById('add-style').value : '';
  const customStyle = styleEnabled ? document.getElementById('add-style-custom').value.trim() : '';
  if (!en) { showAlert('add-alert', 'English field is required.'); return; }
  if (!aiGen && !fa) { showAlert('add-alert', 'Persian field is required.'); return; }

  // Optimistic: show placeholder word immediately
  const placeholder = { english: en, persian: fa || '(generating…)', alternatives: [] };
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
      body: JSON.stringify({ english: en, persian: fa, aigen: aiGen, alternatives: alts, style: style, custom_style: customStyle })
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
  if (!en || !fa) { showAlert('edit-alert', 'Fill in both fields.'); return; }

  const idx = editingIndex;
  const oldWord = { ...words[idx] };

  // Optimistic: update local state, close modal instantly
  const updated = { english: en, persian: fa, alternatives: alts ? alts.split('\n').map(s => s.trim()).filter(Boolean) : [] };
  words[idx] = updated;
  document.getElementById('edit-modal').classList.remove('open');
  renderList(document.getElementById('search-input').value);
  showToast(`Updated "${en}"`, 'success');

  // Fire PUT in background
  fetchWithRetry(`/api/words/${idx}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ english: en, persian: fa, alternatives: alts })
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
        Array.isArray(w) ? { english: w[0], persian: w[1], alternatives: [] } : { ...w, alternatives: w.alternatives || [] }
      );
    }

    // Refresh modal fields with new values
    document.getElementById('edit-en').value = words[editingIndex].english;
    document.getElementById('edit-fa').value = words[editingIndex].persian;
    document.getElementById('edit-alts').value = (words[editingIndex].alternatives || []).join('\n');

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
      if (Array.isArray(w)) return { english: w[0], persian: w[1], alternatives: [] };
      return { english: w.english, persian: w.persian, alternatives: w.alternatives || [] };
    });
    updateHeaderCount();
  } catch (e) {
    console.error('Failed to load words:', e);
  }
  renderList();
})();

// ── Mobile tap-to-reveal Persian translation ───────────────────
(function () {
  const isMobile = window.matchMedia('(max-width: 540px)').matches;
  if (!isMobile) return;

  function attachRevealListeners() {
    document.querySelectorAll('#word-list .word-row').forEach(function (row) {
      const enEl = row.querySelector('.word-en');
      const faEl = row.querySelector('.word-fa');
      if (!enEl || !faEl) return;
      if (enEl.dataset.revealBound === '1') return;
      enEl.dataset.revealBound = '1';

      enEl.addEventListener('click', function () {
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
