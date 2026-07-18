import React, { useState, useEffect, useRef, useCallback } from 'react';
import speakWord from '../common/utils';
const PRACTICE_FILTERS = [
  { key: 'all', label: '🔖 All', title: 'Show all words' },
  { key: 'bookmarked', label: '🔖 Bookmarked', title: 'Show only bookmarked' },
  { key: 'unbookmarked', label: '🔖 Unbookmarked', title: 'Show only unbookmarked' },
];
export default function Practice({
  words, categories, bookmarkedWords, isBookmarked, toggleBookmark,
  addToast, fetchWithRetry, moveWordsToCategory,
}) {

  const [practiceQueue, setPracticeQueue] = useState([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [practiceFilter, setPracticeFilter] = useState('all');
  const [practiceCatFilter, setPracticeCatFilter] = useState(null);

  const getFilteredWords = useCallback(() => {
    let result = [...words];
    if (practiceFilter === 'bookmarked') result = result.filter(w => isBookmarked(w.english));
    else if (practiceFilter === 'unbookmarked') result = result.filter(w => !isBookmarked(w.english));
    if (practiceCatFilter !== null) {
      if (practiceCatFilter === '') {
        result = result.filter(w => !w.category);
      } else {
        result = result.filter(w => w.category === practiceCatFilter);
      }
    }
    return result;
  }, [words, practiceFilter, practiceCatFilter, isBookmarked]);

  const shuffleQueue = useCallback(() => {
    const filtered = getFilteredWords();
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    setPracticeQueue(shuffled);
    setPracticeIndex(0);
    setIsFlipped(false);
  }, [getFilteredWords]);

  useEffect(() => {
    shuffleQueue();
  }, [words, practiceFilter, practiceCatFilter]);

  const showCard = useCallback(() => {
    setIsFlipped(false);
  }, []);

  const currentWord = practiceQueue[practiceIndex % practiceQueue.length] || null;

  const handleNext = () => {
    setPracticeIndex(prev => (prev + 1) % practiceQueue.length);
    setIsFlipped(false);
  };

  const handlePrev = () => {
    setPracticeIndex(prev => (prev - 1 + practiceQueue.length) % practiceQueue.length);
    setIsFlipped(false);
  };

  const handleFlip = () => setIsFlipped(prev => !prev);

  const handleSpeak = () => {
    if (currentWord?.english) speakWord(currentWord.english);
  };

  const handleBookmark = () => {
    if (!currentWord) return;
    toggleBookmark(currentWord.english);
  };

  const handleMoveCategory = async (category) => {
    if (!currentWord) return;
    const cat = category === '__none__' ? null : category;
    const wordIdx = words.findIndex(w => w.english === currentWord.english);
    if (wordIdx === -1) return;
    await moveWordsToCategory([wordIdx], cat);
  };

  const cycleFilter = () => {
    const idx = PRACTICE_FILTERS.findIndex(p => p.key === practiceFilter);
    setPracticeFilter(PRACTICE_FILTERS[(idx + 1) % PRACTICE_FILTERS.length].key);
  };

  const progress = practiceQueue.length
    ? Math.round(((practiceIndex + 1) / practiceQueue.length) * 100)
    : 0;

  const filterLabel = PRACTICE_FILTERS.find(p => p.key === practiceFilter);

  if (!words.length) {
    return (
      <div className="tab-panel active">
        <div className="no-words">Add some words first to start practicing!</div>
      </div>
    );
  }

  return (
    <div className="tab-panel active">
      <div className="practice-header">
        <div>
          <div style={{ fontFamily: '"Lora", serif', fontSize: 18, fontWeight: 600 }}>
            Practice Mode
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 2 }}>
            Tap the card to reveal the Persian meaning
          </div>
        </div>
        <div className="practice-header-btns">
          <button className="btn btn-ghost" onClick={shuffleQueue}>🔀 Shuffle</button>
          <button className="btn btn-ghost" onClick={cycleFilter}
            title={filterLabel?.title}>{filterLabel?.label}</button>
          <select className="practice-cat-filter-select" title="Filter by category"
            value={practiceCatFilter === null ? 'all' : practiceCatFilter}
            onChange={e => setPracticeCatFilter(e.target.value === 'all' ? null : e.target.value || "")}>
            <option value="all">📁 All</option>
            <option value="">📁 No Category</option>
            {categories.map(c => <option key={c.name} value={c.name}>📁 {c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div id="practice-area">
        {!practiceQueue.length ? (
          <div className="no-words">
            {practiceFilter === 'bookmarked' ? 'No bookmarked words yet.' :
              practiceFilter === 'unbookmarked' ? 'All words are bookmarked.' :
                'No words match the current filter.'}
          </div>
        ) : (
          <div id="practice-card-wrap">
            <div className="flip-wrap" onDoubleClick={handleFlip}>
              <div className={`flip-inner ${isFlipped ? 'flipped' : ''}`}>
                <div className="flip-front">
                  <div className="flip-hint">English</div>
                  <div className="flip-word">{currentWord?.english || '—'}</div>
                </div>
                <div className="flip-back">
                  <div className="flip-hint">Persian</div>
                  <div className="flip-word flip-fa">{currentWord?.persian || '—'}</div>
                </div>
              </div>
            </div>

            <div className="practice-controls">
              <button className="btn btn-ghost" onClick={handlePrev} title="Previous">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button className="btn btn-speak" onClick={handleSpeak} title="Listen to pronunciation">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </button>
              <select className="practice-move-cat" title="Move to category"
                value="" onChange={e => {
                  if (e.target.value) handleMoveCategory(e.target.value);
                  e.target.value = '';
                }}>
                <option value="">📁 Move</option>
                <option value="__none__">No Category</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button className={`btn btn-bookmark ${currentWord && isBookmarked(currentWord.english) ? 'active' : ''}`}
                onClick={handleBookmark} title="Bookmark this word">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <button className="btn btn-primary" onClick={handleNext} title="Next">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className="practice-stat">
              {practiceQueue.length > 0 ? `${(practiceIndex % practiceQueue.length) + 1} / ${practiceQueue.length}` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
