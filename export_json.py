# export_json.py
import mysql.connector, json, os

conn = mysql.connector.connect(
    host="localhost",
    user="root",
    password="SAT4_rme",
    database="conveyance",
)
cur = conn.cursor(dictionary=True)
cur.execute("""
  SELECT section_alias, conveyance_group, control_panel, cp_location, incident_energy, mcp
  FROM conveyor_information
  ORDER BY section_alias;
""")
rows = cur.fetchall()
cur.close(); conn.close()

os.makedirs("docs/data", exist_ok=True)   # Pages often uses /docs
with open("docs/data/conveyors.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)
print("Wrote docs/data/conveyors.json")
