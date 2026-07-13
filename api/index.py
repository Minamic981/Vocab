from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import sys
import json
import time
import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ai import generate_sentence, gen_definitions
app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), '..', 'templates'),
    static_folder=os.path.join(os.path.dirname(__file__), '..', 'static')
)
CORS(app)

load_dotenv()

# ── Cloudflare KV Configuration ─────────────────────────────────────────────
ACCOUNT_ID   = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
NAMESPACE_ID = os.environ.get('CLOUDFLARE_NAMESPACE_ID')
API_TOKEN    = os.environ.get('CLOUDFLARE_API_TOKEN')
BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/storage/kv/namespaces/{NAMESPACE_ID}"
HEADERS  = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}
DATA_KEY = "vocabulary"

# Reuse a single HTTP connection (keep-alive) instead of opening a fresh
# TCP+TLS connection to Cloudflare on every load_data()/save_data() call.
# This alone can shave a meaningful chunk off every request's latency.
_session = requests.Session()
_session.headers.update(HEADERS)

# ── In-memory cache ──────────────────────────────────────────────────────────
_cache: dict = {"data": None, "ts": 0.0}
CACHE_TTL = 60

UNCATEGORIZED_KEY = "uncategorized"


def _cache_get():
    if _cache["data"] is not None and (time.time() - _cache["ts"]) < CACHE_TTL:
        return _cache["data"]
    return None


def _cache_set(data: dict):
    _cache["data"] = data
    _cache["ts"] = time.time()


def _cache_clear():
    _cache["data"] = None
    _cache["ts"] = 0.0


# ── KV helpers ───────────────────────────────────────────────────────────────

KV_RETRIES = 3
KV_RETRY_DELAY = 3


def _kv_ok() -> bool:
    return all([ACCOUNT_ID, NAMESPACE_ID, API_TOKEN])


def _empty_data() -> dict:
    return {
        "categories": {
            UNCATEGORIZED_KEY: {
                "description": "Items without a category",
                "words": []
            }
        }
    }


def load_data() -> dict:
    """Load entire vocabulary data from KV."""
    cached = _cache_get()
    if cached is not None:
        return cached

    if not _kv_ok():
        print("⚠️  Cloudflare credentials not configured. Using empty data.")
        return _empty_data()

    last_err = None
    for attempt in range(1, KV_RETRIES + 1):
        try:
            r = _session.get(f"{BASE_URL}/values/{DATA_KEY}", timeout=15)
            if r.status_code == 200:
                raw = r.json()
                if isinstance(raw, dict) and "value" in raw:
                    data = json.loads(raw["value"])
                else:
                    data = raw
                # Validate structure
                if not isinstance(data, dict) or "categories" not in data:
                    data = _empty_data()
                if not isinstance(data["categories"], dict):
                    data["categories"] = {}
                # Ensure uncategorized exists
                if UNCATEGORIZED_KEY not in data["categories"]:
                    data["categories"][UNCATEGORIZED_KEY] = {
                        "description": "Items without a category",
                        "words": []
                    }
                # Ensure uncategorized has correct structure
                unc = data["categories"][UNCATEGORIZED_KEY]
                if not isinstance(unc, dict) or "words" not in unc:
                    data["categories"][UNCATEGORIZED_KEY] = {
                        "description": "Items without a category",
                        "words": unc if isinstance(unc, list) else []
                    }
                _cache_set(data)
                return data
            elif r.status_code == 404:
                data = _empty_data()
                _cache_set(data)
                return data
            else:
                print(f"❌ KV load error {r.status_code}: {r.text}")
                return _empty_data()
        except (requests.RequestException, requests.Timeout) as e:
            last_err = e
            print(f"⚠️  KV load attempt {attempt}/{KV_RETRIES} failed: {e}")
            if attempt < KV_RETRIES:
                time.sleep(KV_RETRY_DELAY)
        except json.JSONDecodeError as e:
            print(f"❌ KV JSON error: {e}")
            return _empty_data()

    print(f"❌ KV load failed after {KV_RETRIES} attempts: {last_err}")
    _cache_clear()
    return _empty_data()


