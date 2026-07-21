import React, { useRef } from 'react';

export default function FloatingNav({
  words, categories, activeTab, setActiveTab,
  searchQuery, setSearchQuery,
  bookmarkFilter, setBookmarkFilter,
  categoryFilter, setCategoryFilter,
  selectMode, setSelectMode, selectedIndices, setSelectedIndices,
  fnSearchOpen, setFnSearchOpen,
  fnAddOpen, setFnAddOpen,
  fnCatOpen, setFnCatOpen,
  fnNavVisible, setFnNavVisible,
  scrollToTop, setScrollToTop,
  fnAddEn, setFnAddEn,
  fnAddFa, setFnAddFa,
  fnAddAiGen, setFnAddAiGen,
  fnAddAlts, setFnAddAlts,
  fnAddStyleEnabled, setFnAddStyleEnabled,
  fnAddStyle, setFnAddStyle,
  fnAddCustomStyle, setFnAddCustomStyle,
  fnAddAdvancedOpen, setFnAddAdvancedOpen,
  fnAddAlert,
  fnAddWord,
  bulkDelete, bulkMove,
  setCatName, setCatDesc, setCatAlert, setCatModalOpen,
}) {
  const fnSearchRef = useRef(null);
  const fnAddEnRef = useRef(null);

  return (
    <>
      {fnNavVisible && (
        <div className="floating-nav" id="floating-nav">
          {/* Main toolbar */}
          <div className="fn-toolbar">
            <div className="fn-brand">
              <span className="fn-brand-text">My Word<span>Book</span></span>
              <span className="fn-word-count">{words.length} word{words.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="fn-tabs">
              {[
                ['library', '📚 Library'], ['import', '📋 Import'],
                ['practice', '🎯 Practice'], ['defs', '🔤 Meanings']
              ].map(([id, label]) => (
                <button key={id} className={`fn-tab ${activeTab === id ? 'active' : ''}`}
                  onClick={() => { setActiveTab(id); setFnSearchOpen(false); setFnAddOpen(false); setFnCatOpen(false); }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="fn-actions">
              {activeTab === 'library' && (
                <button className={`fn-btn ${fnCatOpen ? 'active' : ''}`} title="Category Switcher"
                  onClick={() => setFnCatOpen(!fnCatOpen)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                  </svg>
                </button>
              )}
              <button className="fn-btn" title="Hide floating bar" onClick={() => setFnNavVisible(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
              <button className="fn-btn" title={scrollToTop ? 'Scroll to bottom' : 'Scroll to top'}
                onClick={() => { window.scrollTo({ top: scrollToTop ? document.body.scrollHeight : 0, behavior: 'instant' }); setScrollToTop(!scrollToTop); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="8" x2="19" y2="8" /><line x1="5" y1="16" x2="19" y2="16" />
                </svg>
              </button>
              <button className={`fn-btn ${fnSearchOpen ? 'active' : ''}`} title="Search words"
                onClick={() => { setFnSearchOpen(!fnSearchOpen); setFnAddOpen(false); setTimeout(() => fnSearchRef.current?.focus(), 100); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
              <button className={`fn-btn ${selectMode ? 'active' : ''}`} title="Select multiple words"
                onClick={() => { setSelectMode(!selectMode); setSelectedIndices(new Set()); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </button>
              <button className={`fn-btn ${fnAddOpen ? 'active' : ''}`} title="Add a new word"
                onClick={() => { setFnAddOpen(!fnAddOpen); setFnSearchOpen(false); setTimeout(() => fnAddEnRef.current?.focus(), 100); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Category switcher popup (above navbar) */}
          {fnCatOpen && activeTab === 'library' && (
            <div className="fn-cat-popup">
              <div className="fn-cat-popup-inner">
                <button className={`fn-cat-popup-item ${categoryFilter === null ? 'active' : ''}`}
                  onClick={() => { setCategoryFilter(null); setFnCatOpen(false); }}>
                  All
                </button>
                <button className={`fn-cat-popup-item ${categoryFilter === '' ? 'active' : ''}`}
                  onClick={() => { setCategoryFilter(''); setFnCatOpen(false); }}>
                  No Category
                </button>
                {categories.map(c => (
                  <button key={c.name} className={`fn-cat-popup-item ${categoryFilter === c.name ? 'active' : ''}`}
                    onClick={() => { setCategoryFilter(c.name); setFnCatOpen(false); }}>
                    {c.name}
                  </button>
                ))}
                <button className="fn-cat-popup-item fn-cat-popup-create"
                  onClick={() => {
                    setCatName(''); setCatDesc(''); setCatAlert({ msg: '', type: 'error' });
                    setCatModalOpen(true); setFnCatOpen(false);
                  }}>
                  + Create
                </button>
              </div>
            </div>
          )}

          {/* Select mode bar */}
          {selectMode && (
            <div className="fn-select-bar open">
              <span className="fn-select-count">{selectedIndices.size} selected</span>
              <div className="fn-select-actions">
                <label className="fn-select-move-label">📁 Move to:</label>
                <select className="fn-bulk-move-select" value="" onChange={e => {
                  if (e.target.value) bulkMove(e.target.value === '__none__' ? null : e.target.value);
                }}>
                  <option value="">— Select Category —</option>
                  <option value="__none__">No Category</option>
                  {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <button className="fn-select-btn fn-select-delete" onClick={bulkDelete}>Delete</button>
                <button className="fn-select-btn fn-select-cancel" onClick={() => { setSelectMode(false); setSelectedIndices(new Set()); }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Search panel */}
          {fnSearchOpen && (
            <div className="fn-search-panel open">
              <div className="fn-search-row">
                <input ref={fnSearchRef} type="text" placeholder="Search words…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="fn-search-filters">
                <button className={`fn-chip ${bookmarkFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setBookmarkFilter('all')}>🔖 All</button>
                <button className={`fn-chip ${bookmarkFilter === 'bookmarked' ? 'active' : ''}`}
                  onClick={() => setBookmarkFilter('bookmarked')}>🔖 Bookmarked</button>
                <button className={`fn-chip ${bookmarkFilter === 'unbookmarked' ? 'active' : ''}`}
                  onClick={() => setBookmarkFilter('unbookmarked')}>🔖 Unbookmarked</button>
                <button className={`fn-chip ${fnCatOpen ? 'active' : ''}`}
                  onClick={() => setFnCatOpen(!fnCatOpen)}>📁 Categories</button>
              </div>
              {fnCatOpen && (
                <div className="fn-categories">
                  <button className={`fn-chip ${categoryFilter === null ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(null)}>All</button>
                  <button className={`fn-chip ${categoryFilter === '' ? 'active' : ''}`}
                    onClick={() => setCategoryFilter('')}>No Category</button>
                  {categories.map(c => (
                    <button key={c.name} className={`fn-chip ${categoryFilter === c.name ? 'active' : ''}`}
                      onClick={() => setCategoryFilter(c.name)}>{c.name}</button>
                  ))}
                  <button className="fn-chip" onClick={() => {
                    setCatName(''); setCatDesc(''); setCatAlert({ msg: '', type: 'error' });
                    setCatModalOpen(true);
                  }}>+ Create</button>
                </div>
              )}
            </div>
          )}

          {/* Add panel */}
          {fnAddOpen && (
            <div className="fn-add-panel open">
              <div className="fn-add-fields">
                <div className="field">
                  <label>English</label>
                  <input ref={fnAddEnRef} type="text" placeholder="e.g. tough"
                    value={fnAddEn} onChange={e => setFnAddEn(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') fnAddWord(); }} />
                </div>
                <div className="field">
                  <label>Persian (فارسی)</label>
                  <input type="text" placeholder="e.g. سخت" dir="rtl"
                    value={fnAddFa} onChange={e => setFnAddFa(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') fnAddWord(); }} />
                </div>
                <div className="field fn-cat-field">
                  <label>Category</label>
                  <select className="add-category-select" value={categoryFilter === null ? "all" : categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">No Category</option>
                    {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary fn-add-btn" onClick={fnAddWord}>Add</button>
              </div>
              <div className="fn-add-extras">
                <label className="aigen-label">
                  <input type="checkbox" checked={fnAddAiGen} onChange={e => setFnAddAiGen(e.target.checked)} />
                  ✨ Ai Generate Sentence
                </label>
                <div className="fn-advanced-toggle" onClick={() => setFnAddAdvancedOpen(!fnAddAdvancedOpen)}>
                  <span className={`fn-advanced-arrow ${fnAddAdvancedOpen ? 'open' : ''}`}></span>
                  Advanced
                </div>
              </div>
              {fnAddAdvancedOpen && (
                <div className="fn-advanced-section open">
                  <div className="field">
                    <label>Alternative sentences (one per line)</label>
                    <textarea rows="2" placeholder={"She is highly skilled in her work.\nShe does her job extremely well."}
                      value={fnAddAlts} onChange={e => setFnAddAlts(e.target.value)} />
                  </div>
                  <label className="style-toggle-label">
                    <input type="checkbox" checked={fnAddStyleEnabled} onChange={e => setFnAddStyleEnabled(e.target.checked)} />
                    Writing Style
                  </label>
                  {fnAddStyleEnabled && (
                    <div className="style-options visible">
                      <div className="field">
                        <label>Sentence Style</label>
                        <select value={fnAddStyle} onChange={e => setFnAddStyle(e.target.value)}>
                          <option value="">User Manual</option>
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
                      <div className="field">
                        <label>Custom Style (optional — overrides dropdown)</label>
                        <input type="text" placeholder="e.g. romantic, include keywords: love, heart, soul"
                          value={fnAddCustomStyle} onChange={e => setFnAddCustomStyle(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              )}
              {fnAddAlert.msg && (
                <div className={`inline-add-alert show alert-${fnAddAlert.type}`}>{fnAddAlert.msg}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Show floating bar button (when hidden) */}
      {!fnNavVisible && (
        <button className="fn-show-nav fn-show-nav-fixed" onClick={() => setFnNavVisible(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
          <span>Floating Bar</span>
        </button>
      )}
    </>
  );
}
