"""
Quick AI sentence test — generates sentences for 'light' and scores them with a critic AI.
"""

import os
import sys
import json
import requests
from dotenv import load_dotenv

# Add project root to path so `from api.ai import ...` works
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

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

# ══════════════════════════════════════════════════════════════════════════════
#  WRITING STYLE TEST — Preset styles + critic analysis
# ══════════════════════════════════════════════════════════════════════════════

STYLE_RESULTS = []

STYLE_PRESETS = [
    ("romantic", "romantic and emotionally expressive"),
    ("formal", "formal and professional"),
    ("minimalist", "minimalist with very few words"),
    ("simple", "simple with basic everyday words and short sentences"),
]


def style_critic_score(entry):
    """Extended critic that also evaluates whether the sentence matches the requested style."""
    system_prompt = (
        "You are an English-language writing critic. Score the following sentence on a scale of 1-10.\n"
        "Evaluate on these 4 criteria:\n"
        "1. Topic sentence and creativity — Is the sentence engaging, original, and natural?\n"
        "2. Sentence structure and grammar — Is it grammatically correct and well-structured?\n"
        "3. Correct word meaning — Does the sentence use the correct sense of the input word?\n"
        "4. Style adherence — Does the sentence match the requested writing style?\n\n"
        "Respond ONLY in this exact JSON format:\n"
        '{"score_1_topic_creative": <1-10>, "score_2_structure_grammar": <1-10>, '
        '"score_3_correct_meaning": <1-10>, "score_4_style_adherence": <1-10>, '
        '"overall": <1-10>, "feedback": "<brief explanation>"}'
    )

    user_msg = (
        f"Input word: {entry['word']}\n"
        f"Generated sentence: {entry['english']}\n"
        f"Persian translation: {entry['persian']}\n"
        f"Requested style: {entry['style']} — {entry['style_desc']}"
    )

    headers = {
        "Authorization": f"Bearer {OPEN_TOKEN}",
        "Content-Type": "application/json",
        "X-Title": "Vocab Style Critic",
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
        {"error": str(e)}


def run_style_critic(entry):
    print(f"\n  --- Style Critique ({entry['style']}) ---")
    print(f"  Sentence: {entry['english']}")
    print(f"  Persian:  {entry['persian']}")

    scores = style_critic_score(entry)
    if "error" in scores:
        print(f"  ❌ Critic failed: {scores['error']}")
        return

    print(f"  🎯 Topic & Creativity:  {scores.get('score_1_topic_creative', '?')}/10")
    print(f"  📐 Structure & Grammar: {scores.get('score_2_structure_grammar', '?')}/10")
    print(f"  ✅ Correct Meaning:     {scores.get('score_3_correct_meaning', '?')}/10")
    print(f"  🎭 Style Adherence:     {scores.get('score_4_style_adherence', '?')}/10")
    print(f"  ⭐ Overall:             {scores.get('overall', '?')}/10")
    print(f"  💬 Feedback: {scores.get('feedback', 'N/A')}")
    entry["scores"] = scores


print(f"\n\n{'='*50}")
print(f"  Writing Style Test — {WORD}")
print(f"{'='*50}")

for style_key, style_desc in STYLE_PRESETS:
    print(f"\n{'─'*50}")
    print(f"  Style: {style_key} — {style_desc}")
    print(f"{'─'*50}")

    en_s, fa_s = generate_sentence(english=WORD, style=style_key)
    print(f"  📝 English: {en_s}")
    print(f"  📝 Persian: {fa_s}")
    STYLE_RESULTS.append({
        "style": style_key,
        "style_desc": style_desc,
        "word": WORD,
        "english": en_s,
        "persian": fa_s,
    })

print(f"\n{'='*50}")
print(f"  Style Critic AI — Scoring")
print(f"{'='*50}")

for entry in STYLE_RESULTS:
    run_style_critic(entry)

print(f"\n{'='*50}")
print(f"  Style Test Summary")
print(f"{'='*50}")
for entry in STYLE_RESULTS:
    s = entry.get("scores", {})
    if "error" not in s and s:
        print(f"  [{entry['style']}] "
              f"Topic={s.get('score_1_topic_creative','?')} "
              f"Grammar={s.get('score_2_structure_grammar','?')} "
              f"Meaning={s.get('score_3_correct_meaning','?')} "
              f"Style={s.get('score_4_style_adherence','?')} "
              f"Overall={s.get('overall','?')}")