def save_data(data: dict) -> bool:
    """Persist entire vocabulary data to KV."""
    if not _kv_ok():
        print("⚠️  Cloudflare credentials not configured. Cannot save.")
        return False

    # Ensure uncategorized exists
    if "categories" not in data:
        data["categories"] = {}
    if UNCATEGORIZED_KEY not in data["categories"]:
        data["categories"][UNCATEGORIZED_KEY] = {
            "description": "Items without a category",
            "words": []
        }

    last_err = None
    for attempt in range(1, KV_RETRIES + 1):
        try:
            r = _session.put(
                f"{BASE_URL}/values/{DATA_KEY}",
                data=json.dumps(data, ensure_ascii=False),
                timeout=15,
            )
            if r.status_code == 200:
                _cache_set(data)
                cats = data["categories"]
                total_words = sum(len(c.get("words", [])) for c in cats.values())
                print(f"✅ Saved {total_words} words across {len(cats)} categories to KV")
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


# ── Word access helpers ───────────────────────────────────────────────────────
# These avoid the two costly patterns the old code had everywhere:
#   1. Rebuilding + deep-copying the ENTIRE word list just to touch one word.
#   2. Re-scanning the whole list by matching on the "english" field to find
#      the row to remove (slow, and wrong if two words happen to collide).
# Instead we track (category, position) directly wherever possible.

def flatten_words(data: dict) -> list:
    """Flatten categorized data to a flat list with a category field on each word.
    Used only where the full list is genuinely needed (GET /api/words)."""
    result = []
    cats = data.get("categories", {})
    for cat_name, cat_obj in cats.items():
        cat_words = cat_obj.get("words", []) if isinstance(cat_obj, dict) else []
        for word in cat_words:
            w = dict(word)
            w["category"] = cat_name if cat_name != UNCATEGORIZED_KEY else None
            result.append(w)
    return result


def deflat_words(words: list) -> dict:
    """Convert flat word list back to categorized structure."""
    cats = {}
    for word in words:
        cat = word.get("category") or UNCATEGORIZED_KEY
        w = {k: v for k, v in word.items() if k != "category"}
        if cat not in cats:
            cats[cat] = {"description": "", "words": []}
        cats[cat]["words"].append(w)
    if UNCATEGORIZED_KEY not in cats:
        cats[UNCATEGORIZED_KEY] = {"description": "Items without a category", "words": []}
    return {"categories": cats}


def _locate_word_by_index(data: dict, index: int):
    """Find (cat_name, pos_in_cat, word_dict) for a global index WITHOUT
    building/copying the full flattened list. O(categories) + O(1), instead
    of O(total_words) with a dict-copy per word."""
    cats = data.get("categories", {})
    running = 0
    for cat_name, cat_obj in cats.items():
        cat_words = cat_obj.get("words", []) if isinstance(cat_obj, dict) else []
        n = len(cat_words)
        if index < running + n:
            pos = index - running
            return cat_name, pos, cat_words[pos]
        running += n
    return None, None, None


def _build_index_map(data: dict) -> list:
    """Return a list of (cat_name, pos_in_cat) tuples parallel to the
    flattened order, without copying word dicts. Used for bulk operations
    (delete-multiple, move-category) so we can remove/move by exact position
    instead of re-searching by english text for every single item."""
    result = []
    cats = data.get("categories", {})
    for cat_name, cat_obj in cats.items():
        cat_words = cat_obj.get("words", []) if isinstance(cat_obj, dict) else []
        for pos in range(len(cat_words)):
            result.append((cat_name, pos))
    return result


def _english_exists(data: dict, english: str, exclude_cat=None, exclude_pos=None) -> bool:
    """Check whether a word already exists, without building a full copied list."""
    english = english.lower()
    cats = data.get("categories", {})
    for cat_name, cat_obj in cats.items():
        cat_words = cat_obj.get("words", []) if isinstance(cat_obj, dict) else []
        for pos, w in enumerate(cat_words):
            if cat_name == exclude_cat and pos == exclude_pos:
                continue
            if w.get("english", "").lower() == english:
                return True
    return False


def _total_words(data: dict) -> int:
    return sum(len(c.get("words", [])) for c in data.get("categories", {}).values())


def get_categories_list(data: dict) -> list:
    """Extract category list from data (excluding uncategorized)."""
    cats = data.get("categories", {})
    result = []
    for name, obj in cats.items():
        if name == UNCATEGORIZED_KEY:
            continue
        desc = obj.get("description", "") if isinstance(obj, dict) else ""
        result.append({"name": name, "description": desc})
    return result


def check_kv_connection() -> bool:
    if not _kv_ok():
        return False
    try:
        r = _session.get(f"{BASE_URL}/keys", timeout=10)
        return r.status_code == 200
    except Exception:
        return False


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/lab')
def lab():
    return render_template('lab.html')

