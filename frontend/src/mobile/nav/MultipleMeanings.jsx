import React, { useState, useRef, useCallback } from 'react';
import { SegmentedEnglish } from '../../common/utils.jsx';

export default function MultipleMeanings({ addToast }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ msg: '', type: 'error' });
  const [result, setResult] = useState(null);
  const [empty, setEmpty] = useState(false);

  // Add word popup state
  const [addOpen, setAddOpen] = useState(false);
  const [addEn, setAddEn] = useState('');
  const [addFa, setAddFa] = useState('');
  const [addCat, setAddCat] = useState('');
  const [addAlts, setAddAlts] = useState('');
  const [addStyleEnabled, setAddStyleEnabled] = useState(false);
  const [addStyle, setAddStyle] = useState('');
  const [addCustomStyle, setAddCustomStyle] = useState('');
  const [addAdvancedOpen, setAddAdvancedOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addAlert, setAddAlert] = useState({ msg: '', type: 'error' });

  const handleLookup = useCallback(async (w) => {
    w = w?.trim() || inputRef.current?.value?.trim() || null;
    if (!w) {
      setAlert({ msg: 'Enter a word first.', type: 'error' });
      return;
    }

    setLoading(true);
    setResult(null);
    setEmpty(false);
    setAlert({ msg: '', type: 'error' });

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`/defs/${encodeURIComponent(w)}`, { method: 'POST' });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = null; }

        if (!res.ok || !data) {
          const msg = data?.error || text.slice(0, 200) || `Server error (${res.status})`;
          throw new Error(msg);
        }

        const defs = data.definitions || [];
        if (!defs.length) {
          setEmpty(true);
          setLoading(false);
          return;
        }

        setResult({ mainWord: data.main_word || w, definitions: defs });
        setLoading(false);
        return;
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          setAlert({ msg: 'Error: ' + e.message, type: 'error' });
        }
      }
    }
    setLoading(false);
  }, [addToast]);

  const openAddPopup = useCallback((word) => {
    setAddEn(word || '');
    setAddFa('');
    setAddCat('');
    setAddAlts('');
    setAddStyleEnabled(false);
    setAddStyle('');
    setAddCustomStyle('');
    setAddAdvancedOpen(false);
    setAddAlert({ msg: '', type: 'error' });
    setAddOpen(true);
  }, []);

  const addWord = useCallback(async () => {
    const en = addEn.trim();
    const fa = addFa.trim();
    const alts = addAlts.trim();
    const style = addStyleEnabled ? addStyle : '';
    const customStyle = addStyleEnabled ? addCustomStyle.trim() : '';
    const cat = addCat || null;
    if (!en) { setAddAlert({ msg: 'English field is required.', type: 'error' }); return; }
    if (!fa) { setAddAlert({ msg: 'Persian field is required.', type: 'error' }); return; }

    setAddLoading(true);
    try {
      const res = await fetch('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english: en, persian: fa, alternatives: alts, style, custom_style: customStyle, category: cat })
      });
      const data = await res.json();
      if (!res.ok) { setAddAlert({ msg: data.error || 'Failed to add word.', type: 'error' }); return; }
      addToast(`Added "${en}"`, 'success');
      setAddOpen(false);
    } catch (e) {
      setAddAlert({ msg: 'Network error — please try again.', type: 'error' });
    } finally {
      setAddLoading(false);
    }
  }, [addEn, addFa, addAlts, addStyleEnabled, addStyle, addCustomStyle, addCat, addToast]);

  return (
    <div className="tab-panel active">
      <div className="inline-add-card">
        <div className="inline-add-header">
          <span className="plus-icon">🔤</span>
          Look up a word
        </div>
        <div className="inline-add-fields">
          <div className="field">
            <label htmlFor="defs-en">English word</label>
            <input
              ref={inputRef}
              type="text"
              id="defs-en"
              placeholder="e.g. light"
              autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter') handleLookup(e.target.value); }}
            />
          </div>
          <button className="btn btn-primary defs-btn" onClick={() => handleLookup()} disabled={loading}>
            {loading ? '⏳ Looking up…' : 'Look up'}
          </button>
        </div>
        {alert.msg && (
          <div className={`inline-add-alert show alert-${alert.type === 'warn' ? 'warn' : alert.type}`}>
            {alert.msg}
          </div>
        )}
      </div>

      {result && (
        <div className="defs-results">
          <div className="defs-word-title">{result.mainWord}</div>
          <div className="defs-table-wrap">
            <table className="defs-table">
              <thead>
                <tr>
                  <th className="defs-th defs-th-num">#</th>
                  <th className="defs-th">English Definition</th>
                  <th className="defs-th defs-th-fa">Persian (فارسی)</th>
                </tr>
              </thead>
              <tbody>
                {result.definitions.map((d, i) => (
                  <tr key={i}>
                    <td className="defs-td defs-td-num">{i + 1}</td>
                    <td className="defs-td defs-td-en">
                      <SegmentedEnglish text={d.english} onSegmentClick={openAddPopup} onWordClick={handleLookup} doubleClick />
                    </td>
                    <td className="defs-td defs-td-fa">{d.persian}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {empty && (
        <div className="no-words no-words-block">
          No definitions found for that word.
        </div>
      )}

      {/* Add Word Popup */}
      {addOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setAddOpen(false); }}>
          <div className="inline-add-card" style={{ maxWidth: 500, margin: '40px auto' }}>
            <div className="inline-add-header">
              <span className="plus-icon">+</span>
              Add Word
            </div>
            <div className="inline-add-fields">
              <div className="field">
                <label>English</label>
                <input type="text" value={addEn} onChange={e => setAddEn(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addWord(); }} />
              </div>
              <div className="field">
                <label>Persian (فارسی)</label>
                <input type="text" dir="rtl" placeholder="e.g. سخت" value={addFa}
                  onChange={e => setAddFa(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addWord(); }} />
              </div>
              <div className="field">
                <label>Category</label>
                <input type="text" placeholder="Optional" value={addCat}
                  onChange={e => setAddCat(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={addWord} disabled={addLoading}>
                {addLoading ? '⏳ Adding…' : 'Add'}
              </button>
            </div>

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
                    <div className="field">
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
            <div className="modal-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
