#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const MODEL_NAME = "deepseek/deepseek-v4-flash";
const OPENROUTER_URL = process.env.OPENROUTER_URL;
const OPEN_TOKEN = process.env.OPEN_TOKEN;

console.log("Config:");
console.log("  Model:", MODEL_NAME);
console.log("  URL:", OPENROUTER_URL);
console.log("  Token:", OPEN_TOKEN ? OPEN_TOKEN.slice(0, 10) + "..." : "MISSING");
console.log("");

SYSTEM_PROMPT = `
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

IMPORTANT: Example sentences MUST be:
- Unambiguous: the meaning should be obvious from the context
- Natural: sound like something a native speaker would say
- Varied: each sentence should be different in structure and context

Respond ONLY in this exact JSON format:
{"english":"...", "persian":"..."}
`

const word = "light"
const def_sys_prompt = `
You are a precise bilingual English-Persian dictionary assistant.
Your task is to return only real, distinct meanings of a word.
Never duplicate meanings or create artificial ones just to reach a number.
- If the word has only 2-3 real meanings, return exactly those.
- If it has many (e.g. 'run', 'bank', 'light'), return up to 5 of the most useful/common ones.
- All example sentences must be natural, creative, unambiguous, and clearly demonstrate the meaning.
- Avoid sentences with ambiguous time references (like 'later', 'then') unless the context is crystal clear.
- Persian translations must be idiomatic, natural, and fluent.
Return clean JSON only. No extra text.
`

const def_usr_prompt = `
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
`

async function test() {
    console.log("Sending request...");
    const start = Date.now();

    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPEN_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Title': 'Vocab Test',
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            messages: [
                {
                    role: 'system',
                    content: def_sys_prompt
                },
                {
                    role: 'user',
                    content: def_usr_prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 800,
            top_p: 0.9,
            reasoning_effort: 'none',
        }),
    });

    const elapsed = Date.now() - start;
    console.log(`Response status: ${response.status} (${elapsed}ms)`);

    const data = await response.json();
    console.log("Full response:", JSON.stringify(data, null, 2));
}

test().catch(e => console.error("Error:", e.message));