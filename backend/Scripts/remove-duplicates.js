/**
 * Remove duplicate words from Cloudflare KV.
 * A "duplicate" means two or more entries with EXACTLY the same english AND persian.
 *
 * Run: node Scripts/remove-duplicates.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const readline = require("readline");

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

function askConfirmation(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

function findDuplicates(data) {
    const duplicates = [];

    for (const [catName, catObj] of Object.entries(data.categories || {})) {
        const words = catObj?.words || [];
        const seen = new Map();

        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const key = `${w.english}|||${w.persian}`;

            if (seen.has(key)) {
                seen.get(key).push({ index: i, word: w });
            } else {
                seen.set(key, [{ index: i, word: w }]);
            }
        }

        for (const [, entries] of seen) {
            if (entries.length > 1) {
                duplicates.push({ category: catName, entries });
            }
        }
    }

    return duplicates;
}

async function main() {
    console.log("Loading data from Cloudflare KV...");
    const data = await loadKV();

    if (!data.categories) {
        console.log("No categories found. Aborting.");
        return;
    }

    const duplicates = findDuplicates(data);

    if (duplicates.length === 0) {
        console.log("\nNo duplicates found!");
        return;
    }

    let totalDuplicates = 0;
    console.log(`\nFound ${duplicates.length} duplicate group(s):\n`);

    for (const group of duplicates) {
        console.log(`Category: "${group.category}"`);
        for (const entry of group.entries) {
            totalDuplicates++;
            console.log(`  [${entry.word.index}] EN: "${entry.word.english}"`);
            console.log(`       FA: "${entry.word.persian}"`);
        }
        console.log();
    }

    console.log(`Total duplicate entries to remove: ${totalDuplicates}`);
    console.log(`Total words before: ${data.wordcount}`);

    const answer = await askConfirmation("\nDo you want to remove these duplicates? (y/n): ");

    if (answer !== "y" && answer !== "yes") {
        console.log("Aborted. No changes made.");
        return;
    }

    let removedCount = 0;

    for (const [catName, catObj] of Object.entries(data.categories)) {
        const words = catObj?.words || [];
        const seen = new Map();
        const filtered = [];

        for (const w of words) {
            const key = `${w.english}|||${w.persian}`;
            if (!seen.has(key)) {
                seen.set(key, true);
                filtered.push(w);
            } else {
                removedCount++;
            }
        }

        catObj.words = filtered;
    }

    let index = 0;
    for (const [, catObj] of Object.entries(data.categories)) {
        for (const w of catObj.words) {
            w.index = index;
            index++;
        }
    }
    data.wordcount = index;

    console.log(`\nRemoved ${removedCount} duplicate(s).`);
    console.log(`Total words after: ${data.wordcount}`);

    const confirmSave = await askConfirmation("Save to Cloudflare KV? (y/n): ");
    if (confirmSave !== "y" && confirmSave !== "yes") {
        console.log("Aborted. No changes saved.");
        return;
    }

    console.log("Saving updated data to Cloudflare KV...");
    await saveKV(data);
    console.log("Done!");
}

main().catch(e => {
    console.error("Failed:", e.message);
    process.exit(1);
});
