from flask import Flask, render_template, request, jsonify
import os
import json
import time
import requests
from dotenv import load_dotenv

app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), '..', 'templates'),
    static_folder=os.path.join(os.path.dirname(__file__), '..', 'static')
)

load_dotenv()

# ── Cloudflare KV Configuration ─────────────────────────────────────────────
ACCOUNT_ID   = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
NAMESPACE_ID = os.environ.get('CLOUDFLARE_NAMESPACE_ID')
API_TOKEN    = os.environ.get('CLOUDFLARE_API_TOKEN')

BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/storage/kv/namespaces/{NAMESPACE_ID}"
HEADERS  = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}
WORDS_KEY = "vocabulary_words"

# ── OpenRouter Config ────────────────────────────────────────────────────────
MODEL_NAME     = os.environ.get("MODEL_NAME")
OPENROUTER_URL = os.environ.get("OPENROUTER_URL")
OPEN_TOKEN     = os.environ.get("OPEN_TOKEN")

# ── In-memory cache ──────────────────────────────────────────────────────────
# Avoids hitting KV on every request. TTL of 60 s is a safety net;
# the cache is also invalidated immediately after every write.
_cache: dict = {"words": None, "ts": 0.0}
CACHE_TTL = 60  # seconds


def _cache_get():
    if _cache["words"] is not None and (time.time() - _cache["ts"]) < CACHE_TTL:
        return _cache["words"]
    return None


def _cache_set(words: list):
    _cache["words"] = words
    _cache["ts"] = time.time()


def _cache_clear():
    _cache["words"] = None
    _cache["ts"] = 0.0


# ── KV helpers ───────────────────────────────────────────────────────────────

def _kv_ok() -> bool:
    return all([ACCOUNT_ID, NAMESPACE_ID, API_TOKEN])


def load_words() -> list:
    """Load words — served from cache when possible, one KV read otherwise."""
    cached = _cache_get()
    if cached is not None:
        return cached

    if not _kv_ok():
        print("⚠️  Cloudflare credentials not configured. Using empty list.")
        return []

    try:
        r = requests.get(f"{BASE_URL}/values/{WORDS_KEY}", headers=HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            words = data if isinstance(data, list) else json.loads(data.get("value", "[]"))
        elif r.status_code == 404:
            words = []
        else:
            print(f"❌ KV load error {r.status_code}: {r.text}")
            return []
    except requests.RequestException as e:
        print(f"❌ KV network error: {e}")
        return []
    except json.JSONDecodeError as e:
        print(f"❌ KV JSON error: {e}")
        return []

    _cache_set(words)
    return words


def save_words(words: list) -> bool:
    """Persist words to KV and update the cache on success."""
    if not _kv_ok():
        print("⚠️  Cloudflare credentials not configured. Cannot save.")
        return False

    try:
        r = requests.put(
            f"{BASE_URL}/values/{WORDS_KEY}",
            headers=HEADERS,
            data=json.dumps(words, ensure_ascii=False),
            timeout=10,
        )
        if r.status_code == 200:
            _cache_set(words)   # keep cache in sync — no extra KV read needed
            print(f"✅ Saved {len(words)} words to KV")
            return True
        else:
            print(f"❌ KV save error {r.status_code}: {r.text}")
            _cache_clear()      # stale cache is worse than no cache
            return False
    except requests.RequestException as e:
        print(f"❌ KV network error: {e}")
        _cache_clear()
        return False


def check_kv_connection() -> bool:
    if not _kv_ok():
        return False
    try:
        r = requests.get(f"{BASE_URL}/keys", headers=HEADERS, timeout=10)
        return r.status_code == 200
    except Exception:
        return False


# ── AI helper ────────────────────────────────────────────────────────────────

def generate_sentence(word: str) -> tuple[str, str]:
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
        "content" : (
            "You are a vocabulary assistant that creates example sentences and Persian translations.\n\n"
            "The user will give you a word or a sentence.\n\n"
            "Your task:\n"
            "- If the user gives a WORD → Create a short natural sentence using that word\n"
            "- If the user gives a SENTENCE → Create a different sentence with the same meaning\n\n"
            "Rules:\n"
            "- Always create a NEW sentence — never copy or directly translate the input\n"
            "- Keep sentences simple and natural (under 15 words)\n"
            "- NEVER use commas (,) anywhere in your English sentence\n"
            "- The Persian must be a translation of YOUR new English sentence\n\n"
            "Respond ONLY in this exact JSON format:\n"
            "{\"english\":\"English sentence\", \"persian\":\"Persian sentence\"}\n\n"
            "Example:\n"
            'apple → {\"english\":\"I love eating a fresh apple every morning\", \"persian\":\"من عاشق خوردن یک سیب تازه هر روز صبح هستم\"}\n'
            "No extra text. No explanation. Nothing else."
        )
            },
            {"role": "user", "content": word},
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
        parts = json.loads(r.json()["choices"][0]["message"]["content"].strip())
        return parts
    except requests.HTTPError as e:
        raise Exception(f"HTTP error: {e.response.status_code}")
    except requests.ConnectionError:
        raise Exception("Connection failed")
    except requests.Timeout:
        raise Exception("Request timed out")
    except json.decoder.JSONDecodeError:
        raise Exception("Unexpected AI response format")


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    words = load_words()
    return render_template('index.html', words=words, count=len(words))


