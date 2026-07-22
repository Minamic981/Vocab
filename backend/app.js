const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { generate_sentence, gen_definitions } = require("./ai.js");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ── Device detection ─────────────────────────────────────────────────────────

function isMobile(req) {
    const ua = req.headers["user-agent"] || "";
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

// ── Path configuration (Vercel vs local) ─────────────────────────────────────
const IS_VERCEL = !!process.env.VERCEL;

const HTML_DIR = IS_VERCEL
    ? path.join(__dirname, "static", "src")
    : path.join(__dirname, "..", "frontend", "dist", "src");

const ASSETS_DIR = IS_VERCEL
    ? path.join(__dirname, "static")
    : path.join(__dirname, "..", "frontend", "dist");

const PUBLIC_DIR = IS_VERCEL
    ? path.join(__dirname, "static")
    : path.join(__dirname, "..", "frontend", "public");

// ── HTML routes ──────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
    const mobile = isMobile(req);
    const [folder, file] = mobile ? ["mobile", "mobile.html"] : ["web", "index.html"];
    res.sendFile(path.join(HTML_DIR, folder, file));
});

app.get("/lab", (req, res) => {
    res.sendFile(path.join(HTML_DIR, "lab", "lab.html"));
});

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR));
app.use(express.static(ASSETS_DIR));
app.use(express.static(HTML_DIR));

// ── Cloudflare KV Configuration ─────────────────────────────────────────────
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAMESPACE_ID = process.env.CLOUDFLARE_NAMESPACE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;
const DATA_KEY = "vocabulary";
const UNCATEGORIZED_KEY = "uncategorized";

// ── In-memory cache ──────────────────────────────────────────────────────────
const _cache = { data: null, ts: 0 };
const CACHE_TTL = 60;
const KV_RETRIES = 3;
const KV_RETRY_DELAY = 3000;

function _cacheGet() {
    if (_cache.data !== null && (Date.now() - _cache.ts) < CACHE_TTL * 1000) {
        return _cache.data;
    }
    return null;
}

function _cacheSet(data) {
    _cache.data = data;
    _cache.ts = Date.now();
}

function _cacheClear() {
    _cache.data = null;
    _cache.ts = 0;
}

function _kvOk() {
    return ACCOUNT_ID && NAMESPACE_ID && API_TOKEN;
}

function _emptyData() {
    return {
        wordcount: 0,
        categories: {
            [UNCATEGORIZED_KEY]: {
                description: "Items without a category",
                words: []
            }
        }
    };
}

// ── KV helpers ───────────────────────────────────────────────────────────────

