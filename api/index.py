from flask import Flask, render_template, request, jsonify
import os
import sys
import json
import time
import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ai import generate_sentence, gen_definitions, MODEL_NAME, OPENROUTER_URL, OPEN_TOKEN
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

# ── MongoDB Configuration ────────────────────────────────────────────────────
MONGODB_URI = os.environ.get('MONGODB_URI')

@app.route('/api/kk', methods=['GET'])
def kv_status():
    return jsonify({
        'ACCOUNT_ID': ACCOUNT_ID,
        'NAMESPACE_ID': NAMESPACE_ID,
        'API_TOKEN': API_TOKEN,
        'MODEL_NAME': MODEL_NAME,
        'OPENROUTER_URL': OPENROUTER_URL,
        'OPEN_TOKEN': OPEN_TOKEN,
        })

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

KV_RETRIES = 3          # max attempts for transient failures
KV_RETRY_DELAY = 3      # seconds between retries


def _kv_ok() -> bool:
    return all([ACCOUNT_ID, NAMESPACE_ID, API_TOKEN])


def load_words() -> list:
    """Load words — served from cache when possible, one KV read otherwise.
    Retries up to KV_RETRIES times on network / timeout errors."""
    cached = _cache_get()
    if cached is not None:
        return cached

    if not _kv_ok():
        print("⚠️  Cloudflare credentials not configured. Using empty list.")
        return []

    last_err = None
    for attempt in range(1, KV_RETRIES + 1):
        try:
            r = requests.get(f"{BASE_URL}/values/{WORDS_KEY}", headers=HEADERS, timeout=15)
            if r.status_code == 200:
                data = r.json()
                words = data if isinstance(data, list) else json.loads(data.get("value", "[]"))
                _cache_set(words)
                return words
            elif r.status_code == 404:
                _cache_set([])
                return []
            else:
                print(f"❌ KV load error {r.status_code}: {r.text}")
                return []
        except (requests.RequestException, requests.Timeout) as e:
            last_err = e
            print(f"⚠️  KV load attempt {attempt}/{KV_RETRIES} failed: {e}")
            if attempt < KV_RETRIES:
                time.sleep(KV_RETRY_DELAY)
        except json.JSONDecodeError as e:
            print(f"❌ KV JSON error: {e}")
            return []

    print(f"❌ KV load failed after {KV_RETRIES} attempts: {last_err}")
    _cache_clear()
    return []


def save_words(words: list) -> bool:
    """Persist words to KV with retry on transient errors."""
    if not _kv_ok():
        print("⚠️  Cloudflare credentials not configured. Cannot save.")
        return False

    last_err = None
    for attempt in range(1, KV_RETRIES + 1):
        try:
            r = requests.put(
                f"{BASE_URL}/values/{WORDS_KEY}",
                headers=HEADERS,
                data=json.dumps(words, ensure_ascii=False),
                timeout=15,
            )
            if r.status_code == 200:
                _cache_set(words)
                print(f"✅ Saved {len(words)} words to KV")
                return True
            else:
                print(f"❌ KV save error {r.status_code}: {r.text}")
                return False
        except (requests.RequestException, requests.Timeout) as e:
            last_err = e
            print(f"⚠️  KV save attempt {attempt}/{KV_RETRIES} failed: {e}")
            if attempt < KV_RETRIES:
                time.sleep(KV_RETRY_DELAY)

    print(f"❌ KV save failed after {KV_RETRIES} attempts: {last_err}")
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

# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


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
    if not english:
        return jsonify({'error': 'English field is required.'}), 400
    if not aigen and not persian:
        return jsonify({'error': 'Persian field is required.'}), 400

    words = load_words()
    alternatives = data.get('alternatives', [])
    if isinstance(alternatives, str):
        alternatives = [a.strip() for a in alternatives.splitlines() if a.strip()]

    if aigen:
        try:
            style = data.get('style', '')
            custom_style = data.get('custom_style', '')
            new_english, new_persian = generate_sentence(english, persian, style=style, custom_style=custom_style)
            new_word = {'english': new_english, 'persian': new_persian, 'alternatives': alternatives}
        except Exception as e:
            print('api words method POST: ',e)
            return jsonify({'error': str(e)}), 500
    else:
        new_word = {'english': english, 'persian': persian, 'alternatives': alternatives}
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

    alternatives = data.get('alternatives', [])
    if isinstance(alternatives, str):
        alternatives = [a.strip() for a in alternatives.splitlines() if a.strip()]

    words = load_words()

    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    if any(i != index and w['english'].lower() == english for i, w in enumerate(words)):
        return jsonify({'error': f'"{english}" already exists.'}), 409

    words[index] = {'english': english, 'persian': persian, 'alternatives': alternatives}

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

    en = removed["english"] if isinstance(removed, dict) else removed[0]
    return jsonify({'message': f'"{en}" deleted.'})


