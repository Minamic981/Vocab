"""
Quick AI sentence test — generates sentences for 'light' and scores them with a critic AI.
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()  # Must load BEFORE importing ai.py

from api.ai import generate_sentence

OPENROUTER_URL = os.environ.get("OPENROUTER_URL")
MODEL_NAME     = os.environ.get("MODEL_NAME")
OPEN_TOKEN     = os.environ.get("OPEN_TOKEN")

WORD = "light"
RESULTS = []


def critic_score(entry):
    system_prompt = (
        "You are an English-language writing critic. Score the following sentence on a scale of 1-10.\n"
        "Evaluate on these 3 criteria:\n"
        "1. Topic sentence and creativity — Is the sentence engaging, original, and natural?\n"
        "2. Sentence structure and grammar — Is it grammatically correct and well-structured?\n"
        "3. Correct word meaning — Does the sentence use the correct sense of the input word?\n\n"
        "Respond ONLY in this exact JSON format:\n"
        '{"score_1_topic_creative": <1-10>, "score_2_structure_grammar": <1-10>, '
        '"score_3_correct_meaning": <1-10>, "overall": <1-10>, "feedback": "<brief explanation>"}'
    )

    user_msg = (
        f"Input word: {entry['word']}\n"
        f"Generated sentence: {entry['english']}\n"
        f"Persian translation: {entry['persian']}\n"
        f"Mode: {entry['mode']}"
    )

    headers = {
        "Authorization": f"Bearer {OPEN_TOKEN}",
        "Content-Type": "application/json",
        "X-Title": "Vocab Critic",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.2,
    }

    try:
        r = requests.post(OPENROUTER_URL, json=payload, headers=headers, timeout=180)
        r.raise_for_status()
        raw = r.json()["choices"][0]["message"]["content"].strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            raw = raw[raw.find("{"):]
        return json.loads(raw)
    except Exception as e:
        return {"error": str(e)}


def run_critic(entry):
    print(f"\n  --- Critique ({entry['mode']}) ---")
    print(f"  Sentence: {entry['english']}")
    print(f"  Persian:  {entry['persian']}")

    scores = critic_score(entry)
    if "error" in scores:
        print(f"  ❌ Critic failed: {scores['error']}")
        return

    print(f"  🎯 Topic & Creativity:  {scores.get('score_1_topic_creative', '?')}/10")
    print(f"  📐 Structure & Grammar: {scores.get('score_2_structure_grammar', '?')}/10")
    print(f"  ✅ Correct Meaning:     {scores.get('score_3_correct_meaning', '?')}/10")
    print(f"  ⭐ Overall:             {scores.get('overall', '?')}/10")
    print(f"  💬 Feedback: {scores.get('feedback', 'N/A')}")
    entry["scores"] = scores


# ── 1. English + Persian (lower temp for accuracy) ────────────────────────────
print(f"\n{'='*50}")
print(f"  Generate: {WORD}  (English + Persian)")
print(f"{'='*50}")

en, fa = generate_sentence(english=WORD, persian="نور / روشنایی", temperature=0.3)
print(f"  📝 English: {en}")
print(f"  📝 Persian: {fa}")
RESULTS.append({"mode": "EN+Persian", "word": WORD, "english": en, "persian": fa})

# ── 2. English only (higher temp for variety) ────────────────────────────────
print(f"\n{'='*50}")
print(f"  Generate: {WORD}  (English only)")
print(f"{'='*50}")

en2, fa2 = generate_sentence(english=WORD, temperature=0.9)
print(f"  📝 English: {en2}")
print(f"  📝 Persian: {fa2}")
RESULTS.append({"mode": "EN-only", "word": WORD, "english": en2, "persian": fa2})

# ── 3. Critic scoring ────────────────────────────────────────────────────────
print(f"\n{'='*50}")
print(f"  Critic AI — Scoring")
print(f"{'='*50}")

for entry in RESULTS:
    run_critic(entry)

# ── Summary ──────────────────────────────────────────────────────────────────
print(f"\n{'='*50}")
print(f"  Summary")
print(f"{'='*50}")
for entry in RESULTS:
    s = entry.get("scores", {})
    if "error" not in s and s:
        print(f"  [{entry['mode']}] "
              f"Topic={s.get('score_1_topic_creative','?')} "
              f"Grammar={s.get('score_2_structure_grammar','?')} "
              f"Meaning={s.get('score_3_correct_meaning','?')} "
              f"Overall={s.get('overall','?')}")
