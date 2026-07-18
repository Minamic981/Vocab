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
            <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 14 }}>
              Select categories to export. Format:
              <code style={{ background: 'var(--paper-2)', padding: '2px 6px', borderRadius: 4, display: 'block', marginTop: 6, whiteSpace: 'pre' }}>
                {`(Category Name)\nEnglish sentence = Persian translation`}
              </code>
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select All</button>
              <button className="btn btn-ghost btn-sm" onClick={selectNone}>None</button>
              <span style={{ fontSize: 12, color: 'var(--ink-faint)', alignSelf: 'center' }}>
                {selectedCats.size === 0 ? 'All categories' : `${selectedCats.size} selected`}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {categories.map(c => (
                <label key={c.name} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--rule)', fontSize: 13,
                  background: selectedCats.has(c.name) ? 'var(--accent-subtle)' : 'var(--paper-2)',
                  borderColor: selectedCats.has(c.name) ? 'var(--accent)' : 'var(--rule)',
                }}>
                  <input type="checkbox" checked={selectedCats.has(c.name)}
                    onChange={() => toggleCat(c.name)} style={{ margin: 0 }} />
                  {c.name}
                </label>
              ))}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--rule)', fontSize: 13,
                background: selectedCats.has('__none__') ? 'var(--accent-subtle)' : 'var(--paper-2)',
                borderColor: selectedCats.has('__none__') ? 'var(--accent)' : 'var(--rule)',
              }}>
                <input type="checkbox" checked={selectedCats.has('__none__')}
                  onChange={() => toggleCat('__none__')} style={{ margin: 0 }} />
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
