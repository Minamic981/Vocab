#!/usr/bin/env node
/**
 * Status check script: Show category word counts + test Cloudflare KV + OpenRouter
 *
 * Run: node Scripts/status-check.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAMESPACE_ID = process.env.CLOUDFLARE_NAMESPACE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;
const DATA_KEY = "vocabulary";

const OPENROUTER_URL = process.env.OPENROUTER_URL;
const OPEN_TOKEN = process.env.OPEN_TOKEN;
const MODEL_NAME = process.env.MODEL_NAME || "google/gemini-2.5-flash-lite";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pass(msg) { return `  [OK] ${msg}`; }
function fail(msg) { return `  [FAIL] ${msg}`; }
function separator() { console.log("-".repeat(55)); }

// ── Cloudflare KV check ──────────────────────────────────────────────────────

async function checkCloudflareKV() {
    console.log("\nCloudflare KV");

    if (!ACCOUNT_ID || !NAMESPACE_ID || !API_TOKEN) {
        console.log(fail("Missing ACCOUNT_ID, NAMESPACE_ID, or API_TOKEN in .env"));
        return null;
    }

    const url = `${BASE_URL}/values/${DATA_KEY}`;
    const start = Date.now();

    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${API_TOKEN}` },
        });

        const elapsed = Date.now() - start;
        console.log(pass(`Connect (${res.status}, ${elapsed}ms)`));

        if (res.status === 404) {
            console.log("  → No data yet (empty vocab).");
            return [];
        }

        if (!res.ok) {
            console.log(fail(`KV response: ${res.status} ${res.statusText}`));
            return null;
        }

        const raw = await res.json();
        const data = typeof raw.value === "string" ? JSON.parse(raw.value) : raw;

        console.log(`  → Total wordcount: ${data.wordcount ?? 0}`);

        const categories = data.categories || {};
        const entries = Object.entries(categories)
            .map(([name, obj]) => ({
                name: name === "uncategorized" ? "uncategorized (no category)" : name,
                count: (obj?.words || []).length,
            }))
            .sort((a, b) => b.count - a.count);

        return entries;
    } catch (e) {
        const elapsed = Date.now() - start;
        console.log(fail(`Request failed after ${elapsed}ms: ${e.message}`));
        return null;
    }
}

// ── OpenRouter check ─────────────────────────────────────────────────────────

async function checkOpenRouter() {
    console.log("\nOpenRouter AI");

    if (!OPENROUTER_URL || !OPEN_TOKEN) {
        console.log(fail("Missing OPENROUTER_URL or OPEN_TOKEN in .env"));
        return false;
    }

    const start = Date.now();

    try {
        const res = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPEN_TOKEN}`,
                "Content-Type": "application/json",
                "X-Title": "Vocab Status Check",
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: "user", content: "Reply with exactly one word: ok" },
                ],
                max_tokens: 10,
                temperature: 0,
            }),
        });

        const elapsed = Date.now() - start;

        if (!res.ok) {
            const body = await res.text();
            console.log(fail(`API returned ${res.status} (${elapsed}ms): ${body.slice(0, 200)}`));
            return false;
        }

        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content || "(empty)";
        console.log(pass(`Connect (${res.status}, ${elapsed}ms)`));
        console.log(`  → Model: ${MODEL_NAME}`);
        console.log(`  → Reply: ${reply.trim()}`);

        const rateLimit = res.headers.get("x-ratelimit-remaining");
        if (rateLimit !== null) {
            console.log(`  → Rate limit remaining: ${rateLimit}`);
        }

        return true;
    } catch (e) {
        const elapsed = Date.now() - start;
        console.log(fail(`Request failed after ${elapsed}ms: ${e.message}`));
        return false;
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("=".repeat(55));
    console.log("  VOCAB STATUS CHECK");
    console.log("=".repeat(55));

    // 1) Cloudflare KV
    separator();
    const categories = await checkCloudflareKV();

    if (categories && categories.length > 0) {
        console.log("\n  Categories (word count descending):");
        for (const cat of categories) {
            const padded = cat.name.padEnd(35);
            console.log(`    ${padded} ${cat.count}`);
        }
    } else if (categories && categories.length === 0) {
        console.log("\n  No categories found (empty vocab).");
    }

    // 2) OpenRouter
    separator();
    const aiOk = await checkOpenRouter();

    // ── Summary ──
    separator();
    console.log("\n  SUMMARY");
    const kvOk = categories !== null;
    console.log(`    Cloudflare KV:   ${kvOk ? "OK" : "FAIL"}`);
    console.log(`    OpenRouter AI:   ${aiOk ? "OK" : "FAIL"}`);
    console.log("");

    process.exitCode = kvOk && aiOk ? 0 : 1;
}

main().catch((e) => {
    console.error("Script failed:", e.message);
    process.exit(1);
});