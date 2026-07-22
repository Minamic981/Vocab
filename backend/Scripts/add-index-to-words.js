/**
 * Migration script: Add index + isBookmarked to all words, add wordcount to top level.
 *
 * Run: node Scripts/add-index-to-words.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAMESPACE_ID = process.env.CLOUDFLARE_NAMESPACE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;
const DATA_KEY = "vocabulary";

async function loadKV() {
    const res = await fetch(`${BASE_URL}/values/${DATA_KEY}`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` }
    });
    if (!res.ok) throw new Error(`KV load failed: ${res.status}`);
    const raw = await res.json();
    return typeof raw.value === "string" ? JSON.parse(raw.value) : raw;
}

async function saveKV(data) {
    const res = await fetch(`${BASE_URL}/values/${DATA_KEY}`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`KV save failed: ${res.status}`);
    return true;
}

async function main() {
    console.log("Loading data from Cloudflare KV...");
    const data = await loadKV();

    if (!data.categories) {
        console.log("No categories found. Aborting.");
        return;
    }

    let index = 0;

    for (const [catName, catObj] of Object.entries(data.categories)) {
        const words = catObj?.words || [];
        for (const word of words) {
            if (word.index === undefined || word.index === null)
                word.index = index;
            word.isBookmarked = false;
            index++;
        }
    }

    data.wordcount = index;

    console.log(`Total words: ${index}`);
    console.log("Saving updated data to Cloudflare KV...");
    await saveKV(data);
    console.log("Done.");
}

main().catch(e => {
    console.error("Migration failed:", e.message);
    process.exit(1);
});
