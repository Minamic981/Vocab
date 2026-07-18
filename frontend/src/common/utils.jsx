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