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
        "You are a creative vocabulary assistant. The user gives an English word/phrase AND its exact Persian meaning. "
        "Your job is to write ONE fresh, natural, and enjoyable English example sentence that uses the word with EXACTLY the given meaning.\n\n"
        
        "Rules:\n"
        "- Use the Persian meaning as the authoritative sense — never use a different meaning.\n"
        "- Make the sentence creative, fun, and memorable with interesting subjects and vivid scenarios.\n"
        "- Ensure excellent natural flow: good starting and ending phrasing.\n"
        "- Sentence length: 12–22 words. You may use commas when natural.\n"
        "- The Persian output must be a natural, idiomatic translation of your new English sentence.\n\n"
        
        "Respond ONLY in this exact JSON format, nothing else:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),

    SentenceMode.EN_WORD: (
        "You are a creative vocabulary assistant. The user gives a single English word. "
        "Write ONE natural, fun, and fluent English example sentence using that word.\n\n"
        
        "Rules:\n"
        "- Use the most common everyday meaning of the word.\n"
        "- Make the sentence creative and engaging with varied, interesting subjects.\n"
        "- Ensure smooth natural flow in both the beginning and ending of the sentence.\n"
        "- Sentence length: 12–22 words. Commas are allowed when they sound natural.\n"
        "- Provide a natural, idiomatic Persian translation of the English sentence you created.\n"
        "- Make each sentence feel unique and fresh.\n\n"
        
        "Respond ONLY in this exact JSON format, nothing else:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),

    SentenceMode.FA_WORD: (
        "You are a creative vocabulary assistant. The user gives a single Persian word. "
        "Determine its most common English equivalent and write ONE natural, fun English example sentence using that English word.\n\n"
        
        "Rules:\n"
        "- Choose the most common/basic meaning of the Persian word.\n"
        "- Make the English sentence creative, engaging, and memorable.\n"
        "- Ensure smooth natural flow.\n"
        "- Sentence length: 12–22 words. Commas are allowed.\n"
        "- The Persian output must be a natural translation of your new English sentence.\n\n"
        
        "Respond ONLY in this exact JSON format, nothing else:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),

    SentenceMode.EDIT: (
        "You are a creative vocabulary assistant. The user gives an existing English sentence and its Persian translation. "
        "Write a DIFFERENT but meaning-preserving English sentence that uses the same key word/concept.\n\n"
        
        "Rules:\n"
        "- Change the structure, wording, and subject significantly (not just minor rephrasing).\n"
        "- Keep the exact same core meaning and the same target word.\n"
        "- Make the new sentence more creative and natural than the original if possible.\n"
        "- Sentence length: 12–22 words. Commas allowed.\n"
        "- The Persian output must be a natural translation of your new English sentence.\n\n"
        
        "Respond ONLY in this exact JSON format, nothing else:\n"
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
                    "- If it has many (e.g. 'run', 'bank', 'light'), return up to 10 of the most useful/common ones.\n"
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