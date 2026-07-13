// ── State ─────────────────────────────────────────────────────
let apiUrl = "";

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get(["apiUrl"]);
  apiUrl = stored.apiUrl || "";
  document.getElementById("api-url").value = apiUrl;
  loadCategories();
});

// ── Settings toggle ───────────────────────────────────────────
document.getElementById("settings-toggle").addEventListener("click", () => {
  const bar = document.getElementById("settings-bar");
  bar.style.display = bar.style.display === "none" ? "flex" : "none";
});

// ── Settings save ─────────────────────────────────────────────
document.getElementById("save-settings").addEventListener("click", async () => {
  const url = document.getElementById("api-url").value.trim().replace(/\/+$/, "");
  if (!url) { showMsg("Please enter an API URL.", "error"); return; }

  const btn = document.getElementById("save-settings");
  btn.disabled = true;
  btn.textContent = "Testing…";
  showMsg("Testing API connection…", "info");

  try {
    const res = await fetch(`${url}/api/categories`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (!data.categories && !Array.isArray(data.categories)) throw new Error("Invalid response");

    apiUrl = url;
    await chrome.storage.local.set({ apiUrl });
    document.getElementById("settings-bar").style.display = "none";
    showMsg("API connected! Categories loaded.", "success");
    loadCategories();
  } catch (e) {
    showMsg("Cannot reach API: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
});

// ── Advanced toggle ───────────────────────────────────────────
document.getElementById("advanced-toggle").addEventListener("click", () => {
  const section = document.getElementById("advanced-section");
  const arrow = document.getElementById("advanced-arrow");
  section.classList.toggle("open");
  arrow.classList.toggle("open");
});

// ── Writing style toggle ──────────────────────────────────────
document.getElementById("add-style-toggle").addEventListener("change", (e) => {
  document.getElementById("style-options").classList.toggle("visible", e.target.checked);
});

// ── Load categories ───────────────────────────────────────────
async function loadCategories() {
  if (!apiUrl) return;
  const sel = document.getElementById("add-category");
  try {
    const res = await fetch(`${apiUrl}/api/categories`);
    const data = await res.json();
    sel.innerHTML = '<option value="">No Category</option>';
    (data.categories || []).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  } catch (e) {
    sel.innerHTML = '<option value="">No Category</option>';
  }
}

// ── Add word ──────────────────────────────────────────────────
document.getElementById("add-btn").addEventListener("click", async () => {
  const en = document.getElementById("add-en").value.trim();
  const fa = document.getElementById("add-fa").value.trim();
  const aigen = document.getElementById("add-aigen").checked;
  const alts = document.getElementById("add-alts").value.trim();
  const styleEnabled = document.getElementById("add-style-toggle").checked;
  const style = styleEnabled ? document.getElementById("add-style").value : "";
  const customStyle = styleEnabled ? document.getElementById("add-style-custom").value.trim() : "";
  const category = document.getElementById("add-category").value || null;

  if (!en) { showMsg("English field is required.", "error"); return; }
  if (!aigen && !fa) { showMsg("Persian field is required.", "error"); return; }
  if (!apiUrl) { showMsg("Please save your API URL first.", "error"); return; }

  const btn = document.getElementById("add-btn");
  btn.disabled = true;
  btn.textContent = aigen ? "Generating…" : "Adding…";
  showMsg(aigen ? "AI generating sentence…" : "Adding word…", "info");

  const body = {
    english: en,
    persian: fa || "",
    aigen,
    category,
    alternatives: alts ? alts.split("\n").map(s => s.trim()).filter(Boolean) : [],
    style: aigen ? style : "",
    custom_style: aigen ? customStyle : ""
  };

  try {
    const res = await fetch(`${apiUrl}/api/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      showMsg(data.error || "Failed to add word.", "error");
      return;
    }

    const w = data.word;
    showMsg(
      `Added: ${w.english}${w.category ? "\nCategory: " + w.category : ""}`,
      "success"
    );
    // Clear inputs
    document.getElementById("add-en").value = "";
    document.getElementById("add-fa").value = "";
    document.getElementById("add-alts").value = "";
  } catch (e) {
    showMsg("Network error: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Add";
  }
});

// ── Message box ───────────────────────────────────────────────
function showMsg(text, type) {
  const box = document.getElementById("msg-box");
  box.textContent = text;
  box.className = "msg-box show msg-" + type;
  setTimeout(() => { box.className = "msg-box"; }, 10000);
}