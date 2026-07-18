import React, { useRef, useCallback } from 'react';
import speakWord, { escHtml, SegmentedEnglish } from '../common/utils';
import ExportButton from '../components/ExportButton.jsx';
const RAINBOW = ['#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#0ABDE3', '#A29BFE', '#6C5CE7', '#FD79A8', '#FDCB6E', '#00CEC9', '#E17055', '#74B9FF'];

export default function Library({
  words, categories, bookmarkedWords,
  searchQuery, setSearchQuery,
  categoryFilter, setCategoryFilter,
  bookmarkFilter, setBookmarkFilter,
  selectMode, setSelectMode,
  selectedIndices, setSelectedIndices,
  filteredWords,
  addWord, addEn, setAddEn, addFa, setAddFa,
  addAiGen, setAddAiGen, addAlts, setAddAlts,
  addStyleEnabled, setAddStyleEnabled,
  addStyle, setAddStyle,
  addCustomStyle, setAddCustomStyle,
  addAdvancedOpen, setAddAdvancedOpen,
  addAlert,
  openEdit, deleteWord, openPopup,
  bulkDelete, bulkMove,
  setCatName, setCatDesc, setCatAlert, setCatModalOpen,
  addToast,
}) {
  const addEnRef = useRef(null);
  const bookmarkFilterLabels = { all: '🔖 All', bookmarked: '🔖 Bookmarked', unbookmarked: '🔖 Unbookmarked' };

  const cycleBookmarkFilter = () => {
    const cycle = ['all', 'bookmarked', 'unbookmarked'];
    const next = cycle[(cycle.indexOf(bookmarkFilter) + 1) % cycle.length];
    setBookmarkFilter(next);
  };

  return (
    <div className="tab-panel active">
      {/* Search bar */}
      <div className="search-bar">
        <input ref={addEnRef} type="text" placeholder="Search words…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={cycleBookmarkFilter}
          title="Filter bookmarked words">{bookmarkFilterLabels[bookmarkFilter]}</button>
        <button className={`btn btn-ghost btn-sm ${selectMode ? 'active' : ''}`}
          onClick={() => { setSelectMode(!selectMode); setSelectedIndices(new Set()); }}>
          {selectMode ? 'Done' : 'Select'}
        </button>
        <ExportButton words={words} categories={categories} />
      </div>

      {/* Category bar */}
      <div className="category-bar">
        <select className="category-filter-select" value={categoryFilter === null ? 'all' : categoryFilter}
          onChange={e => setCategoryFilter(e.target.value === 'all' ? null : e.target.value || "")}>
          <option value="all">All</option>
          <option value="">No Category</option>
          {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          setCatName(''); setCatDesc(''); setCatAlert({ msg: '', type: 'error' });
          setCatModalOpen(true);
        }}>+ Create</button>
      </div>

      {/* Bulk actions */}
      {selectMode && (
        <div className="bulk-actions">
          <span className="bulk-count">{selectedIndices.size} selected</span>
          <label className="bulk-move-label">📁 Move to:</label>
          <select className="bulk-move-select" value="" onChange={e => {
            if (e.target.value) bulkMove(e.target.value === '__none__' ? null : e.target.value);
          }}>
            <option value="">— Select Category —</option>
            <option value="__none__">No Category</option>
            {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <button className="btn btn-danger btn-sm" onClick={bulkDelete}>Delete Selected</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSelectMode(false); setSelectedIndices(new Set()); }}>Cancel</button>
        </div>
      )}

      {/* Word list */}
      <div id="word-list">
        {filteredWords.length === 0 ? (
          <div className="no-words">
            {searchQuery ? 'No matches found.' :
              bookmarkFilter === 'bookmarked' ? 'No bookmarked words yet.' :
                bookmarkFilter === 'unbookmarked' ? 'All words are bookmarked.' :
                  'No words yet — add one below!'}
          </div>
        ) : filteredWords.map(({ word: w, idx }) => {
          const isBookmarked = bookmarkedWords.includes(w.english);
          const isSelected = selectedIndices.has(idx);
          const alts = w.alternatives || [];
          const isTribute = w.english.toLowerCase().includes('tachiba san');
          const tributeClass = isTribute ? ' word-row-tribute' : '';

          return (
            <div key={idx} className="word-row-wrap">
              <div className={`word-row ${isSelected ? 'selected' : ''}${tributeClass}`}>
                {selectMode && (
                  <input type="checkbox" className="word-checkbox" checked={isSelected}
                    onChange={() => {
                      setSelectedIndices(prev => {
                        const next = new Set(prev);
                        isSelected ? next.delete(idx) : next.add(idx);
                        return next;
                      });
                    }} />
                )}
                <span className="word-index">{idx + 1}</span>
                {alts.length > 0 && (
                  <span className={`word-alt-arrow`}
                    title="Show alternatives" onClick={(e) => {
                      const el = e.currentTarget.nextElementSibling;
                      if (el) {
                        const open = el.classList.toggle('open');
                        e.currentTarget.classList.toggle('open', open);
                      }
                    }} />
                )}
                <span className="word-en">
                  {isTribute ? (
                    <>
                      {escHtml(w.english.slice(0, w.english.toLowerCase().lastIndexOf('tachiba san')))}
                      <span className="tribute-author">Tachiba San</span>
                    </>
                  ) : (
                    <SegmentedEnglish text={w.english} onSegmentClick={openPopup} doubleClick />
                  )}
                </span>
                <span className="word-fa">
                  {w.isGenerating ? (
                    <span className="wave-generating">
                      {'GENERATE'.split('').map((ch, i) => (
                        <span key={i} style={{ color: RAINBOW[i % RAINBOW.length], animationDelay: `${(i * 0.2).toFixed(2)}s` }}>{ch}</span>
                      ))}
                    </span>
                  ) : escHtml(w.persian)}
                </span>
                <div className="word-actions">
                  <button className="btn btn-speak-row btn-sm" title="Listen"
                    onClick={(e) => { e.stopPropagation(); speakWord(w.english); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(idx)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteWord(idx)}>✕</button>
                </div>
              </div>
              {alts.length > 0 && (
                <div className="word-alts">
                  {alts.map((a, i) => <div key={i} className="word-alt-item">- {escHtml(a)}</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Inline Add Form ── */}
      <div className="inline-add-card">
        <div className="inline-add-header">
          <span className="plus-icon">+</span> Add a new word
        </div>
        <div className="inline-add-fields">
          <div className="field">
            <label>English</label>
            <input ref={addEnRef} type="text" placeholder="e.g. tough"
              value={addEn} onChange={e => setAddEn(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addWord(); }} />
          </div>
          <div className="field">
            <label>Persian (فارسی)</label>
            <input type="text" className="add-fa" placeholder="e.g. سخت" dir="rtl"
              value={addFa} onChange={e => setAddFa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addWord(); }} />
          </div>
          <div className="field add-cat-field">
            <label>Category</label>
            <div className="add-cat-row">
              <select className="add-category-select" value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}>
                <option value="">No Category</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={addWord}>Add</button>
        </div>

        <label className="aigen-label">
          <input type="checkbox" checked={addAiGen} onChange={e => setAddAiGen(e.target.checked)} />
          ✨ Ai Generate Sentence
        </label>

        <div className="advanced-toggle" onClick={() => setAddAdvancedOpen(!addAdvancedOpen)}>
          <span className={`advanced-arrow ${addAdvancedOpen ? 'open' : ''}`}></span>
          Advanced
        </div>
        {addAdvancedOpen && (
          <div className="advanced-section open">
            <div className="field">
              <label>Alternative sentences (same meaning, one per line)</label>
              <textarea rows="3" placeholder={"She is highly skilled in her work.\nShe does her job extremely well."}
                value={addAlts} onChange={e => setAddAlts(e.target.value)} />
            </div>
            <label className="style-toggle-label">
              <input type="checkbox" checked={addStyleEnabled} onChange={e => setAddStyleEnabled(e.target.checked)} />
              Writing Style
            </label>
            {addStyleEnabled && (
              <div className="style-options visible">
                <div className="field">
                  <label>Sentence Style</label>
                  <select value={addStyle} onChange={e => setAddStyle(e.target.value)}>
                    <option value="" selected>User Manual</option>
                    <option value="romantic">Romantic</option>
                    <option value="formal">Formal</option>
                    <option value="humorous">Humorous</option>
                    <option value="poetic">Poetic</option>
                    <option value="minimalist">Minimalist</option>
                    <option value="academic">Academic</option>
                    <option value="casual">Casual</option>
                    <option value="dramatic">Dramatic</option>
                    <option value="simple">Simple Words</option>
                  </select>
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Custom Style (optional — overrides dropdown)</label>
                  <input type="text" placeholder="e.g. romantic, include keywords: love, heart, soul"
                    value={addCustomStyle} onChange={e => setAddCustomStyle(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}
        {addAlert.msg && (
          <div className={`inline-add-alert show alert-${addAlert.type}`}>{addAlert.msg}</div>
        )}
      </div>
    </div>
  );
}
