import React from 'react';

export default function MobileBottomNav({
  activeTab, setActiveTab,
  categoryFilter, setCategoryFilter,
  categories, filteredWords,
  mbnVisible, setMbnVisible,
  mbnNavOpen, setMbnNavOpen,
  mbnCatOpen, setMbnCatOpen,
  scrollToTop, setScrollToTop,
  selectMode, setSelectMode, selectedIndices, setSelectedIndices,
  bulkDelete, bulkMove, bulkBookmark,
}) {
  const allSelected = filteredWords.length > 0 && filteredWords.every(f => selectedIndices.has(f.idx));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIndices(new Set());
    else setSelectedIndices(new Set(filteredWords.map(f => f.idx)));
  };

  return (
    <>
      {mbnVisible ? (
        <>
          <div className="mobile-bottom-nav">
            <button className="mbn-btn" onClick={() => { setMbnNavOpen(!mbnNavOpen); setMbnCatOpen(false); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              <span>Nav</span>
            </button>
            <button className="mbn-btn" onClick={() => { setMbnCatOpen(!mbnCatOpen); setMbnNavOpen(false); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>Category</span>
            </button>
            <button className="mbn-btn" onClick={() => { window.scrollTo({ top: scrollToTop ? document.body.scrollHeight : 0, behavior: 'instant' }); setScrollToTop(!scrollToTop); }} title={scrollToTop ? 'Scroll to top' : 'Scroll to bottom'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              </svg>
            </button>
            <button className="mbn-btn" onClick={() => setMbnVisible(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>

          {/* Nav popup */}
          {mbnNavOpen && (
            <div className="mbn-popup open">
              {[
                ['library', '📚 Library'], ['import', '📋 Import'],
                ['practice', '🎯 Practice'], ['defs', '🔤 Defs']
              ].map(([id, label]) => (
                <button key={id} className={`mbn-popup-tab ${activeTab === id ? 'active' : ''}`}
                  onClick={() => { setActiveTab(id); setMbnNavOpen(false); }}>{label}</button>
              ))}
            </div>
          )}

          {/* Category popup */}
          {mbnCatOpen && (
            <div className="mbn-popup open">
              <button className={`mbn-cat-chip ${categoryFilter === null ? 'active' : ''}`}
                onClick={() => { setCategoryFilter(null); setMbnCatOpen(false); }}>All</button>
              <button className={`mbn-cat-chip ${categoryFilter === '' ? 'active' : ''}`}
                onClick={() => { setCategoryFilter(''); setMbnCatOpen(false); }}>No Category</button>
              {categories.map(c => (
                <button key={c.name} className={`mbn-cat-chip ${categoryFilter === c.name ? 'active' : ''}`}
                  onClick={() => { setCategoryFilter(c.name); setMbnCatOpen(false); }}>{c.name}</button>
              ))}
            </div>
          )}

          {/* Select mode bar */}
          {selectMode && (
            <div className="mbn-select-bar open">
              <span className="mbn-select-count">{selectedIndices.size} selected</span>
              <div className="mbn-select-actions">
                <button className="mbn-select-btn mbn-select-all" onClick={toggleSelectAll}>{allSelected ? '✕ All' : '☑ All'}</button>
                <label className="mbn-select-move-label">📁</label>
                <select className="mbn-bulk-move-select" value="" onChange={e => {
                  if (e.target.value) bulkMove(e.target.value === '__none__' ? null : e.target.value);
                }}>
                  <option value="">—</option>
                  <option value="__none__">No Category</option>
                  {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <button className="mbn-select-btn mbn-select-bookmark" onClick={() => bulkBookmark(true)}>🔖</button>
                <button className="mbn-select-btn mbn-select-unbookmark" onClick={() => bulkBookmark(false)}>🔖</button>
                <button className="mbn-select-btn mbn-select-delete" onClick={bulkDelete}>🗑</button>
                <button className="mbn-select-btn mbn-select-cancel" onClick={() => { setSelectMode(false); setSelectedIndices(new Set()); }}>✕</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <button className="mbn-show-nav" onClick={() => setMbnVisible(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}
    </>
  );
}
