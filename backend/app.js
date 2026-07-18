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

// ── HTML routes (BEFORE static middleware) ────────────────────────────────────

app.get("/", (req, res) => {
    const ua = req.headers["user-agent"] || "";
    const mobile = isMobile(req);
    console.log(`[Device Detection] User-Agent: ${ua}`);
    console.log(`[Device Detection] Is Mobile: ${mobile}`);
    const file = mobile ? "mobile.html" : "index.html";
    console.log(`[Device Detection] Serving: ${file}`);
    res.sendFile(path.join(__dirname, "..", "frontend", "dist", file));
});

app.get("/lab", (req, res) => {
    const ua = req.headers["user-agent"] || "";
    const mobile = isMobile(req);
    console.log(`[Device Detection] User-Agent: ${ua}`);
    console.log(`[Device Detection] Is Mobile: ${mobile}`);
    const file = mobile ? "mobile.html" : "lab.html";
    console.log(`[Device Detection] Serving: ${file}`);
    res.sendFile(path.join(__dirname, "..", "frontend", "dist", file));
});

// ── Static files (AFTER routes) ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "frontend", "public")));
app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));

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

// ── Word access helpers ───────────────────────────────────────────────────────

function flattenWords(data) {
    const result = [];
    const cats = data.categories || {};
    for (const [catName, catObj] of Object.entries(cats)) {
        const words = catObj?.words || [];
        for (const word of words) {
            result.push({ ...word, category: catName === UNCATEGORIZED_KEY ? null : catName });
        }
    }
    return result;
}

function deflatWords(words) {
    const cats = {};
    for (const word of words) {
        const cat = word.category || UNCATEGORIZED_KEY;
        const { category, ...w } = word;
        if (!cats[cat]) cats[cat] = { description: "", words: [] };
        cats[cat].words.push(w);
    }
    if (!cats[UNCATEGORIZED_KEY]) {
        cats[UNCATEGORIZED_KEY] = { description: "Items without a category", words: [] };
    }
    return { categories: cats };
}

function locateWordByIndex(data, index) {
    const cats = data.categories || {};
    let running = 0;
    for (const [catName, catObj] of Object.entries(cats)) {
        const words = catObj?.words || [];
        if (index < running + words.length) {
            return { cat: catName, pos: index - running, word: words[index - running] };
        }
        running += words.length;
    }
    return null;
}

function buildIndexMap(data) {
    const result = [];
    const cats = data.categories || {};
    for (const [catName, catObj] of Object.entries(cats)) {
        const words = catObj?.words || [];
        for (let pos = 0; pos < words.length; pos++) {
            result.push({ cat: catName, pos });
        }
    }
    return result;
}

function englishExists(data, english, excludeCat = null, excludePos = null) {
    english = english.toLowerCase();
    const cats = data.categories || {};
    for (const [catName, catObj] of Object.entries(cats)) {
        const words = catObj?.words || [];
        for (let pos = 0; pos < words.length; pos++) {
            if (catName === excludeCat && pos === excludePos) continue;
            if (words[pos].english?.toLowerCase() === english) return true;
        }
    }
    return false;
}

function totalWords(data) {
    return Object.values(data.categories || {}).reduce((sum, c) => sum + (c?.words?.length || 0), 0);
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
    const words = flattenWords(data);
    res.json({ words, count: words.length });
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

    if (englishExists(data, english)) {
        return res.status(409).json({ error: `"${english}" already exists.` });
    }

    const catKey = category || UNCATEGORIZED_KEY;
    if (!data.categories[catKey]) {
        data.categories[catKey] = { description: "", words: [] };
    }
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

    let found = null;
    for (const [catName, catObj] of Object.entries(data.categories || {})) {
        const words = catObj?.words || [];
        for (let pos = 0; pos < words.length; pos++) {
            if (words[pos].english?.toLowerCase() === english) {
                found = { cat: catName, pos };
                break;
            }
        }
        if (found) break;
    }

    if (!found) found = locateWordByIndex(data, index);

    if (!found) return res.status(404).json({ error: "Word not found." });

    const oldEnglish = data.categories[found.cat].words[found.pos].english?.toLowerCase();
    if (english !== oldEnglish && englishExists(data, english, found.cat, found.pos)) {
        return res.status(409).json({ error: `"${english}" already exists.` });
    }

    const newCat = category || UNCATEGORIZED_KEY;

    data.categories[found.cat].words.splice(found.pos, 1);

    if (found.cat !== UNCATEGORIZED_KEY && data.categories[found.cat]?.words.length === 0) {
        delete data.categories[found.cat];
    }

    if (!data.categories[newCat]) {
        data.categories[newCat] = { description: "", words: [] };
    }

    const updatedWord = { english, persian, alternatives };
    data.categories[newCat].words.push(updatedWord);

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
    }

    res.json({ message: "Word updated.", word: { ...updatedWord, category } });
});