async function loadKV(key) {
    if (!_kvOk()) return null;
    const res = await fetch(`${BASE_URL}/values/${key}`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KV load error: ${res.status}`);
    const raw = await res.json();
    return typeof raw.value === "string" ? JSON.parse(raw.value) : raw;
}

async function saveKV(key, value) {
    if (!_kvOk()) return false;
    const res = await fetch(`${BASE_URL}/values/${key}`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(value)
    });
    return res.ok;
}

async function loadData() {
    const cached = _cacheGet();
    if (cached) return cached;

    if (!_kvOk()) return _emptyData();

    for (let attempt = 1; attempt <= KV_RETRIES; attempt++) {
        try {
            const data = await loadKV(DATA_KEY);
            if (data && data.categories) {
                if (data.wordcount === undefined) data.wordcount = 0;
                _cacheSet(data);
                return data;
            }
            return _emptyData();
        } catch (e) {
            console.log(`KV load attempt ${attempt}/${KV_RETRIES} failed:`, e.message);
            if (attempt < KV_RETRIES) {
                await new Promise(r => setTimeout(r, KV_RETRY_DELAY));
            }
        }
    }
    _cacheClear();
    return _emptyData();
}

async function saveData(data) {
    if (!_kvOk()) return false;

    if (!data.categories) data.categories = {};
    if (!data.categories[UNCATEGORIZED_KEY]) {
        data.categories[UNCATEGORIZED_KEY] = { description: "Items without a category", words: [] };
    }
    if (data.wordcount === undefined) data.wordcount = 0;

    for (let attempt = 1; attempt <= KV_RETRIES; attempt++) {
        try {
            const ok = await saveKV(DATA_KEY, data);
            if (ok) {
                _cacheSet(data);
                return true;
            }
            return false;
        } catch (e) {
            console.log(`KV save attempt ${attempt}/${KV_RETRIES} failed:`, e.message);
            if (attempt < KV_RETRIES) {
                await new Promise(r => setTimeout(r, KV_RETRY_DELAY));
            }
        }
    }
    _cacheClear();
    return false;
}

// ── Word helpers (new structure: index-based) ────────────────────────────────

function findByIndex(data, index) {
    const cats = data.categories || {};
    for (const [catName, catObj] of Object.entries(cats)) {
        const words = catObj?.words || [];
        for (let pos = 0; pos < words.length; pos++) {
            if (words[pos].index === index) {
                return { cat: catName, pos, word: words[pos] };
            }
        }
    }
    return null;
}

function findByIndices(data, indices) {
    const results = [];
    for (const index of indices) {
        const found = findByIndex(data, index);
        if (found) results.push({ index, ...found });
    }
    return results;
}

function englishExists(data, english, excludeIndex = null) {
    english = english.toLowerCase();
    const cats = data.categories || {};
    for (const catObj of Object.values(cats)) {
        for (const word of catObj?.words || []) {
            if (word.index === excludeIndex) continue;
            if (word.english?.toLowerCase() === english) return true;
        }
    }
    return false;
}

function findExistingWord(data, english) {
    english = english.toLowerCase();
    const cats = data.categories || {};
    for (const [catName, catObj] of Object.entries(cats)) {
        for (const word of catObj?.words || []) {
            if (word.english?.toLowerCase() === english) {
                return { cat: catName, word };
            }
        }
    }
    return null;
}

function getCategoriesList(data) {
    const cats = data.categories || {};
    return Object.entries(cats)
        .filter(([name]) => name !== UNCATEGORIZED_KEY)
        .map(([name, obj]) => ({ name, description: obj?.description || "" }));
}

// ── Words API ────────────────────────────────────────────────────────────────

app.get("/api/words", async (req, res) => {
    const data = await loadData();
    res.json(data);
});

app.post("/api/words", async (req, res) => {
    const { english: rawEnglish, persian: rawPersian, aigen, alternatives: rawAlts, category: rawCat, style, custom_style } = req.body;

    const english = (rawEnglish || "").trim().toLowerCase();
    const persian = (rawPersian || "").trim();

    if (!english) return res.status(400).json({ error: "English field is required." });
    if (!aigen && !persian) return res.status(400).json({ error: "Persian field is required." });

    let alternatives = rawAlts || [];
    if (typeof alternatives === "string") {
        alternatives = alternatives.split("\n").map(a => a.trim()).filter(Boolean);
    }

    let category = rawCat?.trim() || null;

    let newWord;
    if (aigen) {
        try {
            const [newEnglish, newPersian] = await generate_sentence(english, persian, { style, custom_style });
            newWord = { english: newEnglish, persian: newPersian, alternatives };
        } catch (e) {
            return res.status(500).json({ error: e.message || "AI generation failed" });
        }
    } else {
        newWord = { english, persian, alternatives };
    }

    const data = await loadData();

    const existing = findExistingWord(data, english);
    if (existing) {
        const oldPersian = existing.word.persian || '';
        const mergedPersian = oldPersian + '/' + newWord.persian;
        existing.word.persian = mergedPersian;
        if (newWord.alternatives?.length) {
            existing.word.alternatives = [...(existing.word.alternatives || []), ...newWord.alternatives];
        }

        if (!(await saveData(data))) {
            return res.status(500).json({ error: "Failed to save to Cloudflare KV." });
        }

        const wordCat = existing.cat === UNCATEGORIZED_KEY ? null : existing.cat;
        return res.status(200).json({
            action: "merged",
            message: `"${english}" already exists. Persian meaning merged.`,
            word: { ...existing.word, category: wordCat }
        });
    }

    const catKey = category || UNCATEGORIZED_KEY;
    if (!data.categories[catKey]) {
        data.categories[catKey] = { description: "", words: [] };
    }

    newWord.index = data.wordcount;
    newWord.isBookmarked = false;
    data.wordcount++;

    data.categories[catKey].words.push(newWord);

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save to Cloudflare KV." });
    }

    res.status(201).json({ message: "Word added successfully.", word: { ...newWord, category } });
});

app.put("/api/words/:index", async (req, res) => {
    const index = parseInt(req.params.index);
    const { english: rawEnglish, persian: rawPersian, alternatives: rawAlts, category: rawCat } = req.body;

    const english = (rawEnglish || "").trim().toLowerCase();
    const persian = (rawPersian || "").trim();

    if (!english || !persian) return res.status(400).json({ error: "Both fields are required." });

    let alternatives = rawAlts || [];
    if (typeof alternatives === "string") {
        alternatives = alternatives.split("\n").map(a => a.trim()).filter(Boolean);
    }

    let category = rawCat?.trim() || null;

    const data = await loadData();
    const found = findByIndex(data, index);

    if (!found) return res.status(404).json({ error: "Word not found." });

    if (english !== found.word.english?.toLowerCase() && englishExists(data, english, index)) {
        return res.status(409).json({ error: `"${english}" already exists.` });
    }

    const newCat = category || UNCATEGORIZED_KEY;

    data.categories[found.cat].words.splice(found.pos, 1);

    if (!data.categories[newCat]) {
        data.categories[newCat] = { description: "", words: [] };
    }

    const updatedWord = { english, persian, alternatives, index, isBookmarked: found.word.isBookmarked || false };
    data.categories[newCat].words.push(updatedWord);

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
    }

    res.json({ message: "Word updated.", word: { ...updatedWord, category } });
});

app.delete("/api/words/:index", async (req, res) => {
    const index = parseInt(req.params.index);
    const data = await loadData();
    const found = findByIndex(data, index);

    if (!found) return res.status(404).json({ error: "Word not found." });

    const english = found.word.english;
    data.categories[found.cat].words.splice(found.pos, 1);

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
    }

    res.json({ message: `"${english}" deleted.` });
});

app.put("/api/aigen/:index", async (req, res) => {
    const index = parseInt(req.params.index);
    const data = await loadData();
    const found = findByIndex(data, index);

    if (!found) return res.status(404).json({ error: "Word not found." });

    const { english, persian, alternatives, isBookmarked } = found.word;
    const { is_edit, style, custom_style } = req.body || {};

    try {
        const [newEnglish, newPersian] = await generate_sentence(english, persian, { is_edit, style, custom_style });
        data.categories[found.cat].words[found.pos] = {
            english: newEnglish, persian: newPersian, alternatives, index, isBookmarked
        };

        if (!(await saveData(data))) {
            return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
        }

        res.json({
            message: "Sentence generated.",
            word: { english: newEnglish, persian: newPersian, alternatives, index, isBookmarked, category: found.cat === UNCATEGORIZED_KEY ? null : found.cat }
        });
    } catch (e) {
        res.status(500).json({ error: e.message || "AI generation failed" });
    }
});

app.post("/api/words/batch", async (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "No text provided." });

    const data = await loadData();
    const existing = new Set();
    for (const catObj of Object.values(data.categories || {})) {
        for (const w of catObj?.words || []) {
            existing.add(w.english.toLowerCase());
        }
    }

    const added = [], duplicates = [], errors = [];
    const lines = text.trim().split("\n");
    let currentCategory = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const catMatch = line.match(/^\((.+)\)$/);
        if (catMatch) {
            currentCategory = catMatch[1];
            if (!data.categories[currentCategory]) {
                data.categories[currentCategory] = { description: `${currentCategory} Category`, words: [] };
            }
            continue;
        }

        if (!line.includes("=")) {
            errors.push(`Line ${i + 1}: invalid format — "${line}"`);
            continue;
        }

        const [english, ...rest] = line.split("=");
        const persian = rest.join("=").trim();
        const eng = english.trim().toLowerCase();

        if (!eng || !persian) {
            errors.push(`Line ${i + 1}: empty value — "${line}"`);
            continue;
        }

        if (existing.has(eng)) {
            duplicates.push(eng);
            continue;
        }

        const newWord = {
            english: eng,
            persian,
            alternatives: [],
            index: data.wordcount,
            isBookmarked: false
        };
        data.wordcount++;

        const catKey = currentCategory || UNCATEGORIZED_KEY;
        if (!data.categories[catKey]) {
            data.categories[catKey] = { description: `${catKey} Category`, words: [] };
        }
        data.categories[catKey].words.push(newWord);
        existing.add(eng);
        added.push({ ...newWord, category: currentCategory });
    }

    if (added.length && !(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save batch to Cloudflare KV." });
    }

    res.json({ added, added_count: added.length, duplicates, errors, total: data.wordcount });
});

app.post("/api/words/delete-multiple", async (req, res) => {
    const { indices } = req.body;
    if (!indices?.length || !Array.isArray(indices)) {
        return res.status(400).json({ error: "No indices provided." });
    }

    const data = await loadData();
    const found = findByIndices(data, indices);

    if (found.length !== indices.length) {
        return res.status(400).json({ error: "One or more indices not found." });
    }

    let deletedCount = 0;
    const byCat = {};
    for (const f of found) {
        if (!byCat[f.cat]) byCat[f.cat] = [];
        byCat[f.cat].push(f.pos);
    }

    for (const [catName, positions] of Object.entries(byCat)) {
        const words = data.categories[catName].words;
        for (const pos of positions.sort((a, b) => b - a)) {
            words.splice(pos, 1);
            deletedCount++;
        }
    }

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
    }

    res.json({ message: `${deletedCount} word(s) deleted.`, deleted_count: deletedCount, total: data.wordcount });
});

app.post("/api/words/move-category", async (req, res) => {
    const { indices, category } = req.body;
    if (!indices?.length || !Array.isArray(indices)) {
        return res.status(400).json({ error: "No indices provided." });
    }

    let cat = category?.trim() || null;
    const newCat = cat || UNCATEGORIZED_KEY;

    const data = await loadData();
    const found = findByIndices(data, indices);

    if (found.length !== indices.length) {
        return res.status(400).json({ error: "One or more indices not found." });
    }

    if (!data.categories[newCat]) {
        data.categories[newCat] = { description: "", words: [] };
    }

    let movedCount = 0;
    const byCat = {};
    for (const f of found) {
        if (!byCat[f.cat]) byCat[f.cat] = [];
        byCat[f.cat].push(f);
    }

    for (const [oldCat, entries] of Object.entries(byCat)) {
        const words = data.categories[oldCat].words;
        for (const entry of entries.sort((a, b) => b.pos - a.pos)) {
            const word = words.splice(entry.pos, 1)[0];
            if (oldCat !== newCat) {
                data.categories[newCat].words.push(word);
                movedCount++;
            }
        }
    }

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
    }

    res.json({ message: `${movedCount} word(s) moved to "${cat || "uncategorized"}".` });
});

// ── Categories API ───────────────────────────────────────────────────────────

app.get("/api/categories", async (req, res) => {
    const data = await loadData();
    const categories = getCategoriesList(data);
    res.json({ categories, count: categories.length });
});

app.post("/api/categories", async (req, res) => {
    const { name: rawName, description: rawDesc } = req.body;
    const name = rawName?.trim();
    const description = rawDesc?.trim();

    if (!name) return res.status(400).json({ error: "Category name is required." });
    if (name.toLowerCase() === UNCATEGORIZED_KEY) return res.status(400).json({ error: `"${name}" is a reserved name.` });

    const data = await loadData();

    if (Object.keys(data.categories).some(k => k.toLowerCase() === name.toLowerCase() && k !== UNCATEGORIZED_KEY)) {
        return res.status(409).json({ error: `Category "${name}" already exists.` });
    }

    data.categories[name] = { description, words: [] };

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save category to Cloudflare KV." });
    }

    res.status(201).json({ message: `Category "${name}" created.`, category: { name, description } });
});

app.delete("/api/categories/:name", async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const data = await loadData();

    if (name === UNCATEGORIZED_KEY) {
        return res.status(400).json({ error: "Cannot delete \"uncategorized\"." });
    }

    const foundKey = Object.keys(data.categories).find(k => k !== UNCATEGORIZED_KEY && k.toLowerCase() === name.toLowerCase());

    if (!foundKey) return res.status(404).json({ error: `Category "${name}" not found.` });

    const movedWords = (data.categories[foundKey]?.words || []);
    delete data.categories[foundKey];
    data.categories[UNCATEGORIZED_KEY].words.push(...movedWords);

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save categories to Cloudflare KV." });
    }

    res.json({ message: `Category "${name}" deleted. ${movedWords.length} word(s) moved to uncategorized.` });
});

// ── Definitions API ──────────────────────────────────────────────────────────

app.get("/defs/:word", async (req, res) => {
    const word = req.params.word?.trim().toLowerCase();
    if (!word) return res.status(400).json({ error: "Word is required." });

    try {
        const definitions = await gen_definitions(word);
        res.json(definitions);
    } catch (e) {
        console.error(`[defs] Error for "${word}":`, e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message || "Failed to get definitions" });
        }
    }
});

// ── Error handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});

// ── Start ────────────────────────────────────────────────────────────────────

if (!IS_VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
