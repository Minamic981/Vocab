import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Library from './nav/Library.jsx';
import BatchImport from './nav/BatchImport.jsx';
import Practice from './nav/Practice.jsx';
import MultipleMeanings from './nav/MultipleMeanings.jsx';
import MobileBottomNav from './compMobile/MobileBottomNav.jsx';
import { filterByCategory, sortByIndex } from '../common/utils.jsx';

// ── Helpers ────────────────────────────────────────────────
const RETRY_MAX = 3;
const RETRY_DELAY = 3000;

async function fetchWithRetry(url, options = {}, retries = RETRY_MAX) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
}

let toastId = 0;

// ── Parse new KV structure ─────────────────────────────────
function parseKVData(data) {
  const words = [];
  const cats = data.categories || {};
  for (const [catName, catObj] of Object.entries(cats)) {
    for (const word of catObj?.words || []) {
      words.push({
        ...word,
        category: catName === 'uncategorized' ? null : catName
      });
    }
  }
  return words;
}

function parseCategories(data) {
  const cats = data.categories || {};
  return Object.entries(cats)
    .filter(([name]) => name !== 'uncategorized')
    .map(([name, obj]) => ({ name, description: obj?.description || '' }));
}

// ── App ────────────────────────────────────────────────────
export default function MobileApp() {
  const [words, setWords] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wordcount, setWordcount] = useState(0);
  const [activeTab, setActiveTab] = useState('library');

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [bookmarkFilter, setBookmarkFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState(new Set());

  const [bookmarkedWords, setBookmarkedWords] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bookmarkedWords') || '[]'); }
    catch { return []; }
  });

  const [addEn, setAddEn] = useState('');
  const [addFa, setAddFa] = useState('');
  const [addAiGen, setAddAiGen] = useState(false);
  const [addAlts, setAddAlts] = useState('');
  const [addStyleEnabled, setAddStyleEnabled] = useState(false);
  const [addStyle, setAddStyle] = useState('');
  const [addCustomStyle, setAddCustomStyle] = useState('');
  const [addAdvancedOpen, setAddAdvancedOpen] = useState(false);
  const [addAlert, setAddAlert] = useState({ msg: '', type: 'error' });

  const [editOpen, setEditOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [editEn, setEditEn] = useState('');
  const [editFa, setEditFa] = useState('');
  const [editAlts, setEditAlts] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAlert, setEditAlert] = useState({ msg: '', type: 'error' });
  const [editAIGen, setEditAIGen] = useState(false);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupWord, setPopupWord] = useState('');
  const [popupFa, setPopupFa] = useState('');
  const [popupCategory, setPopupCategory] = useState('');
  const [popupAlert, setPopupAlert] = useState({ msg: '', type: 'error' });
  const [popupLoading, setPopupLoading] = useState(false);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catAlert, setCatAlert] = useState({ msg: '', type: 'error' });

  const [toasts, setToasts] = useState([]);

  const [mbnVisible, setMbnVisible] = useState(true);
  const [mbnNavOpen, setMbnNavOpen] = useState(false);
  const [mbnCatOpen, setMbnCatOpen] = useState(false);
  const [scrollToTop, setScrollToTop] = useState(true);

  // ── Toast ──
  const addToast = useCallback((msg, type = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const showAlert = useCallback((setter, msg, type = 'error') => {
    setter({ msg, type });
    setTimeout(() => setter({ msg: '', type: 'error' }), 80000);
  }, []);

  // ── Bookmarks ──
  useEffect(() => {
    localStorage.setItem('bookmarkedWords', JSON.stringify(bookmarkedWords));
  }, [bookmarkedWords]);

  const isBookmarked = useCallback((english) => bookmarkedWords.includes(english), [bookmarkedWords]);

  const toggleBookmark = useCallback((english) => {
    setBookmarkedWords(prev => {
      const i = prev.indexOf(english);
      return i === -1 ? [...prev, english] : prev.filter((_, j) => j !== i);
    });
  }, []);

  // ── Filtered words (using word.index as idx, sorted by index) ──
  const filteredWords = useMemo(() => {
    let result = words.map(w => ({ word: w, idx: w.index }));

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(({ word: w }) =>
        w.english.toLowerCase().includes(q) || w.persian.includes(q) ||
        (w.category && w.category.toLowerCase().includes(q))
      );
    }

    if (bookmarkFilter === 'bookmarked') {
      result = result.filter(({ word: w }) => bookmarkedWords.includes(w.english));
    } else if (bookmarkFilter === 'unbookmarked') {
      result = result.filter(({ word: w }) => !bookmarkedWords.includes(w.english));
    }

    const wordsOnly = result.map(f => f.word);
    const categoryFiltered = filterByCategory(wordsOnly, categoryFilter);
    const sorted = sortByIndex(categoryFiltered);
    const indexMap = new Map(sorted.map(w => [w, w.index]));
    return sorted.map(w => ({ word: w, idx: indexMap.get(w) }));
  }, [words, searchQuery, bookmarkFilter, categoryFilter, bookmarkedWords]);

  // ── Init ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/words');
        const data = await res.json();
        setWords(parseKVData(data));
        setWordcount(data.wordcount || 0);
      } catch (e) { console.error('Failed to load words:', e); }
      try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        setCategories(data.categories || []);
      } catch (e) { console.error('Failed to load categories:', e); }
      setLoading(false);
    })();
  }, []);

  // ── API: Add word ──
  const addWord = useCallback(async () => {
    const en = addEn.trim();
    const fa = addFa.trim();
    const aiGen = addAiGen;
    const alts = addAlts.trim();
    const style = addStyleEnabled ? addStyle : '';
    const customStyle = addStyleEnabled ? addCustomStyle.trim() : '';
    const cat = categoryFilter || null;
    if (!en) { showAlert(setAddAlert, 'English field is required.'); return; }
    if (!aiGen && !fa) { showAlert(setAddAlert, 'Persian field is required.'); return; }

    const placeholder = { english: en, persian: fa || '(generating…)', alternatives: [], category: cat, index: wordcount, isGenerating: true };
    setWords(prev => [...prev, placeholder]);
    setAddEn(''); setAddFa(''); setAddAlts('');
    addToast(`Adding "${en}"…`, 'info');

    try {
      const res = await fetchWithRetry('/api/words', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english: en, persian: fa, aigen: aiGen, alternatives: alts, style, custom_style: customStyle, category: cat })
      });
      const data = await res.json();
      if (!res.ok) {
        setWords(prev => prev.filter(w => !(w.english === en && w.isGenerating)));
        showAlert(setAddAlert, data.error);
        return;
      }
      if (data.action === 'merged') {
        setWords(prev => {
          const filtered = prev.filter(w => !(w.english === en && w.isGenerating));
          return filtered.map(w => w.english === en ? { ...data.word, category: w.category } : w);
        });
        showAlert(setAddAlert, `"${en}" already exists — Persian meaning merged!`, 'success');
        addToast(`Merged meaning into "${en}"`, 'success');
      } else {
        setWords(prev => {
          const i = prev.findIndex(w => w.english === en && w.isGenerating);
          if (i === -1) return [...prev, data.word];
          const copy = [...prev]; copy[i] = data.word; return copy;
        });
        setWordcount(prev => prev + 1);
        showAlert(setAddAlert, `"${data.word.english}" added!`, 'success');
        addToast(`Added "${data.word.english}"`, 'success');
      }
    } catch (e) {
      setWords(prev => prev.filter(w => !(w.english === en && w.isGenerating)));
      showAlert(setAddAlert, 'Network error — please try again.');
      addToast('Add failed: ' + e.message, 'error');
    }
  }, [addEn, addFa, addAiGen, addAlts, categoryFilter, addStyleEnabled, addStyle, addCustomStyle, wordcount, showAlert, addToast]);

  // ── API: Delete word (by index) ──
  const deleteWord = useCallback((wordIndex) => {
    const removed = words.find(w => w.index === wordIndex);
    if (!removed) return;
    setWords(prev => prev.filter(w => w.index !== wordIndex));
    addToast(`Deleted "${removed.english}"`, 'success');

    fetchWithRetry(`/api/words/${wordIndex}`, { method: 'DELETE' })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json();
          setWords(prev => [...prev, removed]);
          addToast(data.error || 'Delete failed — word restored.', 'error');
        }
      })
      .catch(() => {
        setWords(prev => [...prev, removed]);
        addToast('Delete failed — word restored.', 'error');
      });
  }, [words, addToast]);

  // ── API: Edit word (by index) ──
  const saveEdit = useCallback(async () => {
    const en = editEn.trim();
    const fa = editFa.trim();
    const alts = editAlts.trim();
    const cat = editCategory || null;
    if (!en || !fa) { showAlert(setEditAlert, 'Fill in both fields.'); return; }

    const wordIndex = editIndex;
    const oldWord = words.find(w => w.index === wordIndex);
    if (!oldWord) return;

    const updated = { ...oldWord, english: en, persian: fa, alternatives: alts ? alts.split('\n').map(s => s.trim()).filter(Boolean) : [], category: cat };

    setWords(prev => prev.map(w => w.index === wordIndex ? updated : w));
    setEditOpen(false);
    addToast(`Updated "${en}"`, 'success');

    fetchWithRetry(`/api/words/${wordIndex}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ english: en, persian: fa, alternatives: alts, category: cat })
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json();
        setWords(prev => prev.map(w => w.index === wordIndex ? oldWord : w));
        addToast(data.error || 'Edit failed — reverted.', 'error');
      }
    }).catch(() => {
      setWords(prev => prev.map(w => w.index === wordIndex ? oldWord : w));
      addToast('Edit failed — reverted.', 'error');
    });
  }, [editEn, editFa, editAlts, editCategory, editIndex, words, showAlert, addToast]);

  // ── API: AI Generate in edit modal ──
  const editAIGenerate = useCallback(async () => {
    setEditAIGen(true);
    try {
      const res = await fetchWithRetry(`/api/aigen/${editIndex}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_edit: true })
      });
      const data = await res.json();
      if (!res.ok) { showAlert(setEditAlert, data.error || 'Generation failed.'); return; }

      const wordsRes = await fetchWithRetry('/api/words');
      if (wordsRes.ok) {
        const wordsData = await wordsRes.json();
        const newWords = parseKVData(wordsData);
        setWords(newWords);
        const updated = newWords.find(w => w.index === editIndex);
        if (updated) {
          setEditEn(updated.english);
          setEditFa(updated.persian);
          setEditAlts((updated.alternatives || []).join('\n'));
          setEditCategory(updated.category || '');
        }
      }
      showAlert(setEditAlert, 'Sentence generated!', 'success');
      addToast('New sentence generated', 'success');
    } catch (e) {
      showAlert(setEditAlert, 'Network error: ' + e.message);
      addToast('Generation failed: ' + e.message, 'error');
    } finally { setEditAIGen(false); }
  }, [editIndex, showAlert, addToast]);

  // ── API: Category CRUD ──
  const createCategory = useCallback(async (name, description) => {
    try {
      const res = await fetchWithRetry('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      if (!res.ok) { showAlert(setCatAlert, data.error || 'Failed to create category.'); return false; }
      setCategories(prev => [...prev, data.category]);
      addToast(`Category "${name}" created`, 'success');
      return true;
    } catch (e) { showAlert(setCatAlert, 'Network error: ' + e.message); return false; }
  }, [showAlert, addToast]);

  const deleteCategory = useCallback(async (name) => {
    if (!confirm(`Delete category "${name}"? Words will have no category.`)) return;
    try {
      const res = await fetchWithRetry(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { addToast(data.error || 'Failed to delete category.', 'error'); return; }
      setCategories(prev => prev.filter(c => c.name !== name));
      setWords(prev => prev.map(w => w.category === name ? { ...w, category: null } : w));
      if (categoryFilter === name) setCategoryFilter(null);
      addToast(`Category "${name}" deleted`, 'success');
    } catch (e) { addToast('Delete failed: ' + e.message, 'error'); }
  }, [categoryFilter, addToast]);

  // ── API: Move words (by index) ──
  const moveWordsToCategory = useCallback(async (indices, categoryName) => {
    const cat = categoryName || null;
    const catLabel = cat ? `"${cat}"` : "No Category";

    setWords(prev => prev.map(w => {
      if (indices.includes(w.index)) {
        return { ...w, category: cat };
      }
      return w;
    }));

    try {
      const res = await fetchWithRetry('/api/words/move-category', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices, category: cat })
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Move failed.', 'error');
        setWords(prev => prev.map(w => {
          if (indices.includes(w.index)) {
            return { ...w, category: w.category === cat ? null : cat };
          }
          return w;
        }));
      } else {
        addToast(`${indices.length} word(s) moved to ${catLabel}`, 'success');
      }
    } catch (e) {
      addToast('Move failed: ' + e.message, 'error');
      setWords(prev => prev.map(w => {
        if (indices.includes(w.index)) {
          return { ...w, category: w.category === cat ? null : cat };
        }
        return w;
      }));
    }
  }, [addToast]);

  // ── API: Word popup generate ──
  const popupGenerate = useCallback(async () => {
    const en = popupWord.trim();
    const fa = popupFa.trim();
    if (!en) return;
    setPopupLoading(true);
    try {
      const res = await fetchWithRetry('/api/words', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english: en, persian: fa, aigen: true, category: popupCategory || null })
      });
      const data = await res.json();
      if (!res.ok) { showAlert(setPopupAlert, data.error || 'Generation failed.'); return; }
      if (data.action === 'merged') {
        setWords(prev => prev.map(w => w.english === en ? { ...data.word, category: w.category } : w));
        showAlert(setPopupAlert, `"${en}" already exists — meaning merged!`, 'success');
        addToast(`Merged meaning into "${en}"`, 'success');
      } else {
        setWords(prev => [...prev, data.word]);
        setWordcount(prev => prev + 1);
        addToast(`Added "${data.word.english}"`, 'success');
      }
      setPopupOpen(false);
    } catch (e) {
      showAlert(setPopupAlert, 'Network error — please try again.');
    } finally { setPopupLoading(false); }
  }, [popupWord, popupFa, popupCategory, showAlert, addToast]);

  // ── Bulk actions ──
  const bulkDelete = useCallback(async () => {
    if (!selectedIndices.size) return;
    const count = selectedIndices.size;
    if (!confirm(`Delete ${count} word${count !== 1 ? 's' : ''}?`)) return;

    const indices = [...selectedIndices];
    const removed = words.filter(w => indices.includes(w.index));

    setWords(prev => prev.filter(w => !indices.includes(w.index)));
    setSelectedIndices(new Set());
    setSelectMode(false);
    addToast(`Deleted ${count} word${count !== 1 ? 's' : ''}`, 'success');

    try {
      const res = await fetchWithRetry('/api/words/delete-multiple', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices })
      });
      const data = await res.json();
      if (!data.ok) {
        setWords(prev => [...prev, ...removed]);
        addToast(data.error || 'Delete failed — words restored.', 'error');
      }
    } catch (e) {
      setWords(prev => [...prev, ...removed]);
      addToast('Delete failed — words restored: ' + e.message, 'error');
    }
  }, [selectedIndices, words, addToast]);

  const bulkMove = useCallback(async (category) => {
    if (!selectedIndices.size) return;
    const indices = [...selectedIndices];
    await moveWordsToCategory(indices, category);
    setSelectedIndices(new Set());
    setSelectMode(false);
  }, [selectedIndices, moveWordsToCategory]);

  const openEdit = useCallback((wordIndex) => {
    const word = words.find(w => w.index === wordIndex);
    if (!word) return;
    setEditIndex(wordIndex);
    setEditEn(word.english);
    setEditFa(word.persian);
    setEditAlts((word.alternatives || []).join('\n'));
    setEditCategory(word.category || '');
    setEditOpen(true);
  }, [words]);

  const openPopup = useCallback((word) => {
    setPopupWord(word);
    setPopupFa('');
    setPopupCategory(categoryFilter || '');
    setPopupAlert({ msg: '', type: 'error' });
    setPopupOpen(true);
  }, [categoryFilter]);

  // ── Render ──
  return (
    <>
      {/* Header */}
      <header>
        <div>
          <div className="wordmark">My Word<span>Book</span></div>
          <div className="word-count">
            {loading ? 'Loading…' : `${wordcount} word${wordcount !== 1 ? 's' : ''} saved`}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        {[
          ['library', '📚 Library'], ['import', '📋 Batch Import'],
          ['practice', '🎯 Practice'], ['defs', '🔤 Multiple Meanings']
        ].map(([id, label]) => (
          <button key={id} className={`tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </nav>

      {/* Library Tab */}
      {activeTab === 'library' && (
        <Library
          words={words} categories={categories} bookmarkedWords={bookmarkedWords}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          bookmarkFilter={bookmarkFilter} setBookmarkFilter={setBookmarkFilter}
          selectMode={selectMode} setSelectMode={setSelectMode}
          selectedIndices={selectedIndices} setSelectedIndices={setSelectedIndices}
          filteredWords={filteredWords}
          addWord={addWord}
          addEn={addEn} setAddEn={setAddEn}
          addFa={addFa} setAddFa={setAddFa}
          addAiGen={addAiGen} setAddAiGen={setAddAiGen}
          addAlts={addAlts} setAddAlts={setAddAlts}
          addStyleEnabled={addStyleEnabled} setAddStyleEnabled={setAddStyleEnabled}
          addStyle={addStyle} setAddStyle={setAddStyle}
          addCustomStyle={addCustomStyle} setAddCustomStyle={setAddCustomStyle}
          addAdvancedOpen={addAdvancedOpen} setAddAdvancedOpen={setAddAdvancedOpen}
          addAlert={addAlert}
          openEdit={openEdit} deleteWord={deleteWord} openPopup={openPopup}
          bulkDelete={bulkDelete} bulkMove={bulkMove}
          setCatName={setCatName} setCatDesc={setCatDesc}
          setCatAlert={setCatAlert} setCatModalOpen={setCatModalOpen}
          isBookmarked={isBookmarked} toggleBookmark={toggleBookmark}
          addToast={addToast} fetchWithRetry={fetchWithRetry}
          moveWordsToCategory={moveWordsToCategory}
        />
      )}

      {/* Batch Import Tab */}
      {activeTab === 'import' && (
        <BatchImport words={words} setWords={setWords} addToast={addToast} fetchWithRetry={fetchWithRetry} />
      )}

      {/* Practice Tab */}
      {activeTab === 'practice' && (
        <Practice words={words} categories={categories}
          bookmarkedWords={bookmarkedWords} isBookmarked={isBookmarked} toggleBookmark={toggleBookmark}
          addToast={addToast} fetchWithRetry={fetchWithRetry} moveWordsToCategory={moveWordsToCategory} />
      )}

      {/* Multiple Meanings Tab */}
      {activeTab === 'defs' && (<MultipleMeanings fetchWithRetry={fetchWithRetry} />)}

      {/* Edit Modal */}
      {editOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <div className="modal">
            <div className="modal-title">Edit Word</div>
            <div className="field">
              <label>English</label>
              <input type="text" value={editEn} onChange={e => setEditEn(e.target.value)} />
            </div>
            <div className="field">
              <label>Persian (فارسی)</label>
              <input type="text" dir="rtl" value={editFa} onChange={e => setEditFa(e.target.value)} />
            </div>
            <div className="field">
              <label>Alternative sentences (same meaning, one per line)</label>
              <textarea rows="3" placeholder="Optional alternative sentences..."
                value={editAlts} onChange={e => setEditAlts(e.target.value)} />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                <option value="">No Category</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {editAlert.msg && <div className={`alert show alert-${editAlert.type}`}>{editAlert.msg}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="btn btn-ai" disabled={editAIGen} onClick={editAIGenerate}>
                {editAIGen ? '⏳ Generating…' : '✨ Generate Sentence'}
              </button>
              <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Word Popup */}
      {popupOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setPopupOpen(false); }}>
          <div className="modal">
            <div className="modal-title">Generate Sentence for Word</div>
            <div className="field">
              <label>English</label>
              <input type="text" readOnly value={popupWord} />
            </div>
            <div className="field">
              <label>Persian (فارسی) — optional</label>
              <input type="text" dir="rtl" placeholder="e.g. سخت"
                value={popupFa} onChange={e => setPopupFa(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') popupGenerate(); }} />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={popupCategory} onChange={e => setPopupCategory(e.target.value)}>
                <option value="">No Category</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {popupAlert.msg && <div className={`alert show alert-${popupAlert.type}`}>{popupAlert.msg}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPopupOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={popupLoading} onClick={popupGenerate}>
                {popupLoading ? '⏳ Generating…' : '✨ Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {catModalOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setCatModalOpen(false); }}>
          <div className="modal">
            <div className="modal-title">Create Category</div>
            <div className="field">
              <label>Category Name *</label>
              <input type="text" placeholder="e.g. Grammar" value={catName}
                onChange={e => setCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') document.getElementById('cat-modal-save')?.click(); }} />
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <textarea rows="2" placeholder="Optional description..."
                value={catDesc} onChange={e => setCatDesc(e.target.value)} />
            </div>
            {catAlert.msg && <div className={`alert show alert-${catAlert.type}`}>{catAlert.msg}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setCatModalOpen(false)}>Cancel</button>
              <button id="cat-modal-save" className="btn btn-primary" onClick={async () => {
                const name = catName.trim();
                if (!name) { showAlert(setCatAlert, 'Category name is required.'); return; }
                const ok = await createCategory(name, catDesc.trim());
                if (ok) setCatModalOpen(false);
              }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <MobileBottomNav
        activeTab={activeTab} setActiveTab={setActiveTab}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        categories={categories}
        mbnVisible={mbnVisible} setMbnVisible={setMbnVisible}
        mbnNavOpen={mbnNavOpen} setMbnNavOpen={setMbnNavOpen}
        mbnCatOpen={mbnCatOpen} setMbnCatOpen={setMbnCatOpen}
        scrollToTop={scrollToTop} setScrollToTop={setScrollToTop}
        setCatName={setCatName} setCatDesc={setCatDesc}
        setCatAlert={setCatAlert} setCatModalOpen={setCatModalOpen}
      />

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast-item" style={{
            background: t.type === 'success' ? '#22c55e' : t.type === 'error' ? '#ef4444' : t.type === 'warn' ? '#f59e0b' : '#3b82f6',
          }}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}
