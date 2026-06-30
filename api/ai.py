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
        "You are a vocabulary assistant. The user gives an English word/phrase AND its exact "
        "Persian meaning. Your job is to write a NEW natural English example sentence that uses "
        "the word with EXACTLY that meaning — not a different sense of the word.\n\n"
        "Rules:\n"
        "- Do not reuse the input sentence verbatim; write a fresh sentence\n"
        "- The Persian meaning given is authoritative: if the word is ambiguous, pick the sense "
        "that matches it\n"
        "- Keep the English sentence under 15 words, natural, no commas\n"
        "- The Persian output must be a faithful translation of YOUR new English sentence, "
        "preserving the same meaning as the original Persian meaning provided\n\n"
        "Respond ONLY in this JSON format, nothing else:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),
    SentenceMode.EN_WORD: (
        "You are a vocabulary assistant. The user gives a single English word. "
        "You MUST write one short natural example sentence that CONTAINS the given word.\n\n"
        "Rules:\n"
        "- The sentence MUST include the exact given word\n"
        "- Keep the sentence under 15 words, natural, no commas\n"
        "- Provide an accurate Persian translation of the sentence you wrote\n"
        "- Randomly choose from different: subjects (I/you/he/she/we/they), tenses (past/present/future), and contexts (daily life/work/school/family)\n"
        "- Try to make each response unique even for the same word\n\n"
        "Respond ONLY in this JSON format, nothing else:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),
    SentenceMode.FA_WORD: (
        "You are a vocabulary assistant. The user gives a single Persian word. Determine its "
        "best English equivalent and write one short natural English example sentence using "
        "that English word.\n\n"
        "Rules:\n"
        "- Keep the English sentence under 15 words, natural, no commas\n"
        "- The Persian output must be a translation of the English sentence you wrote (not just "
        "the original input word repeated)\n"
        "- Choose the most common/basic meaning if the Persian word is ambiguous\n\n"
        "Respond ONLY in this JSON format, nothing else:\n"
        "{\"english\":\"...\", \"persian\":\"...\"}"
    ),
    SentenceMode.EDIT: (
        "You are a vocabulary assistant. The user provides an existing English sentence and its "
        "Persian translation. Your job is to write a DIFFERENT English sentence that preserves "
        "the EXACT SAME meaning and uses the same key word/concept, but with different wording "
        "and structure.\n\n"
        "Rules:\n"
        "- The new sentence must NOT be a trivial rephrasing (don't just swap one word) — change "
        "structure while keeping meaning identical\n"
        "- Do not change the core word/concept being illustrated\n"
        "- Keep the sentence under 15 words, natural, no commas\n"
        "- The Persian output must be an accurate translation of YOUR new English sentence and "
        "must convey the same meaning as the original Persian\n\n"
        "Respond ONLY in this JSON format, nothing else:\n"
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
    f'Give me all distinct meanings (Limit 5 meanings) of the English word "{word}".\n'
    "For each meaning provide a short English sentence and its Persian translation.\n\n"
    "Respond ONLY with valid JSON in this exact format — no extra text:\n"
    '{\n'
    '  "main_word": "<word>",\n'
    '  "definitions": [\n'
    '    { "english": "<short sentence>", "persian": "<Persian translation>" },\n'
    '    ...\n'
    '  ]\n'
    '}')
    
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a bilingual English–Persian dictionary assistant.\n"
                    "Return ONLY a JSON object with no markdown, no backticks, and no explanation.\n"
                    "Each definition must be a distinct meaning (different part of speech or clearly different sense).\n"
                    "Keep English definitions concise (under 15 words). Persian translations should be natural Farsi."
                )
            },
            {"role": "user", "content": prompt},
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
        # Strip accidental markdown fences
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