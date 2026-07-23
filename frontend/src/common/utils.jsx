import React, { useState, useRef } from 'react';

export function filterByCategory(words, categoryFilter) {
  if (categoryFilter === null) {
    return words.filter(w => !["Adult", "test"].includes(w.category));
  } else if (categoryFilter === '') {
    return words.filter(w => !w.category);
  } else {
    return words.filter(w => w.category === categoryFilter);
  }
}

export function sortByIndex(words) {
  return [...words].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

export function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const wordSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('en', { granularity: 'word' }) : null;

export function segmentText(text) {
  if (!wordSegmenter || !text) return [{ text, word: false }];
  return [...wordSegmenter.segment(text)].map(s => ({ text: s.segment, word: s.isWordLike }));
}

export function SegmentedEnglish({ text, onSegmentClick, onWordClick, doubleClick = false }) {
  const [segmented, setSegmented] = useState(false);
  const ref = useRef(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || segmented) return;
    const handler = () => setSegmented(true);
    el.addEventListener('mouseenter', handler);
    return () => el.removeEventListener('mouseenter', handler);
  }, [segmented]);

  if (!segmented || !wordSegmenter) return <span ref={ref}>{escHtml(text)}</span>;

  const segments = segmentText(text);
  const clickHandler = onSegmentClick || onWordClick;
  const eventType = doubleClick ? 'onDoubleClick' : 'onClick';

  return (
    <>
      {segments.map((seg, i) =>
        seg.word ? (
          <span key={i} className="word-segment" style={{ cursor: 'pointer' }}
            {...{ [eventType]: (e) => { e.stopPropagation(); clickHandler(seg.text); } }}>
            {escHtml(seg.text)}
          </span>
        ) : <span key={i}>{escHtml(seg.text)}</span>
      )}
    </>
  );
}

// ── Bookmark system (localStorage-first, batch persist) ──────────────────────

const BK_STORAGE_KEY = 'pendingBookmarks';
const BK_UNBOOK_KEY = 'pendingUnbookmarks';

function _readBK(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function _writeBK(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}

function bookmarkAdd(index) {
  const pending = _readBK(BK_STORAGE_KEY);
  if (!pending.includes(index)) { pending.push(index); _writeBK(BK_STORAGE_KEY, pending); }
  const unbook = _readBK(BK_UNBOOK_KEY).filter(i => i !== index);
  _writeBK(BK_UNBOOK_KEY, unbook);
}

function bookmarkRemove(index) {
  const pending = _readBK(BK_STORAGE_KEY).filter(i => i !== index);
  _writeBK(BK_STORAGE_KEY, pending);
  const unbook = _readBK(BK_UNBOOK_KEY);
  if (!unbook.includes(index)) { unbook.push(index); _writeBK(BK_UNBOOK_KEY, unbook); }
}

function bookmarkIsPending(index) {
  return _readBK(BK_STORAGE_KEY).includes(index);
}

function bookmarkIsPendingUnbook(index) {
  return _readBK(BK_UNBOOK_KEY).includes(index);
}

function bookmarkHasPending() {
  return _readBK(BK_STORAGE_KEY).length > 0 || _readBK(BK_UNBOOK_KEY).length > 0;
}

function bookmarkIsBookmarked(word) {
  if (bookmarkIsPendingUnbook(word.index)) return false;
  if (bookmarkIsPending(word.index)) return true;
  return !!word.isBookmarked;
}

async function bookmarkPersist() {
  const bookmarks = _readBK(BK_STORAGE_KEY);
  const unbookmarks = _readBK(BK_UNBOOK_KEY);
  if (!bookmarks.length && !unbookmarks.length) return { synced: false };

  const res = await fetch('/api/words/bookmark', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarks, unbookmarks }),
  });
  if (!res.ok) throw new Error('Failed to persist bookmarks');

  localStorage.removeItem(BK_STORAGE_KEY);
  localStorage.removeItem(BK_UNBOOK_KEY);
  return { synced: true, bookmarks, unbookmarks };
}

export {
  bookmarkAdd, bookmarkRemove, bookmarkIsPending, bookmarkIsPendingUnbook,
  bookmarkHasPending, bookmarkIsBookmarked, bookmarkPersist,
};

export default function speakWord(word) {
  if (!word?.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word.trim());
  u.lang = 'en-US';
  u.rate = 0.8;
  const voices = speechSynthesis.getVoices();
  const preferred = ['Google US English', 'Samantha', 'Alex', 'Microsoft Zira'];
  let v = null;
  for (const p of preferred) { v = voices.find(x => x.name.includes(p)); if (v) break; }
  if (!v) v = voices.find(x => x.lang === 'en-US') || voices.find(x => x.lang.startsWith('en'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
