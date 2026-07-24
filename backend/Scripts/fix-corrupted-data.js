#!/usr/bin/env node

/**
 * Script to fix corrupted data in Cloudflare KV
 * Removes words that are missing required properties (english, persian)
 */

require("dotenv").config();

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAMESPACE_ID = process.env.CLOUDFLARE_NAMESPACE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;
const DATA_KEY = "vocabulary";

async function loadKV(key) {
    const res = await fetch(`${BASE_URL}/values/${key}`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KV load error: ${res.status}`);
    const raw = await res.json();
    return typeof raw.value === "string" ? JSON.parse(raw.value) : raw;
}

async function saveKV(key, value) {
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

async function fixCorruptedData() {
    console.log("Loading data from Cloudflare KV...");
    const data = await loadKV(DATA_KEY);

    if (!data || !data.categories) {
        console.log("No data found or invalid format.");
        return;
    }

    let totalRemoved = 0;
    let totalFixed = 0;
    const issues = [];

    // Check each category and word
    for (const [catName, catObj] of Object.entries(data.categories)) {
        if (!catObj?.words) continue;

        const originalLength = catObj.words.length;

        // Filter out words with missing english property
        catObj.words = catObj.words.filter(word => {
            if (!word.english) {
                issues.push({
                    category: catName,
                    index: word.index,
                    issue: "Missing 'english' property",
                    word: word
                });
                totalRemoved++;
                return false;
            }
            if (!word.persian) {
                // Fix: set persian to empty string if missing
                word.persian = '';
                totalFixed++;
                issues.push({
                    category: catName,
                    index: word.index,
                    issue: "Missing 'persian' property (fixed)",
                    word: word
                });
            }
            if (word.index === undefined) {
                // Fix: set index if missing
                word.index = data.wordcount || 0;
                data.wordcount = (data.wordcount || 0) + 1;
                totalFixed++;
                issues.push({
                    category: catName,
                    issue: "Missing 'index' property (fixed)",
                    word: word
                });
            }
            return true;
        });

        if (catObj.words.length !== originalLength) {
            console.log(`Category "${catName}": removed ${originalLength - catObj.words.length} corrupted word(s)`);
        }
    }

    // Check for duplicate indices
    const indexMap = new Map();
    for (const [catName, catObj] of Object.entries(data.categories)) {
        if (!catObj?.words) continue;
        for (const word of catObj.words) {
            if (word.index !== undefined) {
                if (indexMap.has(word.index)) {
                    issues.push({
                        category: catName,
                        index: word.index,
                        issue: `Duplicate index (also in ${indexMap.get(word.index)})`,
                        word: word
                    });
                } else {
                    indexMap.set(word.index, catName);
                }
            }
        }
    }

    // Save the fixed data
    if (totalRemoved > 0 || totalFixed > 0) {
        console.log("\nSaving fixed data...");
        const saved = await saveKV(DATA_KEY, data);
        if (saved) {
            console.log("Data saved successfully!");
        } else {
            console.error("Failed to save data!");
            return;
        }
    }

    // Print summary
    console.log("\n=== Summary ===");
    console.log(`Removed: ${totalRemoved} corrupted word(s)`);
    console.log(`Fixed: ${totalFixed} word(s)`);

    if (issues.length > 0) {
        console.log("\n=== Issues Found ===");
        for (const issue of issues) {
            console.log(`\nCategory: ${issue.category}`);
            console.log(`Index: ${issue.index || 'N/A'}`);
            console.log(`Issue: ${issue.issue}`);
            if (issue.word) {
                console.log(`Word data: ${JSON.stringify(issue.word, null, 2)}`);
            }
        }
    } else {
        console.log("\nNo issues found!");
    }
}

fixCorruptedData().catch(console.error);
