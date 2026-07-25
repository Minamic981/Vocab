// ── OpenRouter Config ────────────────────────────────────────────────────────
const MODEL_NAME = process.env.MODEL_NAME
const OPENROUTER_URL = process.env.OPENROUTER_URL
const OPEN_TOKEN = process.env.OPEN_TOKEN

// ── System Prompts ───────────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
    EN_WITH_PERSIAN: `
You are a vocabulary assistant. The user gives an English word/phrase AND its exact Persian meaning. 
Write ONE natural, clear, and fluent English example sentence that uses the **exact given word**.

Rules:
- You MUST use the exact English word provided by the user. Do NOT replace it with synonyms.
- Use the Persian meaning as the only correct sense.
- Keep the sentence realistic and engaging.
- Sentence length: 12–20 words.
- The sentence MUST be unambiguous. Avoid vague time references like 'later' or 'then'.
- The Persian output must be accurate and idiomatic.

IMPORTANT: Example sentences MUST be:
- Unambiguous: the meaning should be obvious from the context
- Natural: sound like something a native speaker would say
- Varied: each sentence should be different in structure and context

Respond ONLY in this exact JSON format:
{"english":"...", "persian":"..."}
    `,

    EN_WORD: `
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
    `,

    FA_WORD: `
You are a vocabulary assistant. The user gives a Persian word. Find its most common English equivalent 
and write ONE natural English sentence using that exact English word.

Rules:
- Use the exact English translation. Do not replace it with synonyms.
- Keep the sentence realistic.
- Sentence length: 12–20 words.
- The sentence must clearly convey the meaning without ambiguity.
- Avoid unclear time references like 'later' or 'then'.
- Persian output must be a natural translation.

IMPORTANT: Example sentences MUST be:
- Unambiguous: the meaning should be obvious from the context
- Natural: sound like something a native speaker would say
- Varied: each sentence should be different in structure and context

Respond ONLY in this exact JSON format:
{"english":"...", "persian":"..."}
    `,

    EDIT: `
You are a vocabulary assistant. Create a NEW English sentence with the same meaning and same key word.

Rules:
- Keep the exact key word.
- The new sentence MUST be significantly different from the original:
  * Change the subject, object, or context completely
  * Change the sentence structure (e.g., active to passive, different clause order)
  * Use different supporting words around the key word
  * Do NOT just change one word or one letter
- Make it realistic.
- Sentence length: 12–20 words.
- The meaning must remain clear.
- Persian must be a natural translation.

IMPORTANT: Example sentences MUST be:
- Unambiguous: the meaning should be obvious from the context
- Natural: sound like something a native speaker would say
- Varied: each sentence should be different in structure and context

Respond ONLY in this exact JSON format:
{"english":"...", "persian":"..."}
    `
};

function getSystemPrompt(style, custom_style) {
    if (custom_style) return custom_style;
    const promptKey = style?.toUpperCase().replace(/-/g, '_');
    return SYSTEM_PROMPTS[promptKey] || SYSTEM_PROMPTS.EN_WORD;
}

async function generate_sentence(english, persian, { is_edit = false, style = '', custom_style = '' } = {}) {
    let promptKey;
    if (is_edit) {
        promptKey = 'EDIT';
    } else if (english && persian) {
        promptKey = 'EN_WITH_PERSIAN';
    } else if (english) {
        promptKey = 'EN_WORD';
    } else if (persian) {
        promptKey = 'FA_WORD';
    } else {
        throw new Error('Provide at least an English or Persian word.');
    }

    const userContent = is_edit
        ? `Word: "${english}" | Meaning: "${persian}"`
        : english && persian
            ? `English: "${english}" | Persian: "${persian}"`
            : english || persian;

    const payload = {
        model: MODEL_NAME,
        messages: [
            { role: 'system', content: getSystemPrompt(promptKey, custom_style) },
            { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 350,
    };

    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPEN_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Title': 'Vocab Site',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    let raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("AI returned empty response");
    raw = raw.trim().replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(raw);

    return [result.english, result.persian];
}

async function gen_definitions(word) {
    const prompt = `
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

    const payload = {
        model: MODEL_NAME,
        messages: [
            {
                role: "system",
                content: `
                    You are a precise bilingual English–Persian dictionary assistant.
                    Your task is to return only real, distinct meanings of a word.
                    Never duplicate meanings or create artificial ones just to reach a number.
                    - If the word has only 2-3 real meanings, return exactly those.
                    - If it has many (e.g. 'run', 'bank', 'light'), return up to 5 of the most useful/common ones.
                    - All example sentences must be natural, creative, unambiguous, and clearly demonstrate the meaning.
                    - Avoid sentences with ambiguous time references (like 'later', 'then') unless the context is crystal clear.
                    - Persian translations must be idiomatic, natural, and fluent.
                    Return clean JSON only. No extra text.
                    `
            },
            { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
        top_p: 0.9
    };

    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPEN_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Title': 'Vocab Site',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    let raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("AI returned empty response");
    raw = raw.trim().replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(raw);
    return result;
}

module.exports = { generate_sentence, gen_definitions };