app.delete("/api/words/:index", async (req, res) => {
    const index = parseInt(req.params.index);
    const data = await loadData();
    const found = locateWordByIndex(data, index);

    if (!found) return res.status(404).json({ error: "Word not found." });

    const english = found.word.english;
    data.categories[found.cat].words.splice(found.pos, 1);

    if (found.cat !== UNCATEGORIZED_KEY && data.categories[found.cat]?.words.length === 0) {
        delete data.categories[found.cat];
    }

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
    }

    res.json({ message: `"${english}" deleted.` });
});

app.put("/api/aigen/:index", async (req, res) => {
    const index = parseInt(req.params.index);
    const data = await loadData();
    const found = locateWordByIndex(data, index);

    if (!found) return res.status(404).json({ error: "Word not found." });

    const { english, persian, alternatives } = found.word;
    const { is_edit, style, custom_style } = req.body || {};

    try {
        const [newEnglish, newPersian] = await generate_sentence(english, persian, { is_edit, style, custom_style });
        data.categories[found.cat].words[found.pos] = { english: newEnglish, persian: newPersian, alternatives };

        if (!(await saveData(data))) {
            return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
        }

        res.json({
            message: "Sentence generated.",
            word: { english: newEnglish, persian: newPersian, alternatives, category: found.cat === UNCATEGORIZED_KEY ? null : found.cat }
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

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
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

        const newWord = { english: eng, persian, alternatives: [] };
        data.categories[UNCATEGORIZED_KEY].words.push(newWord);
        existing.add(eng);
        added.push({ ...newWord });
    }

    if (added.length && !(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save batch to Cloudflare KV." });
    }

    res.json({ added, added_count: added.length, duplicates, errors, total: totalWords(data) });
});

app.post("/api/words/delete-multiple", async (req, res) => {
    const { indices } = req.body;
    if (!indices?.length || !Array.isArray(indices)) {
        return res.status(400).json({ error: "No indices provided." });
    }

    const data = await loadData();
    const indexMap = buildIndexMap(data);
    const maxIdx = indexMap.length - 1;

    for (const i of indices) {
        if (typeof i !== "number" || i < 0 || i > maxIdx) {
            return res.status(400).json({ error: `Invalid index: ${i}` });
        }
    }

    const byCat = {};
    for (const i of new Set(indices)) {
        const { cat, pos } = indexMap[i];
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(pos);
    }

    let deletedCount = 0;
    for (const [catName, positions] of Object.entries(byCat)) {
        const words = data.categories[catName].words;
        for (const pos of positions.sort((a, b) => b - a)) {
            words.splice(pos, 1);
            deletedCount++;
        }
    }

    for (const [k, v] of Object.entries(data.categories)) {
        if (k !== UNCATEGORIZED_KEY && v?.words?.length === 0) {
            delete data.categories[k];
        }
    }

    if (!(await saveData(data))) {
        return res.status(500).json({ error: "Failed to save changes to Cloudflare KV." });
    }

    res.json({ message: `${deletedCount} word(s) deleted.`, deleted_count: deletedCount, total: totalWords(data) });
});

app.post("/api/words/move-category", async (req, res) => {
    const { indices, category } = req.body;
    if (!indices?.length || !Array.isArray(indices)) {
        return res.status(400).json({ error: "No indices provided." });
    }

    let cat = category?.trim() || null;
    const newCat = cat || UNCATEGORIZED_KEY;

    const data = await loadData();
    const indexMap = buildIndexMap(data);
    const maxIdx = indexMap.length - 1;

    for (const i of indices) {
        if (typeof i !== "number" || i < 0 || i > maxIdx) {
            return res.status(400).json({ error: `Invalid index: ${i}` });
        }
    }

    if (!data.categories[newCat]) {
        data.categories[newCat] = { description: "", words: [] };
    }

    const byCat = {};
    const seen = new Set();
    for (const i of indices) {
        if (seen.has(i)) continue;
        seen.add(i);
        const { cat: catName, pos } = indexMap[i];
        if (!byCat[catName]) byCat[catName] = [];
        byCat[catName].push(pos);
    }

    let movedCount = 0;
    for (const [oldCat, positions] of Object.entries(byCat)) {
        const words = data.categories[oldCat].words;
        for (const pos of positions.sort((a, b) => b - a)) {
            const word = words.splice(pos, 1)[0];
            if (oldCat !== newCat) {
                data.categories[newCat].words.push(word);
                movedCount++;
            }
        }
    }

    for (const [k, v] of Object.entries(data.categories)) {
        if (k !== UNCATEGORIZED_KEY && v?.words?.length === 0) {
            delete data.categories[k];
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

app.post("/defs/:word", async (req, res) => {
    const word = req.params.word?.trim().toLowerCase();
    if (!word) return res.status(400).json({ error: "Word is required." });

    try {
        const definitions = await gen_definitions(word);
        res.json(definitions);
    } catch (e) {
        res.status(500).json({ error: e.message || "Failed to get definitions" });
    }
});

// ── Error handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something went wrong!");
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
