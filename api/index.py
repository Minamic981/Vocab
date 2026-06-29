from flask import Flask, render_template, request, jsonify
import os
import json
import requests
from dotenv import load_dotenv
app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), '..', 'templates'),
    static_folder=os.path.join(os.path.dirname(__file__), '..', 'static')
)

load_dotenv()

# Cloudflare KV Configuration
ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
NAMESPACE_ID = os.environ.get('CLOUDFLARE_NAMESPACE_ID')
API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

# OpenRouter Config
MODEL_NAME = os.environ.get("MODEL_NAME")
OPENROUTER_URL = os.environ.get("OPENROUTER_URL")
OPEN_TOKEN = os.environ.get("OPEN_TOKEN")

# Base URL for Cloudflare KV API
BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/storage/kv/namespaces/{NAMESPACE_ID}"

# Headers for authentication
HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

# Key name for storing all words
WORDS_KEY = "vocabulary_words"

def load_words():
    """
    Load all words from Cloudflare KV
    Returns: list of word objects
    """
    if not all([ACCOUNT_ID, NAMESPACE_ID, API_TOKEN]):
        print("⚠️ Cloudflare credentials not configured. Using empty list.")
        return []
    
    try:
        response = requests.get(
            f"{BASE_URL}/values/{WORDS_KEY}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            # Parse the JSON data
            data = response.json()
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                # Handle if data is stored as a JSON string
                return json.loads(data.get('value', '[]'))
            else:
                return []
        elif response.status_code == 404:
            # Key doesn't exist yet, return empty list
            return []
        else:
            print(f"❌ Error loading words: {response.status_code} - {response.text}")
            return []
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error loading words: {e}")
        return []
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        return []

def save_words(words):
    """
    Save all words to Cloudflare KV
    Args: words - list of word objects
    Returns: boolean indicating success
    """
    if not all([ACCOUNT_ID, NAMESPACE_ID, API_TOKEN]):
        print("⚠️ Cloudflare credentials not configured. Cannot save.")
        return False
    
    try:
        # Convert to JSON string
        words_json = json.dumps(words, ensure_ascii=False)
        
        response = requests.put(
            f"{BASE_URL}/values/{WORDS_KEY}",
            headers=HEADERS,
            data=words_json
        )
        
        if response.status_code == 200:
            print(f"✅ Successfully saved {len(words)} words to KV")
            return True
        else:
            print(f"❌ Error saving words: {response.status_code} - {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error saving words: {e}")
        return False
    


def check_kv_connection():
    """
    Test if Cloudflare KV is accessible
    Returns: boolean
    """
    if not all([ACCOUNT_ID, NAMESPACE_ID, API_TOKEN]):
        return False
    try:
        response = requests.get(
            f"{BASE_URL}/keys",
            headers=HEADERS
        )
        return response.status_code == 200
    except:
        return False

def GenerateSentence(word: str) -> str:
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": """You are a creative sentence generator and translator.

The user will give you a word or a sentence.

Your task:
- If the user gives a WORD → Create a NEW sentence using that word
- If the user gives a SENTENCE → Create a DIFFERENT sentence with the SAME meaning

Then translate your NEW sentence to Persian.

Response format: Your NEW English sentence, Your Persian translation

Examples:
User: "apple" → "I eat an apple, من هر روز سیب می‌خورم"
User: "I ate an apple" → "I have apple,  من یک سیب دارم "

Rules:
- ALWAYS create a NEW sentence
- NEVER just translate the user's input
- The Persian must translate YOUR new sentence
- Only return: English sentence, Persian translation
- No extra text or explanation"""},
            {
                "role": "user",
                "content": word
            }
        ],
        "temperature": 0.4,
    }
    headers = {
        "Authorization": f"Bearer {OPEN_TOKEN}",
        "Content-Type": "application/json",
        "X-Title": "Vocab Site"
    }
    try:
        r = requests.post(OPENROUTER_URL, json=payload, timeout=180, headers=headers)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"].strip().split(',')
    except requests.exceptions.HTTPError as e:
        # Handle specific HTTP errors (4xx, 5xx)
        raise Exception(f"HTTP error: {e.response.status_code}")
    except requests.exceptions.ConnectionError:
        raise Exception("Connection failed")
    except requests.exceptions.Timeout:
        raise Exception("Request timed out")

@app.route('/')
def index():
    words = load_words()
    return render_template('index.html', words=words, count=len(words))


# ── API: get all words ──────────────────────────────────────────────────────
@app.route('/api/words', methods=['GET'])
def get_words():
    words = load_words()
    return jsonify({'words': words, 'count': len(words)})


# ── API: add single word ────────────────────────────────────────────────────
@app.route('/api/words', methods=['POST'])
def add_word():
    data = request.get_json()
    english = data.get('english', '').strip().lower()
    persian = data.get('persian', '').strip()

    if not english or not persian:
        return jsonify({'error': 'Both English and Persian fields are required.'}), 400

    words = load_words()

    # Check duplicate
    for w in words:
        if w['english'].lower() == english:
            return jsonify({'error': f'"{english}" already exists in your list.'}), 409

    new_word = {'english': english, 'persian': persian}
    words.append(new_word)

    if not save_words(words):
        return jsonify({'error': 'Failed to save word to Cloudflare KV.'}), 500

    return jsonify({'message': 'Word added successfully.', 'word': new_word}), 201


# ── API: edit word ──────────────────────────────────────────────────────────
@app.route('/api/words/<int:index>', methods=['PUT'])
def edit_word(index):
    data = request.get_json()
    english = data.get('english', '').strip().lower()
    persian = data.get('persian', '').strip()

    if not english or not persian:
        return jsonify({'error': 'Both fields are required.'}), 400

    words = load_words()

    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    # Check duplicate (excluding self)
    for i, w in enumerate(words):
        if i != index and w['english'].lower() == english:
            return jsonify({'error': f'"{english}" already exists.'}), 409

    words[index] = {'english': english, 'persian': persian}

    if not save_words(words):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    return jsonify({'message': 'Word updated.', 'word': words[index]})


# ── API: delete word ────────────────────────────────────────────────────────
@app.route('/api/words/<int:index>', methods=['DELETE'])
def delete_word(index):
    words = load_words()

    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    removed = words.pop(index)

    if not save_words(words):
        return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500

    return jsonify({'message': f'"{removed["english"]}" deleted.'})

# ── API: Ai Generate Sentence ────────────────────────────────────────────────────────
@app.route('/api/aigen/<int:index>', methods=['PUT'])
def AiGen(index):
    words = load_words()
    english_word = words[index]['english']
    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404
    try:
        english, persian = GenerateSentence(word=english_word)
        words[index] = {'english': english, 'persian': persian}
        if not save_words(words):
            return jsonify({'error': 'Failed to save changes to Cloudflare KV.'}), 500
    except Exception as e:
        return jsonify({'error': f'{e}'}), 500

    return jsonify({'message': f'Sentence Generated'})


# ── API: batch import ───────────────────────────────────────────────────────
@app.route('/api/words/batch', methods=['POST'])
def batch_import():
    data = request.get_json()
    raw_text = data.get('text', '')

    if not raw_text.strip():
        return jsonify({'error': 'No text provided.'}), 400

    words = load_words()
    existing = {w['english'].lower() for w in words}

    added = []
    duplicates = []
    errors = []

    for line_num, line in enumerate(raw_text.strip().splitlines(), 1):
        line = line.strip()
        if not line:
            continue

        if '=' not in line:
            errors.append(f'Line {line_num}: invalid format — "{line}"')
            continue

        parts = line.split('=', 1)
        english = parts[0].strip().lower()
        persian = parts[1].strip()

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

    if added:
        if not save_words(words):
            return jsonify({'error': 'Failed to save batch to Cloudflare KV.'}), 500

    return jsonify({
        'added': added,
        'added_count': len(added),
        'duplicates': duplicates,
        'errors': errors,
        'total': len(words)
    })


# ── API: check KV status ──────────────────────────────────────────────────
# @app.route('/api/kv-status', methods=['GET'])
# def kv_status():
#     """Check if Cloudflare KV is accessible"""
#     if not all([ACCOUNT_ID, NAMESPACE_ID, API_TOKEN]):
#         return jsonify({
#             'connected': False,
#             'error': 'Cloudflare credentials not configured'
#         })
    
#     try:
#         response = requests.get(
#             f"{BASE_URL}/keys?limit=1",
#             headers=HEADERS
#         )
        
#         if response.status_code == 200:
#             return jsonify({
#                 'connected': True,
#                 'account_id': ACCOUNT_ID[:8] + '...',
#                 'namespace_id': NAMESPACE_ID[:8] + '...',
#                 'words_count': len(load_words())
#             })
#         else:
#             return jsonify({
#                 'connected': False,
#                 'error': f'API returned status {response.status_code}'
#             })
#     except Exception as e:
#         return jsonify({
#             'connected': False,
#             'error': str(e)
#         })


# ── API: clear all words (for testing) ─────────────────────────────────────
@app.route('/api/words/clear', methods=['DELETE'])
def clear_words():
    """⚠️ WARNING: Deletes all words from KV"""
    if not save_words([]):
        return jsonify({'error': 'Failed to clear words from KV.'}), 500
    return jsonify({'message': 'All words cleared.'})


if __name__ == '__main__':
    # Check KV connection on startup
    if check_kv_connection():
        print("✅ Cloudflare KV connection successful!")
        print(f"   Words stored: {len(load_words())}")
    else:
        print("⚠️ Cloudflare KV connection failed. Check your credentials.")
        print("   Make sure these environment variables are set:")
        print("   - CLOUDFLARE_ACCOUNT_ID")
        print("   - CLOUDFLARE_NAMESPACE_ID")
        print("   - CLOUDFLARE_API_TOKEN")
    
    app.run(debug=True)