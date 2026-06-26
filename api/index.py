from flask import Flask, render_template, request, jsonify, redirect, url_for
import os
import json

app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), '..', 'templates'),
    static_folder=os.path.join(os.path.dirname(__file__), '..', 'static')
)

# Use /tmp for Vercel (ephemeral) or local file for dev
DATA_FILE = '/tmp/words.json' if os.environ.get('VERCEL') else os.path.join(os.path.dirname(__file__), '..', 'words.json')


def load_words():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []


def save_words(words):
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(words, f, ensure_ascii=False, indent=2)
        return True
    except IOError as e:
        print(f"Error saving words: {e}")
        return False


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
        return jsonify({'error': 'Failed to save word.'}), 500

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
        return jsonify({'error': 'Failed to save changes.'}), 500

    return jsonify({'message': 'Word updated.', 'word': words[index]})


# ── API: delete word ────────────────────────────────────────────────────────
@app.route('/api/words/<int:index>', methods=['DELETE'])
def delete_word(index):
    words = load_words()

    if index < 0 or index >= len(words):
        return jsonify({'error': 'Word not found.'}), 404

    removed = words.pop(index)

    if not save_words(words):
        return jsonify({'error': 'Failed to save changes.'}), 500

    return jsonify({'message': f'"{removed["english"]}" deleted.'})


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
        save_words(words)

    return jsonify({
        'added': added,
        'added_count': len(added),
        'duplicates': duplicates,
        'errors': errors,
        'total': len(words)
    })


if __name__ == '__main__':
    app.run(debug=True)
