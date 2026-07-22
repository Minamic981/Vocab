/**
 * Test script: Test all word API endpoints
 *
 * Run: node Scripts/test-api.js
 *
 * Make sure server is running first: node app.js
 */
const BASE = "http://localhost:3000";

async function test(name, fn) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TEST: ${name}`);
    console.log("=".repeat(60));
    try {
        const result = await fn();
        console.log("Response:", JSON.stringify(result, null, 2));
        return result;
    } catch (e) {
        console.log("Error:", e.message);
        return null;
    }
}

async function getWords() {
    const res = await fetch(`${BASE}/api/words`);
    return res.json();
}

async function addWord(english, persian, category = null) {
    const res = await fetch(`${BASE}/api/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ english, persian, category })
    });
    return res.json();
}

async function updateWord(index, english, persian, category = null) {
    const res = await fetch(`${BASE}/api/words/${index}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ english, persian, category })
    });
    return res.json();
}

async function deleteWord(index) {
    const res = await fetch(`${BASE}/api/words/${index}`, { method: "DELETE" });
    return res.json();
}

async function batchImport(text) {
    const res = await fetch(`${BASE}/api/words/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    });
    return res.json();
}

async function deleteMultiple(indices) {
    const res = await fetch(`${BASE}/api/words/delete-multiple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indices })
    });
    return res.json();
}

async function moveCategory(indices, category) {
    const res = await fetch(`${BASE}/api/words/move-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indices, category })
    });
    return res.json();
}

async function getCategories() {
    const res = await fetch(`${BASE}/api/categories`);
    return res.json();
}

async function addCategory(name, description) {
    const res = await fetch(`${BASE}/api/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description })
    });
    return res.json();
}

async function deleteCategory(name) {
    const res = await fetch(`${BASE}/api/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
    return res.json();
}

async function main() {
    console.log("Testing API endpoints...");
    console.log("Server:", BASE);

    // 1. GET words (initial state)
    const initial = await test("GET /api/words - Initial state", getWords);
    const initialWordcount = initial?.wordcount || 0;
    console.log(`Initial wordcount: ${initialWordcount}`);

    // 2. ADD word
    const added1 = await test("POST /api/words - Add word", () =>
        addWord("test_word_1", "تست۱", null)
    );

    // 3. GET words (after add)
    await test("GET /api/words - After add", getWords);

    // 4. ADD word to category
    const added2 = await test("POST /api/words - Add word to category", () =>
        addWord("test_word_2", "تست۲", "TestCat")
    );

    // 5. UPDATE word
    if (added1?.word?.index !== undefined) {
        await test(`PUT /api/words/${added1.word.index} - Update word`, () =>
            updateWord(added1.word.index, "test_word_1_updated", "تست۱ بروزرسانی شده", null)
        );
    }

    // 6. GET words (after update)
    await test("GET /api/words - After update", getWords);

    // 7. BATCH import
    await test("POST /api/words/batch - Batch import", () =>
        batchImport("batch_word_1=批次۱\nbatch_word_2=批次۲\nbatch_word_3=批次۳")
    );

    // 8. GET words (after batch)
    const afterBatch = await test("GET /api/words - After batch", getWords);

    // 9. DELETE word
    if (added1?.word?.index !== undefined) {
        await test(`DELETE /api/words/${added1.word.index} - Delete word`, () =>
            deleteWord(added1.word.index)
        );
    }

    // 10. GET categories
    await test("GET /api/categories", getCategories);

    // 11. ADD category
    await test("POST /api/categories - Add category", () =>
        addCategory("TestCat2", "Test category 2")
    );

    // 12. MOVE words to category
    if (afterBatch?.wordcount > initialWordcount) {
        const indices = [];
        for (let i = initialWordcount; i < afterBatch.wordcount; i++) {
            indices.push(i);
        }
        await test("POST /api/words/move-category - Move words", () =>
            moveCategory(indices, "TestCat2")
        );
    }

    // 13. GET words (after move)
    await test("GET /api/words - After move", getWords);

    // 14. DELETE multiple
    if (afterBatch?.wordcount > initialWordcount) {
        const indices = [];
        for (let i = initialWordcount; i < afterBatch.wordcount; i++) {
            indices.push(i);
        }
        await test("POST /api/words/delete-multiple - Delete multiple", () =>
            deleteMultiple(indices)
        );
    }

    // 15. GET words (after delete multiple)
    await test("GET /api/words - After delete multiple", getWords);

    // 16. DELETE category
    await test("DELETE /api/categories/TestCat2 - Delete category", () =>
        deleteCategory("TestCat2")
    );

    // 17. Final state
    await test("GET /api/words - Final state", getWords);

    console.log("\n" + "=".repeat(60));
    console.log("ALL TESTS COMPLETED");
    console.log("=".repeat(60));
}

main().catch(e => {
    console.error("Test failed:", e.message);
    process.exit(1);
});
