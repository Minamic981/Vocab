import React, { useState, useMemo } from 'react';

function parseImportText(text) {
  const lines = text.split('\n');
  const items = [];
  let currentCategory = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const catMatch = line.match(/^\((.+)\)$/);
    if (catMatch) {
      currentCategory = catMatch[1];
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const english = line.slice(0, eqIdx).trim();
    const persian = line.slice(eqIdx + 1).trim();
    if (!english || !persian) continue;

    items.push({ english, persian, category: currentCategory });
  }

  return items;
}

export default function BatchImport({ words, setWords, categories, addToast, fetchWithRetry }) {
  const [importText, setImportText] = useState('');
  const [importAlert, setImportAlert] = useState({ msg: '', type: 'error' });
  const [importing, setImporting] = useState(false);
  const [selectedCats, setSelectedCats] = useState(new Set());

  const parsedItems = useMemo(() => parseImportText(importText), [importText]);

  const parsedCategories = useMemo(() => {
    const cats = new Set();
    for (const item of parsedItems) {
      if (item.category) cats.add(item.category);
    }
    return [...cats].sort();
  }, [parsedItems]);

  const existingKeys = useMemo(() => {
    const keys = new Set();
    for (const w of words) {
      keys.add(`${w.english}|||${w.persian}`);
    }
    return keys;
  }, [words]);

  const toggleCat = (name) => {
    setSelectedCats(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCats(new Set(parsedCategories));
  };

  const selectNone = () => {
    setSelectedCats(new Set());
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      setImportAlert({ msg: 'Paste some words first.', type: 'error' });
      return;
    }

    if (parsedItems.length === 0) {
      setImportAlert({ msg: 'No valid words found. Use format: English = فارسی', type: 'error' });
      return;
    }

    setImporting(true);
    try {
      const text = parsedItems
        .filter(item => {
          if (item.category && selectedCats.size > 0 && !selectedCats.has(item.category)) return false;
          return true;
        })
        .map(item => {
          const line = `${item.english} = ${item.persian}`;
          return item.category ? `(${item.category})\n${line}` : line;
        })
        .join('\n');

      const res = await fetchWithRetry('/api/words/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();

      if (!res.ok) {
        setImportAlert({ msg: data.error, type: 'error' });
        return;
      }

      setWords(prev => [...prev, ...data.added]);
      setImportText('');
      setSelectedCats(new Set());

      let msg = `Added ${data.added_count} word${data.added_count !== 1 ? 's' : ''}.`;
      let type = 'success';
      if (data.duplicates.length) {
        msg += ` ${data.duplicates.length} duplicate${data.duplicates.length > 1 ? 's' : ''} skipped.`;
        type = 'warn';
      }
      if (data.errors.length) msg += ` ${data.errors.length} line${data.errors.length > 1 ? 's' : ''} had errors.`;
      setImportAlert({ msg, type });
      addToast(msg, data.added_count > 0 ? 'success' : 'warn');
    } catch (e) {
      setImportAlert({ msg: 'Network error — please try again.', type: 'error' });
      addToast('Import failed: ' + e.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="tab-panel active">
      <div className="card">
        <div className="card-title">Paste Words from Clipboard</div>
        <p className="batch-instruction">
          One word per line in the format:
          <code className="batch-code">
            English = فارسی
          </code>
        </p>
        <p className="batch-instruction">
          Or paste export format with category headers:
          <code className="batch-code" style={{ display: 'block', marginTop: 6, whiteSpace: 'pre' }}>
            {`(Category Name)\nEnglish sentence = Persian translation`}
          </code>
        </p>
        <div className="field">
          <label htmlFor="import-text">Paste here</label>
          <textarea
            id="import-text"
            rows="8"
            placeholder={"(Adult)\nshe came out as gay to her family. = او به خانواده‌اش اعلام کرد.\n\n(Checked)\nThe new software feels clunky. = نرم‌افزار جدید دست و پا چلفتی است."}
            value={importText}
            onChange={e => setImportText(e.target.value)}
          />
        </div>

        {parsedCategories.length > 0 && (
          <div className="import-cat-section">
            <div className="import-cat-header">
              <span className="import-cat-title">Categories found in input:</span>
              <div className="import-cat-actions">
                <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select All</button>
                <button className="btn btn-ghost btn-sm" onClick={selectNone}>None</button>
              </div>
            </div>
            <div className="import-cats">
              {parsedCategories.map(cat => (
                <label key={cat} className={`import-cat-label ${selectedCats.has(cat) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedCats.has(cat)}
                    onChange={() => toggleCat(cat)} className="checkbox-input" />
                  {cat}
                </label>
              ))}
            </div>
            <p className="import-cat-hint">
              {selectedCats.size === 0
                ? 'No category selected — all words will be imported'
                : `${selectedCats.size} categor${selectedCats.size === 1 ? 'y' : 'ies'} selected`}
            </p>
          </div>
        )}

        {parsedItems.length > 0 && (
          <div className="import-preview">
            <span className="import-preview-count">
              {parsedItems.length} word{parsedItems.length !== 1 ? 's' : ''} detected
              {(() => {
                const dupCount = parsedItems.filter(item => existingKeys.has(`${item.english}|||${item.persian}`)).length;
                return dupCount > 0 ? ` (${dupCount} duplicate${dupCount !== 1 ? 's' : ''} will be skipped)` : '';
              })()}
            </span>
          </div>
        )}

        <div className="batch-btn-row">
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : `Import${selectedCats.size > 0 ? ` ${selectedCats.size} Categor${selectedCats.size === 1 ? 'y' : 'ies'}` : ' All'}`}
          </button>
        </div>
        {importAlert.msg && (
          <div className={`alert show alert-${importAlert.type === 'warn' ? 'warn' : importAlert.type}`}>
            {importAlert.msg}
          </div>
        )}
      </div>
    </div>
  );
}
