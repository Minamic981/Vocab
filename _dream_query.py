import sqlite3
import json
from datetime import datetime

DB = "C:/Users/S H S Y S/.local/share/mimocode/mimocode.db"
PROJECT_ID = "c8391b7f-1d76-4642-87ef-1645cc7fb950"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# 1. List tables
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print("=== TABLES ===")
print(tables)

# 2. Recent sessions for this project (non-checkpoint-writer)
c.execute("SELECT id, title, time_created FROM session WHERE project_id=? AND title NOT LIKE 'checkpoint-writer:%' ORDER BY time_created DESC", (PROJECT_ID,))
sessions = c.fetchall()
print("\n=== RECENT SESSIONS (project c8391b7f) ===")
for s in sessions:
    ts = datetime.fromtimestamp(s['time_created']/1000).strftime('%Y-%m-%d %H:%M')
    print(f"  {s['id']} | {ts} | {s['title']}")

# 3. For the most recent substantive session, get user messages (for rules/decisions)
if sessions:
    sid = sessions[0]['id']
    print(f"\n=== USER MESSAGES in {sid} ===")
    c.execute("""
        SELECT m.id, json_extract(m.data, '$.role') as role, p.data as pdata
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'user'
        ORDER BY m.time_created
    """, (sid,))
    for row in c.fetchall():
        pd = json.loads(row['pdata'])
        if pd.get('type') == 'text':
            text = pd.get('text', '')[:300]
            print(f"  [msg {row['id'][:20]}] {text}")

# 4. Check if there's a newer session (Auto Dream - the current one)
c.execute("SELECT id, title, time_created FROM session WHERE project_id=? AND title NOT LIKE 'checkpoint-writer:%' ORDER BY time_created DESC", (PROJECT_ID,))
all_sessions = c.fetchall()
print(f"\n=== ALL NON-WRITER SESSIONS COUNT: {len(all_sessions)} ===")

# 5. Also check sessions from the old project ID with same directory
c.execute("SELECT id, title, time_created, project_id FROM session WHERE directory LIKE '%Vocab%' AND title NOT LIKE 'checkpoint-writer:%' ORDER BY time_created DESC LIMIT 10")
other = c.fetchall()
print("\n=== ALL Vocab-related sessions ===")
for s in other:
    ts = datetime.fromtimestamp(s['time_created']/1000).strftime('%Y-%m-%d %H:%M')
    print(f"  {s['id']} | {ts} | proj={s['project_id'][:12]} | {s['title']}")

conn.close()
