# My WordBook — Vocabulary Learning App

A personal English vocabulary tracker for Persian speakers, built with Flask and powered by AI. Words are stored in **Cloudflare KV** and the app is designed for easy deployment on **Vercel**.

## Features

- **Library** — Browse, search, edit, delete words with live filtering
- **Categories** — Organize words into categories; create, filter, and move words between them
- **Bookmark** — Star words in practice mode; filter bookmarked words in library
- **Add Word** — Add one word at a time with optional AI sentence generation
- **Batch Import** — Paste many words at once in `English = فارسی` format
- **Practice Mode** — Flip cards with text-to-speech, keyboard shortcuts, and shuffle
- **Multiple Meanings** — AI-powered lookup showing up to 10 distinct senses of a word
- **AI Sentence Generation** — Generate example sentences with style presets (romantic, formal, humorous, etc.) or custom instructions; rephrase from edit modal
- **Bulk Operations** — Select multiple words to delete or move to a different category
- **Export** — Download word list as a text file (`english = persian` format)
- **Mobile Friendly** — Tap-to-reveal Persian, large touch targets, responsive layout

## Project Structure

```
vocab-app/
├── api/
│   ├── index.py          ← Flask app & all routes (Vercel entry point)
│   └── ai.py             ← OpenRouter AI integration
├── static/
│   ├── app.js            ← Frontend logic
│   └── style.css         ← Styles
├── templates/
│   └── index.html        ← Single-page app template
├── test/
│   └── test_routes.py    ← Route tests
├── requirements.txt
├── vercel.json
├── LICENSE               ← MIT
└── README.md
```

## Getting Cloudflare KV Credentials

The app uses **Cloudflare Workers KV** as its database. You need three values: an Account ID, a KV Namespace ID, and an API Token.

### Step 1 — Create a Cloudflare Account

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) and sign up (free tier is enough).

### Step 2 — Get Your Account ID

1. On the Cloudflare dashboard, select any domain (or go to **Workers & Pages** in the left sidebar).
2. Scroll to the bottom of the **Overview** page — your **Account ID** is listed there.
3. Copy it.

### Step 3 — Create a KV Namespace

1. In the dashboard sidebar, go to **Workers & Pages**.
2. Click the **KV** tab (or navigate to **Storage & Databases > KV**).
3. Click **Create a namespace**.
4. Give it a name (e.g. `vocabulary`) and click **Add**.
5. After creation, click the **...** menu next to the namespace and select **Details**.
6. Copy the **Namespace ID**.

### Step 4 — Create an API Token

1. Go to [My Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens) (click your avatar in the top-right).
2. Click **Create Token**.
3. Use the **Edit Cloudflare Workers** template, or create a custom token with these permissions:
   - **Account** → **Workers KV Storage** → **Edit**
4. Under **Account Resources**, select your account.
5. Click **Continue to summary** → **Create Token**.
6. Copy the token immediately (it won't be shown again).

### Step 5 — Set Environment Variables

Create a `.env` file in the project root:

```env
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_NAMESPACE_ID=your_namespace_id
CLOUDFLARE_API_TOKEN=your_api_token
```

## AI Integration Setup (Optional)

The app uses [OpenRouter](https://openrouter.ai) for sentence generation and definition lookup. To enable AI features, add these to your `.env`:

```env
OPENROUTER_URL=https://openrouter.ai/api/v1/chat/completions
OPEN_TOKEN=your_openrouter_api_key
MODEL_NAME=your_model_name
```

You can get an API key at [openrouter.ai/keys](https://openrouter.ai/keys).

## Installation

```bash
# Clone the repository
git clone https://github.com/Minamic981/Vocab.git
cd Vocab

# Create a virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env   # or create .env manually (see above)

# Run the dev server
python api/index.py
```

Open [http://localhost:5000](http://localhost:5000).

## Deploying to Vercel

```bash
npm i -g vercel
vercel login
vercel
```

Set your environment variables in the Vercel dashboard under **Settings > Environment Variables** (same keys as the `.env` file).

Vercel auto-detects Python and `vercel.json` handles routing.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serve the main page |
| `GET` | `/api/words` | List all words (flattened across categories) |
| `POST` | `/api/words` | Add a word. Supports `aigen: true` for AI generation, `style`/`custom_style` for sentence styling, and `alternatives` |
| `PUT` | `/api/words/<index>` | Edit a word by global index |
| `DELETE` | `/api/words/<index>` | Delete a word by global index |
| `POST` | `/api/words/batch` | Batch import from `english = فارسی` text |
| `POST` | `/api/words/delete-multiple` | Delete multiple words by indices |
| `POST` | `/api/words/move-category` | Move words to a different category |
| `PUT` | `/api/aigen/<index>` | AI sentence generation/rephrase for a word |
| `POST` | `/defs/<word>` | AI multi-definition lookup (up to 10 senses) |
| `GET` | `/api/categories` | List all categories |
| `POST` | `/api/categories` | Create a new category |
| `DELETE` | `/api/categories/<name>` | Delete a category (words move to uncategorized) |

## Data Storage

Words are stored in **Cloudflare KV** as a single JSON object under the key `vocabulary`. The structure is:

```json
{
  "categories": {
    "uncategorized": {
      "description": "Items without a category",
      "words": [
        {
          "english": "example",
          "persian": "مثال",
          "alternatives": ["An instance of something.", "A thing characteristic of its kind."]
        }
      ]
    },
    "Grammar": {
      "description": "Grammar-related words",
      "words": []
    }
  }
}
```

The app uses an in-memory cache (60s TTL) with a reusable HTTP session to minimize KV API calls.

## AI Capabilities

### Sentence Generation

Auto-detects input mode:
- **English + Persian** — Generates a natural sentence using the exact word with the given meaning
- **English only** — Generates a sentence using the most common meaning
- **Persian only** — Finds the English equivalent and generates a sentence
- **Edit/Rephrase** — Rewrites a sentence with the same meaning and key word

**Style presets**: Romantic, Formal, Humorous, Poetic, Minimalist, Academic, Casual, Dramatic, Simple — or write your own custom style instruction.

### Definition Lookup

Returns up to 10 distinct senses of an English word, each with an example sentence and Persian translation.

## Keyboard Shortcuts (Practice Mode)

| Key | Action |
|-----|--------|
| `Space` | Flip card |
| `→` | Next word |
| `←` | Previous word |

## Contributing

Contributions are welcome! Here's how:

1. **Fork** the repository
2. **Create** a branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit** your changes with a clear message:
   ```bash
   git commit -m "Add: brief description of what you changed"
   ```
4. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** against `main`

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow the existing code style (no linter configured, but stay consistent)
- Test your changes locally before submitting
- If you're adding a new endpoint, mention it in your PR description
- For bug reports or feature ideas, open an issue first

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Flask (Python) |
| Database | Cloudflare Workers KV |
| AI | OpenRouter API |
| Frontend | Vanilla JS, HTML, CSS |
| Fonts | [Vazirmatn](https://github.com/rastikerdar/vazirmatn) (Persian), Inter, Lora |
| Hosting | Vercel |

## License

[MIT](LICENSE) — Copyright (c) 2026 Minamic981
