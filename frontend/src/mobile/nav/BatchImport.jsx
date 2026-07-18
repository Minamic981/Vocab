import React, { useState } from 'react';

export default function BatchImport({ words, setWords, addToast, fetchWithRetry }) {
  const [importText, setImportText] = useState('');
  const [importAlert, setImportAlert] = useState({ msg: '', type: 'error' });
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!importText.trim()) {
      setImportAlert({ msg: 'Paste some words first.', type: 'error' });
      return;
    }

    setImporting(true);
    try {
      const res = await fetchWithRetry('/api/words/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText })
      });
      const data = await res.json();

      if (!res.ok) {
        setImportAlert({ msg: data.error, type: 'error' });
        return;
      }

      setWords(prev => [...prev, ...data.added]);
      setImportText('');

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
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 14 }}>
          One word per line in the format:
          <code style={{ background: 'var(--paper-2)', padding: '2px 6px', borderRadius: 4 }}>
            English = فارسی
          </code>
        </p>
        <div className="field">
          <label htmlFor="import-text">Paste here</label>
          <textarea
            id="import-text"
            rows="6"
            placeholder={"tough = سخت\ndepiction = تصویر سازی\ndeserve = لیاقت"}
            value={importText}
            onChange={e => setImportText(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : 'Import All'}
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