@app.route('/raw')
def raw():
    return jsonify({"user-agent":request.headers.get('User-Agent')})

@app.route('/api/words', methods=['GET'])
def get_words():
    data = load_data()
    words = flatten_words(data)
    return jsonify({'words': words, 'count': len(words)})


@app.route('/api/words', methods=['POST'])
def add_word():
    req = request.get_json()
    english = req.get('english', '').strip().lower()
    persian = req.get('persian', '').strip()
    aigen = req.get('aigen', False)
    if not english:
        return jsonify({'error': 'English field is required.'}), 400
    if not aigen and not persian:
        return jsonify({'error': 'Persian field is required.'}), 400

    alternatives = req.get('alternatives', [])
    if isinstance(alternatives, str):
        alternatives = [a.strip() for a in alternatives.splitlines() if a.strip()]

    category = req.get('category', None)
    if category is not None:
        category = category.strip() if isinstance(category, str) else None
        if category == '':
            category = None

    if aigen:
        try:
            style = req.get('style', '')
            custom_style = req.get('custom_style', '')
            new_english, new_persian = generate_sentence(english, persian, style=style, custom_style=custom_style)
            new_word = {'english': new_english, 'persian': new_persian, 'alternatives': alternatives}
        except Exception as e:
            print('api words method POST: ', e)
            return jsonify({'error': str(e)}), 500
    else:
        new_word = {'english': english, 'persian': persian, 'alternatives': alternatives}

    data = load_data()

    # Check for duplicate english before adding
    if _english_exists(data, english):
        return jsonify({'error': f'"{english}" already exists.'}), 409

    cat_key = category or UNCATEGORIZED_KEY

    if cat_key not in data["categories"]:
        data["categories"][cat_key] = {"description": "", "words": []}

    data["categories"][cat_key]["words"].append(new_word)

    if not save_data(data):
        return jsonify({'error': 'Failed to save word to Cloudflare KV.'}), 500

    result_word = dict(new_word)
    result_word["category"] = category
    return jsonify({'message': 'Word added successfully.', 'word': result_word}), 201


@app.route('/api/words/<int:index>', methods=['PUT'])
def edit_word(index):
    req = request.get_json()
    english = req.get('english', '').strip().lower()
    persian = req.get('persian', '').strip()

    if not english or not persian:
        return jsonify({'error': 'Both fields are required.'}), 400

    alternatives = req.get('alternatives', [])
    if isinstance(alternatives, str):
        alternatives = [a.strip() for a in alternatives.splitlines() if a.strip()]

    category = req.get('category', None)
    if category is not None:
        category = category.strip() if isinstance(category, str) else None
        if category == '':
            category = None

    data = load_data()

    # Locate the word by english text (case-insensitive) rather than relying
    # on the flat index, which can drift if the frontend list is stale.
    found_cat, found_pos, found_word = None, None, None
    for cat_name, cat_obj in data.get("categories", {}).items():
        cat_words = cat_obj.get("words", []) if isinstance(cat_obj, dict) else []
        for pos, w in enumerate(cat_words):
            if w.get("english", "").lower() == english:
                found_cat, found_pos, found_word = cat_name, pos, w
                break
        if found_word is not None:
            break

    if found_word is None:
        # Fallback to index-based lookup
        found_cat, found_pos, found_word = _locate_word_by_index(data, index)

    if found_word is None:
        return jsonify({'error': 'Word not found.'}), 404

    # Only block if english actually changed to a value that exists elsewhere
    old_english = found_word.get("english", "").strip().lower()
    if english != old_english and _english_exists(data, english, exclude_cat=found_cat, exclude_pos=found_pos):
        return jsonify({'error': f'"{english}" already exists.'}), 409

    new_cat = category or UNCATEGORIZED_KEY

    # Remove from old position directly (no re-scan needed, we already know where it is)
    data["categories"][found_cat]["words"].pop(found_pos)

    # Clean up empty non-uncategorized categories
    if found_cat != UNCATEGORIZED_KEY:
        cat_obj = data["categories"].get(found_cat)
        if cat_obj and isinstance(cat_obj, dict) and len(cat_obj.get("words", [])) == 0:
            del data["categories"][found_cat]

    # Ensure new category exists
    if new_cat not in data["categories"]:
        data["categories"][new_cat] = {"description": "", "words": []}

    updated_word = {'english': english, 'persian': persian, 'alternatives': alternatives}
    data["categories"][new_cat]["words"].append(updated_word)

    if not save_data(data):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    result_word = dict(updated_word)
    result_word["category"] = category
    return jsonify({'message': 'Word updated.', 'word': result_word})