@app.route('/api/words', methods=['GET'])
def get_words():
    words = load_words()
    return jsonify({'words': words, 'count': len(words)})


@app.route('/api/words', methods=['POST'])
def add_word():
    data    = request.get_json()
    english = data.get('english', '').strip().lower()
    persian = data.get('persian', '').strip()
    aigen = data.get('aigen', False)
    print(aigen)
    if not english:
        return jsonify({'error': 'English field is required.'}), 400
    if not aigen and not persian:
        return jsonify({'error': 'Persian field is required.'}), 400

    words = load_words()
    if aigen:
        try:
            new_word = generate_sentence(english)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        new_word = {'english': english, 'persian': persian}
    words.append(new_word)

    if not save_words(words):
        return jsonify({'error': 'Failed to save word to Cloudflare KV.'}), 500

    return jsonify({'message': 'Word added successfully.', 'word': new_word}), 201


@app.route('/api/words/<int:index>', methods=['PUT'])
def edit_word(index):
    data    = request.get_json()
    english = data.get('english', '').strip().lower()
    persian = data.get('persian', '').strip()

    if not english or not persian:
        return jsonify({'error': 'Both fields are required.'}), 400

    words = load_words()

    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    if any(i != index and w['english'].lower() == english for i, w in enumerate(words)):
        return jsonify({'error': f'"{english}" already exists.'}), 409

    words[index] = {'english': english, 'persian': persian}

    if not save_words(words):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    return jsonify({'message': 'Word updated.', 'word': words[index]})


@app.route('/api/words/<int:index>', methods=['DELETE'])
def delete_word(index):
    words = load_words()

    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    removed = words.pop(index)

    if not save_words(words):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    return jsonify({'message': f'"{removed["english"]}" deleted.'})


@app.route('/api/aigen/<int:index>', methods=['PUT'])
def ai_gen(index):
    words = load_words()

    # ✅ Bounds check BEFORE accessing words[index]
    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    english_word = words[index]['english']

    try:
        ai_sentence = generate_sentence(word=english_word)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    words[index] = ai_sentence

    if not save_words(words):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    return jsonify({'message': 'Sentence generated.', 'word': words[index]})


@app.route('/api/words/batch', methods=['POST'])
def batch_import():
    data     = request.get_json()
    raw_text = data.get('text', '')

    if not raw_text.strip():
        return jsonify({'error': 'No text provided.'}), 400

    words    = load_words()
    existing = {w['english'].lower() for w in words}

    added, duplicates, errors = [], [], []

    for line_num, line in enumerate(raw_text.strip().splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        if '=' not in line:
            errors.append(f'Line {line_num}: invalid format — "{line}"')
            continue

        english, _, persian = line.partition('=')
        english = english.strip().lower()
        persian = persian.strip()

        if not english or not persian:
            errors.append(f'Line {line_num}: empty value — "{line}"')
            continue

        if english in existing:
            duplicates.append(english)
            continue

        new_word = {'english': english, 'persian': persian}
        words.append(new_word)
        existing.add(english)
        added.append(new_word)

    # One KV write for the whole batch (even if nothing was added, skip the write)
    if added and not save_words(words):
        return jsonify({'error': 'Failed to save batch to Cloudflare KV.'}), 500

    return jsonify({
        'added':       added,
        'added_count': len(added),
        'duplicates':  duplicates,
        'errors':      errors,
        'total':       len(words),
    })


@app.route('/api/words/clear', methods=['DELETE'])
def clear_words():
    """⚠️ WARNING: Deletes all words from KV"""
    if not save_words([]):
        return jsonify({'error': 'Failed to clear words from KV.'}), 500
    return jsonify({'message': 'All words cleared.'})


# ── Startup ──────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if check_kv_connection():
        print("✅ Cloudflare KV connection successful!")
        print(f"   Words stored: {len(load_words())}")
    else:
        print("⚠️  Cloudflare KV connection failed. Check your credentials.")
        print("   Required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_NAMESPACE_ID, CLOUDFLARE_API_TOKEN")

    app.run(debug=True)