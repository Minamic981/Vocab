import sqlite3
import json
from datetime import datetime

DB = "C:/Users/S H S Y S/.local/share/mimocode/mimocode.db"
CURRENT_PROJECT = "c8391b7f-1d76-4642-87ef-1645cc7fb950"

# Older project IDs for the same Vocab directory
OLDER_PROJECTS = ["4b3ef9be-2bb3-45df-96ce-99be62b2235d", "323f9c17-651c-4344-92cb-5df0bb475709", "dc9e07eb-6ee8-4160-94b7-106d5a049f7e"]

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# All Vocab sessions (both current and older project IDs), excluding checkpoint writers
all_pids = [CURRENT_PROJECT] + OLDER_PROJECTS
placeholders = ",".join(["?"] * len(all_pids))
c.execute(f"""
    SELECT id, title, time_created, project_id
    FROM session
    WHERE project_id IN ({placeholders})
      AND title NOT LIKE 'checkpoint-writer:%'
    ORDER BY time_created DESC
""", all_pids)
sessions = c.fetchall()

print("=== ALL VOCAB SESSIONS ===")
for s in sessions:
    ts = datetime.fromtimestamp(s["time_created"]/1000).strftime("%Y-%m-%d %H:%M")
    tag = "CURRENT" if s["project_id"] == CURRENT_PROJECT else "OLDER"
    print(f"  [{tag}] {s['id']} | {ts} | {s['title']}")

# For each substantive session, pull user messages containing decision/rule keywords
for s in sessions:
    sid = s["id"]
    print(f"\n=== USER MESSAGES in {sid} ({s['title'][:50]}) ===")
    c.execute("""
        SELECT m.id, p.data as pdata
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'user'
        ORDER BY m.time_created
    """, (sid,))
    for row in c.fetchall():
        pd = json.loads(row["pdata"])
        if pd.get("type") == "text":
            text = pd.get("text", "")
            # Show full user messages (they are short instructions usually)
            print(f"  --- user msg ---")
            print(f"  {text[:500]}")

conn.close()
