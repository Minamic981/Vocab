#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DEFAULT_MODEL_NAME = "google/gemini-2.5-flash-lite";
const OPENROUTER_URL = process.env.OPENROUTER_URL;
const OPEN_TOKEN = process.env.OPEN_TOKEN;

// ---------------------------------------------------------------------------
// Prompt library — add new prompt modes here.
// Each entry needs: label, system, buildUser(word)
// ---------------------------------------------------------------------------
const PROMPTS = {
    sentence: {
        label: "Single example sentence for a word",
        system: `
You are a vocabulary assistant. The user gives a single English word.
Write ONE natural and clear English example sentence using that exact word.

Rules:
- Use the exact word given. Do NOT replace it with synonyms.
- Use the most common meaning.
- Keep sentences realistic and engaging.
- Sentence length: 12-20 words.
- The sentence MUST clearly demonstrate the meaning. Avoid ambiguity.
- Avoid vague time references like 'later' or 'then'.
- Provide a natural Persian translation that is idiomatic and fluent.

Respond ONLY in this exact JSON format:
{"english":"...", "persian":"..."}
`.trim(),
        buildUser: (word) => `Give me an example sentence for the word "${word}".`,
    },

    definitions: {
        label: "All distinct meanings of a word",
        system: `
You are a precise bilingual English-Persian dictionary assistant.
Your task is to return only real, distinct meanings of a word.
Never duplicate meanings or create artificial ones just to reach a number.
- If the word has only 2-3 real meanings, return exactly those.
- If it has many (e.g. 'run', 'bank', 'light'), return up to 5 of the most useful/common ones.
- All example sentences must be natural, creative, unambiguous, and clearly demonstrate the meaning.
- Avoid sentences with ambiguous time references (like 'later', 'then') unless the context is crystal clear.
- Persian translations must be idiomatic, natural, and fluent.
Return clean JSON only. No extra text.
`.trim(),
        buildUser: (word) => `
Give me all distinct meanings of the English word "${word}".
Limit to maximum 10 meanings. If the word has fewer real distinct meanings, return only those.
Do NOT invent, repeat, or stretch meanings. Only include genuinely different senses
(different part of speech or clearly different usage).
For each meaning provide:
- A short, clear, and unambiguous English example sentence (12-20 words)
- Its natural Persian translation
IMPORTANT: Example sentences MUST be:
- Unambiguous: the meaning should be obvious from the context
- Natural: sound like something a native speaker would say
- Varied: each sentence should be different in structure and context
Respond ONLY with valid JSON in this exact format — no extra text, no markdown, no explanation:
{
"main_word": "${word}",
"definitions": [
{
"english": "<clear and unambiguous example sentence>",
"persian": "<natural Persian translation>"
}]}
`.trim(),
    },

    translate: {
        label: "Translate English text to Persian",
        system: `
You are a professional English-to-Persian translator.
Translate the given English text into natural, fluent, idiomatic Persian.

Rules:
- Preserve the original meaning and tone exactly.
- Do NOT translate word-for-word if it sounds unnatural — prefer idiomatic phrasing.
- Keep proper nouns, numbers, and technical terms accurate.
- Do not add explanations, notes, or extra content.

Respond ONLY in this exact JSON format:
{"english":"...", "persian":"..."}
`.trim(),
        buildUser: (word) => `Translate the following English text to Persian:\n"${word}"`,
    },
};

// ---------------------------------------------------------------------------
// Small CLI select helper (no extra dependencies)
// ---------------------------------------------------------------------------
function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
    }));
}

async function selectPrompt() {
    const keys = Object.keys(PROMPTS);
    console.log("Select a prompt to test:");
    keys.forEach((key, i) => {
        console.log(`  ${i + 1}) ${key} — ${PROMPTS[key].label}`);
    });
    const answer = await ask(`Enter a number (1-${keys.length}) [default: 1]: `);
    const index = answer === "" ? 0 : parseInt(answer, 10) - 1;
    const key = keys[index];
    if (!key) {
        console.log("Invalid choice, falling back to the first prompt.");
        return keys[0];
    }
    return key;
}

function slugifyModelName(name) {
    return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function stripCodeFences(text) {
    return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log("Config:");
    console.log("  Default model:", DEFAULT_MODEL_NAME);
    console.log("  URL:", OPENROUTER_URL);
    console.log("  Token:", OPEN_TOKEN ? OPEN_TOKEN.slice(0, 10) + "..." : "MISSING");
    console.log("");

    if (!OPENROUTER_URL || !OPEN_TOKEN) {
        console.error("Missing OPENROUTER_URL or OPEN_TOKEN in .env — aborting.");
        process.exitCode = 1;
        return;
    }

    const promptKey = await selectPrompt();
    const prompt = PROMPTS[promptKey];

    const modelAnswer = await ask(`Model name [default: "${DEFAULT_MODEL_NAME}"]: `);
    const MODEL_NAME = modelAnswer || DEFAULT_MODEL_NAME;

    const wordAnswer = await ask('Word/text to test [default: "light"]: ');
    const word = wordAnswer || "light";

    console.log(`\nUsing model "${MODEL_NAME}" and prompt "${promptKey}" for word "${word}"...`);
    console.log("Sending request...");
    const start = Date.now();

    let response;
    try {
        response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPEN_TOKEN}`,
                "Content-Type": "application/json",
                "X-Title": "Vocab Test",
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: "system", content: prompt.system },
                    { role: "user", content: prompt.buildUser(word) },
                ],
                temperature: 0.3,
                max_tokens: 800,
                top_p: 0.9,
                reasoning_effort: "none",
            }),
        });
    } catch (err) {
        console.error("Request failed:", err.message);
        process.exitCode = 1;
        return;
    }

    const elapsed = Date.now() - start;
    console.log(`Response status: ${response.status} (${elapsed}ms)`);

    const data = await response.json();

    if (!response.ok) {
        console.error("API error:", JSON.stringify(data, null, 2));
        process.exitCode = 1;
        return;
    }

    const rawContent = data?.choices?.[0]?.message?.content ?? "";
    let parsedContent = null;
    try {
        parsedContent = JSON.parse(stripCodeFences(rawContent));
    } catch (err) {
        console.warn("Warning: model output was not valid JSON, saving raw text instead.");
    }

    const outputPayload = {
        model: MODEL_NAME,
        prompt_used: promptKey,
        word,
        elapsed_ms: elapsed,
        status: response.status,
        result: parsedContent !== null ? parsedContent : rawContent,
        raw_response: data,
    };

    const modelSlug = slugifyModelName(MODEL_NAME);
    const outFile = path.join(__dirname, `${promptKey}-${modelSlug}.json`);
    fs.writeFileSync(outFile, JSON.stringify(outputPayload, null, 2), "utf-8");

    console.log(`\nSaved formatted output to: ${outFile}`);
}

main().catch((e) => console.error("Error:", e.message));