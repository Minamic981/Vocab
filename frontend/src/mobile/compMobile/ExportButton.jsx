import React, { useState } from 'react';

export default function ExportButton({ words, categories }) {
  const [open, setOpen] = useState(false);
  const [selectedCats, setSelectedCats] = useState(new Set());

  const toggleCat = (name) => {
    setSelectedCats(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCats(new Set(categories.map(c => c.name)));
  };

  const selectNone = () => {
    setSelectedCats(new Set());
  };

  const doExport = () => {
    const groups = {};

    for (const w of words) {
      const cat = w.category || null;
      if (selectedCats.size > 0 && !selectedCats.has(cat || '__none__')) continue;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(w);
    }

    let text = '';
    const catOrder = Object.keys(groups).sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    });

    for (const cat of catOrder) {
      const label = cat || 'No Category';
      text += `(${label})\n`;
      for (const w of groups[cat]) {
        text += `${w.english} = ${w.persian}\n`;
      }
      text += '\n';
    }

    const blob = new Blob([text.trim() + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vocabulary.txt';
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Export words as text">
        Export
      </button>

      {open && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal">
            <div className="modal-title">Export Words</div>
            <p className="batch-instruction">
              Select categories to export. Format:
              <code className="batch-code" style={{ display: 'block', marginTop: 6, whiteSpace: 'pre' }}>
                {`(Category Name)\nsentence = translation`}
              </code>
            </p>

            <div className="export-btn-row">
              <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select All</button>
              <button className="btn btn-ghost btn-sm" onClick={selectNone}>None</button>
              <span className="export-cat-count">
                {selectedCats.size === 0 ? 'All categories' : `${selectedCats.size} selected`}
              </span>
            </div>

            <div className="export-cats">
              {categories.map(c => (
                <label key={c.name} className={`export-cat-label ${selectedCats.has(c.name) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedCats.has(c.name)}
                    onChange={() => toggleCat(c.name)} className="checkbox-input" />
                  {c.name}
                </label>
              ))}
              <label className={`export-cat-label ${selectedCats.has('__none__') ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedCats.has('__none__')}
                  onChange={() => toggleCat('__none__')} className="checkbox-input" />
                No Category
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={doExport}>
                Export {selectedCats.size === 0 ? 'All' : `${selectedCats.size} Categor${selectedCats.size === 1 ? 'y' : 'ies'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
