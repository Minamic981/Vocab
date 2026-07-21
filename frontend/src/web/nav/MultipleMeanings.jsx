import React, { useState, useRef, useCallback } from 'react';
import { SegmentedEnglish } from '../../common/utils.jsx';

export default function MultipleMeanings({ fetchWithRetry }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ msg: '', type: 'error' });
  const [result, setResult] = useState(null);
  const [empty, setEmpty] = useState(false);

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

    try {
      const res = await fetchWithRetry(`/defs/${encodeURIComponent(w)}`, { method: 'POST' });
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
        return;
      }

      setResult({ mainWord: data.main_word || w, definitions: defs });
    } catch (e) {
      setAlert({ msg: 'Error: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [fetchWithRetry]);

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
                    <td className="defs-td defs-td-en"><SegmentedEnglish text={d.english} onWordClick={handleLookup} /></td>
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
    </div>
  );
}