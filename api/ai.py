from enum import Enum
import requests, json
import os

# ── OpenRouter Config ────────────────────────────────────────────────────────
MODEL_NAME     = os.environ.get("MODEL_NAME")
OPENROUTER_URL = os.environ.get("OPENROUTER_URL")
OPEN_TOKEN     = os.environ.get("OPEN_TOKEN")
class SentenceMode(str, Enum):
    EN_WITH_PERSIAN = "en_with_persian"   # 1. English input + Persian meaning given -> must match exactly
    EN_WORD = "en_word"                   # 2. English word only -> generate EN + FA
    FA_WORD = "fa_word"                   # 3. Persian word only -> generate EN + FA
    EDIT = "edit"                         # 4. Same meaning, new sentence


SYSTEM_PROMPTS = {
    SentenceMode.EN_WITH_PERSIAN: (
        "You are a vocabulary assistant. The user gives an English word/phrase AND its exact Persian meaning. "
        "Write ONE natural, clear, and fluent English example sentence that uses the **exact given word**.\n\n"
        
        "Rules:\n"
        "- You MUST use the exact English word provided by the user. Do NOT replace it with synonyms (e.g. do not change 'ephemeral' to 'fleeting').\n"
        "- Use the Persian meaning as the only correct sense.\n"
        "- Keep the sentence natural and realistic. Avoid overly poetic, dramatic, or silly descriptions.\n"
        "- Make it engaging but believable — like something you would read in a book or hear in daily life.\n"
        "- Good natural flow, proper starting and ending.\n"
        "- Sentence length: 12–20 words.\n"
        "- The Persian output must be a natural and accurate translation of your English sentence.\n\n"
        
        "Respond ONLY in this exact JSON format:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),

    SentenceMode.EN_WORD: (
        "You are a vocabulary assistant. The user gives a single English word. "
        "Write ONE natural and clear English example sentence using that exact word.\n\n"
        
        "Rules:\n"
        "- Use the exact word given. Do NOT replace it with synonyms.\n"
        "- Use the most common meaning.\n"
        "- Keep sentences natural and realistic. Avoid exaggerated or silly imagery.\n"
        "- Make it interesting but believable.\n"
        "- Sentence length: 12–20 words.\n"
        "- Provide a natural Persian translation.\n\n"
        
        "Respond ONLY in this exact JSON format:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),

    SentenceMode.FA_WORD: (
        "You are a vocabulary assistant. The user gives a Persian word. Find its most common English equivalent "
        "and write ONE natural English sentence using that exact English word.\n\n"
        
        "Rules:\n"
        "- Use the exact English translation. Do not replace it with synonyms.\n"
        "- Keep the sentence natural and realistic.\n"
        "- Sentence length: 12–20 words.\n"
        "- Persian output must be a natural translation of the English sentence.\n\n"
        
        "Respond ONLY in this exact JSON format:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),

    SentenceMode.EDIT: (
        "You are a vocabulary assistant. Create a different English sentence with the same meaning and same key word.\n\n"
        
        "Rules:\n"
        "- Keep the exact key word.\n"
        "- Make it natural and realistic. Avoid overly flowery language.\n"
        "- Sentence length: 12–20 words.\n"
        "- Persian must be a natural translation of your new sentence.\n\n"
        
        "Respond ONLY in this exact JSON format:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),
}

def _detect_mode(english: str, persian: str, is_edit: bool = False) -> SentenceMode:
    if is_edit:
        return SentenceMode.EDIT

    has_en = bool(english.strip())
    has_fa = bool(persian.strip())
    is_single_word = has_en and len(english.strip().split()) == 1

    if has_en and has_fa and not is_single_word:
        # sentence + persian meaning given together
        return SentenceMode.EN_WITH_PERSIAN
    if has_en and has_fa and is_single_word:
        # could still be case 1 (word + exact meaning) — same prompt works fine here too
        return SentenceMode.EN_WITH_PERSIAN
    if has_en and not has_fa:
        return SentenceMode.EN_WORD
    if has_fa and not has_en:
        return SentenceMode.FA_WORD

    raise ValueError("Cannot determine mode: provide english and/or persian")

def generate_sentence(english: str = "", persian: str = "", is_edit=False) -> tuple[str, str]:
    mode = _detect_mode(english=english, persian=persian,is_edit=is_edit)
    print("Mode: ", mode)
    if mode == SentenceMode.EN_WITH_PERSIAN:
        user_content = f"English: {english}\nPersian meaning: {persian}"
    elif mode == SentenceMode.EN_WORD:
        user_content = f"English word: {english}"
    elif mode == SentenceMode.FA_WORD:
        user_content = f"Persian word: {persian}"
    elif mode == SentenceMode.EDIT:
        user_content = f"Original English sentence: {english}\nOriginal Persian translation: {persian}"
    else:
        raise ValueError(f"Unknown mode: {mode}")

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPTS[mode]},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.4,
    }
    ai_headers = {
        "Authorization": f"Bearer {OPEN_TOKEN}",
        "Content-Type": "application/json",
        "X-Title": "Vocab Site",
    }
    try:
        r = requests.post(OPENROUTER_URL, json=payload, headers=ai_headers, timeout=180)
        r.raise_for_status()
        raw = r.json()["choices"][0]["message"]["content"].strip()
        # strip accidental code fences just in case
        if raw.startswith("```"):
            raw = raw.strip("`")
            raw = raw[raw.find("{"):]
        print("Raw: ", raw)
        parts = json.loads(raw)
        return parts["english"], parts["persian"]
    except requests.HTTPError as e:
        raise Exception(f"HTTP error: {e.response.status_code}")
    except requests.ConnectionError:
        raise Exception("Connection failed")
    except requests.Timeout:
        raise Exception("Request timed out")
    except (json.decoder.JSONDecodeError, KeyError):
        raise Exception("Unexpected AI response format")


def gen_definitions(word: str):
    prompt = (
        f'Give me all distinct meanings of the English word "{word}".\n'
        'Limit to maximum 10 meanings. If the word has fewer real distinct meanings, return only those.\n'
        'Do NOT invent, repeat, or stretch meanings. Only include genuinely different senses '
        '(different part of speech or clearly different usage).\n\n'
        
        'For each meaning provide:\n'
        '- A short, natural English example sentence (12-20 words)\n'
        '- Its natural Persian translation\n\n'
        
        'Respond ONLY with valid JSON in this exact format — no extra text, no markdown, no explanation:\n'
        '{\n'
        '  "main_word": "<word>",\n'
        '  "definitions": [\n'
        '    {\n'
        '      "english": "<natural example sentence>",\n'
        '      "persian": "<natural Persian translation>"\n'
        '    }\n'
        '  ]\n'
        '}'
    )

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a precise bilingual English–Persian dictionary assistant.\n"
                    "Your task is to return only real, distinct meanings of a word.\n"
                    "Never duplicate meanings or create artificial ones just to reach a number.\n"
                    "- If the word has only 2-3 real meanings, return exactly those.\n"
                    "- If it has many (e.g. 'run', 'bank', 'light'), return up to 5 of the most useful/common ones.\n"
                    "- All example sentences must be natural, creative, and different from each other.\n"
                    "- Persian translations must be idiomatic and natural.\n"
                    "Return clean JSON only. No extra text."
                )
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,   # Lower temperature for more factual/consistent output
    }
    ai_headers = {
        "Authorization": f"Bearer {OPEN_TOKEN}",
        "Content-Type": "application/json",
        "X-Title": "Vocab Site",
    }
    
    try:
        r = requests.post(OPENROUTER_URL, json=payload, headers=ai_headers, timeout=180)
        r.raise_for_status()
        raw = r.json()["choices"][0]["message"]["content"].strip()
        
        # Clean possible markdown
        raw = raw.replace("```json", "").replace("```", "").strip()
        result = json.loads(raw)
        return result
    except requests.HTTPError as e:
        raise Exception({'error': f'AI error: {e.response.status_code}'})
    except requests.ConnectionError:
        raise Exception({'error': 'Connection failed'})
    except requests.Timeout:
        raise Exception({'error': 'Request timed out'})
    except json.JSONDecodeError:
        raise Exception({'error': 'Unexpected AI response format'})