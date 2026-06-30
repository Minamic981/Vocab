# My WordBook — Vocabulary Learning App

A personal English vocabulary tracker for Persian speakers, built with Flask and powered by AI.

## Features

- **Library** — Browse, search, edit, delete words with live filtering
- **Bookmark** — Star words in practice mode; filter bookmarked words in library
- **Add Word** — Add one word at a time with optional AI sentence generation
- **Batch Import** — Paste many words at once in `English = فارسی` format
- **Practice Mode** — Flip cards with text-to-speech, keyboard shortcuts, and shuffle
- **Multiple Meanings** — AI-powered lookup showing up to 5 distinct senses of a word
- **AI Sentence Generation** — Generate example sentences; rephrase from edit modal
- **Export** — Download word list as a text file (`english = persian` format)
- **Mobile Friendly** — Tap-to-reveal Persian, large touch targets, responsive layout

## Project Structure

```
vocab-app/
├── api/
│   ├── index.py          ← Flask app & routes (Vercel entry point)
│   └── ai.py             ← OpenRouter AI integration
├── static/
│   ├── app.js            ← Frontend logic
│   └── style.css         ← Styles
├── templates/
│   ├── index.html        ← Base template
│   └── components/
│       ├── header.html
│       ├── nav.html
│       ├── body.html     ← All tab panels (library, import, practice, meanings)
│       └── footer.html
├── requirements.txt
├── vercel.json
└── README.md
```

## Running Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set up environment variables (copy .env.example or create .env)
#    CLOUDFLARE_ACCOUNT_ID=...
#    CLOUDFLARE_NAMESPACE_ID=...
#    CLOUDFLARE_API_TOKEN=...
#    MODEL_NAME=...
#    OPENROUTER_URL=...
#    OPEN_TOKEN=...

# 3. Run the dev server
python api/index.py
```

Open http://localhost:5000

## Deploying to Vercel

```bash
npm i -g vercel
vercel login
vercel
```

Vercel auto-detects Python and `vercel.json` handles routing.

## Storage

Words are stored in **Cloudflare KV** as a single JSON array under the key `vocabulary_words`. The app uses an in-memory cache (60s TTL) to avoid hitting KV on every request.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/words` | List all words |
| POST | `/api/words` | Add one word (supports `aigen: true` for AI generation) |
| PUT | `/api/words/<index>` | Edit a word |
| DELETE | `/api/words/<index>` | Delete a word |
| POST | `/api/words/batch` | Batch import |
| PUT | `/api/aigen/<index>` | AI sentence generation (`is_edit: true` for rephrase) |
| POST | `/defs/<word>` | AI multi-definition lookup |
| DELETE | `/api/words/clear` | Delete all words |

## AI Integration

Uses [OpenRouter](https://openrouter.ai) for two capabilities:

- **Sentence Generator** — Auto-detects mode (English only, Persian only, English+Persian, or edit/rephrase) and generates a natural example sentence under 15 words with Persian translation
- **Definition Lookup** — Returns up to 5 distinct senses of an English word with example sentences and Persian translations

## Keyboard Shortcuts (Practice Mode)

| Key | Action |
|---|---|
| `Space` | Flip card |
| `→` | Next word |
| `←` | Previous word |