@app.route('/api/words/<int:index>', methods=['DELETE'])
def delete_word(index):
    data = load_data()
    cat, pos, word = _locate_word_by_index(data, index)

    if word is None:
        return jsonify({'error': 'Word not found.'}), 404

    english = word["english"]
    data["categories"][cat]["words"].pop(pos)

    if cat != UNCATEGORIZED_KEY:
        cat_obj = data["categories"].get(cat)
        if cat_obj and isinstance(cat_obj, dict) and len(cat_obj.get("words", [])) == 0:
            del data["categories"][cat]

    if not save_data(data):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    return jsonify({'message': f'"{english}" deleted.'})


@app.route('/api/aigen/<int:index>', methods=['PUT'])
def ai_gen(index):
    data = load_data()
    cat, pos, word = _locate_word_by_index(data, index)

    if word is None:
        return jsonify({'error': 'Word not found.'}), 404

    english_word = word.get('english', '')
    persian_word = word.get('persian', '')
    alternatives = word.get('alternatives', [])

    req = request.get_json(silent=True) or {}
    is_edit = req.get('is_edit', False)
    style = req.get('style', '')
    custom_style = req.get('custom_style', '')

    try:
        new_english, new_persian = generate_sentence(
            english=english_word, persian=persian_word, is_edit=is_edit, style=style, custom_style=custom_style
        )
    except Exception as e:
        print('aigen method put: ', e)
        return jsonify({'error': str(e)}), 500

    # Update in place directly at the known position
    data["categories"][cat]["words"][pos] = {
        'english': new_english,
        'persian': new_persian,
        'alternatives': alternatives
    }

    if not save_data(data):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    result_word = {
        'english': new_english,
        'persian': new_persian,
        'alternatives': alternatives,
        'category': cat if cat != UNCATEGORIZED_KEY else None
    }
    return jsonify({'message': 'Sentence generated.', 'word': result_word})


@app.route('/api/words/batch', methods=['POST'])
def batch_import():
    req = request.get_json()
    raw_text = req.get('text', '')

    if not raw_text.strip():
        return jsonify({'error': 'No text provided.'}), 400

    data = load_data()
    existing = set()
    for cat_obj in data["categories"].values():
        if isinstance(cat_obj, dict):
            for w in cat_obj.get("words", []):
                existing.add(w['english'].lower())

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
        data["categories"][UNCATEGORIZED_KEY]["words"].append(new_word)
        existing.add(english)
        added.append(dict(new_word))

    if added and not save_data(data):
        return jsonify({'error': 'Failed to save batch to Cloudflare KV.'}), 500

    return jsonify({
        'added':       added,
        'added_count': len(added),
        'duplicates':  duplicates,
        'errors':      errors,
        'total':       _total_words(data),
    })


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


@app.route('/api/words/delete-multiple', methods=['POST'])
def delete_multiple_words():
    req = request.get_json()
    indices = req.get('indices', [])

    if not indices or not isinstance(indices, list):
        return jsonify({'error': 'No indices provided.'}), 400

    data = load_data()
    index_map = _build_index_map(data)
    max_idx = len(index_map) - 1

    for i in indices:
        if not isinstance(i, int) or i < 0 or i > max_idx:
            return jsonify({'error': f'Invalid index: {i}'}), 400

    # Group by category so we can pop in descending position order per
    # category — this avoids the old O(n) "re-scan by english text" per
    # deleted word.
    by_cat = {}
    for i in set(indices):
        cat_name, pos = index_map[i]
        by_cat.setdefault(cat_name, []).append(pos)

    deleted_count = 0
    for cat_name, positions in by_cat.items():
        words = data["categories"][cat_name]["words"]
        for pos in sorted(positions, reverse=True):
            words.pop(pos)
            deleted_count += 1

    empty_cats = [
        k for k, v in data["categories"].items()
        if k != UNCATEGORIZED_KEY and isinstance(v, dict) and len(v.get("words", [])) == 0
    ]
    for k in empty_cats:
        del data["categories"][k]

    if not save_data(data):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    return jsonify({
        'message': f'{deleted_count} word(s) deleted.',
        'deleted_count': deleted_count,
        'total': _total_words(data),
    })


# ── Category endpoints ─────────────────────────────────────────────────────