@app.route('/api/aigen/<int:index>', methods=['PUT'])
def ai_gen(index):
    words = load_words()

    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    english_word = words[index].get('english', '')
    persian_word = words[index].get('persian', '')

    data = request.get_json(silent=True) or {}
    is_edit = data.get('is_edit', False)
    style = data.get('style', '')
    custom_style = data.get('custom_style', '')

    try:
        new_english, new_persian = generate_sentence(
            english=english_word, persian=persian_word, is_edit=is_edit, style=style, custom_style=custom_style
        )
    except Exception as e:
        print('aigen method put: ',e)
        return jsonify({'error': str(e)}), 500

    words[index] = {'english': new_english, 'persian': new_persian, 'alternatives': words[index].get('alternatives', [])}

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

        new_word = {'english': english, 'persian': persian, 'alternatives': []}
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

# Multiple Meaning
@app.route('/defs/<word>', methods=['POST'])
def get_definitions(word):
    word = word.strip().lower()
    if not word:
        return jsonify({'error': 'Word is required.'}), 400
    
    try:
        defint = gen_definitions(word)
        return jsonify(defint)
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/words/clear', methods=['DELETE'])
def clear_words():
    """⚠️ WARNING: Deletes all words from KV"""
    if not save_words([]):
        return jsonify({'error': 'Failed to clear words from KV.'}), 500
    return jsonify({'message': 'All words cleared.'})


@app.route('/testSS', methods=['GET'])
def test_ss():
    results = {}

    # ── Test Cloudflare KV ────────────────────────────────────────────────
    kv_start = time.time()
    try:
        if not _kv_ok():
            results['cloudflare_kv'] = {'status': 'error', 'message': 'Credentials not configured'}
        else:
            r = requests.get(f"{BASE_URL}/keys", headers=HEADERS, timeout=10)
            kv_ms = round((time.time() - kv_start) * 1000)
            if r.status_code == 200:
                data = r.json()
                count = len(data.get('result', []))
                results['cloudflare_kv'] = {'status': 'ok', 'message': f'Connected — {count} keys', 'ms': kv_ms}
            else:
                results['cloudflare_kv'] = {'status': 'error', 'message': f'HTTP {r.status_code}', 'ms': kv_ms}
    except Exception as e:
        kv_ms = round((time.time() - kv_start) * 1000)
        results['cloudflare_kv'] = {'status': 'error', 'message': str(e), 'ms': kv_ms}

    # ── Test MongoDB ──────────────────────────────────────────────────────
    mongo_start = time.time()
    try:
        if not MONGODB_URI:
            results['mongodb'] = {'status': 'error', 'message': 'MONGODB_URI not set in .env'}
        else:
            from pymongo import MongoClient
            client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            client.admin.command('ping')
            mongo_ms = round((time.time() - mongo_start) * 1000)
            results['mongodb'] = {'status': 'ok', 'message': 'Connected — ping successful', 'ms': mongo_ms}
            client.close()
    except ImportError:
        mongo_ms = round((time.time() - mongo_start) * 1000)
        results['mongodb'] = {'status': 'error', 'message': 'pymongo not installed — run: pip install pymongo', 'ms': mongo_ms}
    except Exception as e:
        mongo_ms = round((time.time() - mongo_start) * 1000)
        results['mongodb'] = {'status': 'error', 'message': str(e), 'ms': mongo_ms}

    # ── Build HTML ────────────────────────────────────────────────────────
    def card(name, r):
        color = '#22c55e' if r['status'] == 'ok' else '#ef4444'
        icon = '✅' if r['status'] == 'ok' else '❌'
        ms = f" — {r['ms']}ms" if 'ms' in r else ''
        return f'''
        <div style="background:#fff;border:1px solid #e0ddd5;border-radius:8px;padding:20px 24px;box-shadow:0 2px 12px rgba(0,0,0,.08);">
          <div style="font-size:18px;font-weight:600;margin-bottom:8px;">{icon} {name}</div>
          <div style="font-size:14px;color:#555;">{r['message']}{ms}</div>
          <div style="margin-top:10px;height:4px;background:#e0ddd5;border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:{100 if r['status'] == 'ok' else 0}%;background:{color};border-radius:99px;transition:width .3s;"></div>
          </div>
        </div>'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Storage Service Test</title>
  <style>
    body {{ font-family: "Inter", sans-serif; background: #faf9f6; color: #1a1a1a; display: flex; justify-content: center; padding: 60px 20px; }}
    .container {{ max-width: 500px; width: 100%; }}
    h1 {{ font-family: "Lora", serif; font-size: 24px; font-weight: 600; margin-bottom: 24px; text-align: center; }}
    .cards {{ display: flex; flex-direction: column; gap: 16px; }}
  </style>
</head>
<body>
  <div class="container">
    <h1>Storage Service Test</h1>
    <div class="cards">
      {card('Cloudflare KV', results['cloudflare_kv'])}
      {card('MongoDB', results['mongodb'])}
    </div>
  </div>
</body>
</html>'''

    return html


# ── Startup ──────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if check_kv_connection():
        print("✅ Cloudflare KV connection successful!")
        print(f"   Words stored: {len(load_words())}")
    else:
        print("⚠️  Cloudflare KV connection failed. Check your credentials.")
        print("   Required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_NAMESPACE_ID, CLOUDFLARE_API_TOKEN")

    app.run(debug=True)