<<<<<<< HEAD
# My WordBook — Vocabulary Learning App

A personal English vocabulary tracker for Persian speakers, built with Flask.

## Project Structure

```
vocab-app/
├── api/
│   └── index.py        ← Flask app (Vercel entry point)
├── templates/
│   └── index.html      ← Single-page UI
├── words.json          ← Local data file (dev only)
├── requirements.txt
├── vercel.json
└── README.md
```

## Running Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the dev server
cd vocab-app
python api/index.py
```

Open http://localhost:5000

## Deploying to Vercel

### One-time setup

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login
```

### Deploy

```bash
cd vocab-app
vercel
```

Follow the prompts — Vercel auto-detects Python and `vercel.json` handles routing.

### ⚠️ Important: Data on Vercel

Vercel runs serverless functions with an **ephemeral filesystem** — data written to `/tmp/words.json` is lost when the function instance spins down (usually within minutes to hours).

**For persistent storage, use one of:**

| Option | Effort | Cost |
|---|---|---|
| [Vercel KV (Redis)](https://vercel.com/storage/kv) | Low | Free tier available |
| [PlanetScale (MySQL)](https://planetscale.com) | Medium | Free tier available |
| [Supabase (Postgres)](https://supabase.com) | Medium | Free tier available |
| GitHub Gist (via API) | Low | Free |

The simplest upgrade is **Vercel KV** — replace the `load_words`/`save_words` functions in `api/index.py` with KV calls using the `vercel_kv` SDK.

## Features

- **Library** — browse, search, edit, delete all words
- **Add Word** — add one word at a time (Enter key supported)
- **Batch Import** — paste many words in `English = فارسی` format
- **Practice Mode** — flip cards, keyboard shortcuts (Space = flip, ← → = navigate)

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/words` | List all words |
| POST | `/api/words` | Add one word |
| PUT | `/api/words/<index>` | Edit a word |
| DELETE | `/api/words/<index>` | Delete a word |
| POST | `/api/words/batch` | Batch import |
=======
# Vocab
>>>>>>> 1a256691fcc37bc724e9df4e2b98be86d471fc77