@app.route('/api/categories', methods=['GET'])
def get_categories():
    data = load_data()
    categories = get_categories_list(data)
    return jsonify({'categories': categories, 'count': len(categories)})


@app.route('/api/categories', methods=['POST'])
def create_category():
    req = request.get_json()
    name = req.get('name', '').strip()
    description = req.get('description', '').strip()

    if not name:
        return jsonify({'error': 'Category name is required.'}), 400

    if name.lower() == UNCATEGORIZED_KEY:
        return jsonify({'error': f'"{name}" is a reserved name.'}), 400

    data = load_data()

    if any(k.lower() == name.lower() for k in data["categories"] if k != UNCATEGORIZED_KEY):
        return jsonify({'error': f'Category "{name}" already exists.'}), 409

    data["categories"][name] = {"description": description, "words": []}

    if not save_data(data):
        return jsonify({'error': 'Failed to save category to Cloudflare KV.'}), 500

    return jsonify({'message': f'Category "{name}" created.', 'category': {'name': name, 'description': description}}), 201


@app.route('/api/categories/<path:name>', methods=['DELETE'])
def delete_category(name):
    data = load_data()

    if name == UNCATEGORIZED_KEY:
        return jsonify({'error': 'Cannot delete "uncategorized".'}), 400

    found_key = None
    for k in data["categories"]:
        if k != UNCATEGORIZED_KEY and k.lower() == name.lower():
            found_key = k
            break

    if found_key is None:
        return jsonify({'error': f'Category "{name}" not found.'}), 404

    moved_words = data["categories"].pop(found_key, {}).get("words", [])
    data["categories"][UNCATEGORIZED_KEY]["words"].extend(moved_words)

    if not save_data(data):
        return jsonify({'error': 'Failed to save categories to Cloudflare KV.'}), 500

    return jsonify({'message': f'Category "{name}" deleted. {len(moved_words)} word(s) moved to uncategorized.'})


@app.route('/api/words/move-category', methods=['POST'])
def move_words_to_category():
    req = request.get_json()
    indices = req.get('indices', [])
    category = req.get('category', None)

    if not indices or not isinstance(indices, list):
        return jsonify({'error': 'No indices provided.'}), 400

    if category is not None:
        category = category.strip() if isinstance(category, str) else None
        if category == '':
            category = None

    data = load_data()
    index_map = _build_index_map(data)
    max_idx = len(index_map) - 1

    for i in indices:
        if not isinstance(i, int) or i < 0 or i > max_idx:
            return jsonify({'error': f'Invalid index: {i}'}), 400

    new_cat = category or UNCATEGORIZED_KEY
    if new_cat not in data["categories"]:
        data["categories"][new_cat] = {"description": "", "words": []}

    # Resolve positions to the actual word dicts up front (before any
    # mutation), grouped by source category so we can pop in descending
    # order per category without positions shifting under us.
    by_cat = {}
    seen = set()
    for i in indices:
        if i in seen:
            continue
        seen.add(i)
        cat_name, pos = index_map[i]
        by_cat.setdefault(cat_name, []).append(pos)

    moved_count = 0
    for old_cat, positions in by_cat.items():
        words = data["categories"][old_cat]["words"]
        for pos in sorted(positions, reverse=True):
            word = words.pop(pos)
            if old_cat != new_cat:
                data["categories"][new_cat]["words"].append(word)
                moved_count += 1

    empty_cats = [
        k for k, v in data["categories"].items()
        if k != UNCATEGORIZED_KEY and isinstance(v, dict) and len(v.get("words", [])) == 0
    ]
    for k in empty_cats:
        del data["categories"][k]

    if not save_data(data):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    target_label = f'"{category}"' if category else "uncategorized"
    return jsonify({'message': f'{moved_count} word(s) moved to {target_label}.'})


# ── Startup ──────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if check_kv_connection():
        print("✅ Cloudflare KV connection successful!")
        data = load_data()
        cats = data.get("categories", {})
        total = _total_words(data)
        cat_names = [k for k in cats if k != UNCATEGORIZED_KEY]
        print(f"   Words stored: {total}")
        print(f"   Categories: {len(cat_names)} ({', '.join(cat_names) if cat_names else 'none'})")
    else:
        print("⚠️  Cloudflare KV connection failed. Check your credentials.")
        print("   Required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_NAMESPACE_ID, CLOUDFLARE_API_TOKEN")

    app.run(debug=True)