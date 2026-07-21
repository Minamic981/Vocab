import React, { useState } from 'react';
import { SegmentedEnglish } from '../../common/utils.jsx';

export default function MultipleMeanings() {
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ msg: '', type: 'error' });
  const [result, setResult] = useState(null);
  const [empty, setEmpty] = useState(false);

  const handleLookup = async () => {
    const w = word.trim();
    if (!w) {
      setAlert({ msg: 'Enter a word first.', type: 'error' });
      return;
    }

    setLoading(true);
    setResult(null);
    setEmpty(false);
    setAlert({ msg: '', type: 'error' });

    try {
      const res = await fetch(`/defs/${encodeURIComponent(w)}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setAlert({ msg: data.error || 'Something went wrong.', type: 'error' });
        return;
      }

      const defs = data.definitions || [];
      if (!defs.length) {
        setEmpty(true);
        return;
      }

      setResult({ mainWord: data.main_word || word, definitions: defs });
    } catch (e) {
      setAlert({ msg: 'Network error: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleWordClick = (w) => {
    setWord(w);
    setLoading(true);
    setResult(null);
    setEmpty(false);
    setAlert({ msg: '', type: 'error' });

    fetch(`/defs/${encodeURIComponent(w)}`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (!data.definitions || !data.definitions.length) {
          setEmpty(true);
        } else {
          setResult({ mainWord: data.main_word || w, definitions: data.definitions });
        }
      })
      .catch(e => setAlert({ msg: 'Network error: ' + e.message, type: 'error' }))
      .finally(() => setLoading(false));
  };

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
              type="text"
              id="defs-en"
              placeholder="e.g. light"
              autoComplete="off"
              value={word}
              onChange={e => setWord(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLookup(); }}
            />
          </div>
          <button className="btn btn-primary defs-btn" onClick={handleLookup} disabled={loading}>
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
                    <td className="defs-td defs-td-en"><SegmentedEnglish text={d.english} onWordClick={handleWordClick} /></td>
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
