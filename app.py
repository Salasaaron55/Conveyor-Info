from flask import Flask, render_template, jsonify, request
import mysql.connector
import time

app = Flask(__name__)

# Expose 'time' to Jinja for cache-busting static files
app.jinja_env.globals['time'] = time

# ---- Columns (order here = order on page) ----
COLUMNS = [
    {"key": "section_alias",    "label": "Section Alias",    "sortable": True},
    {"key": "conveyance_group", "label": "Conveyance Group", "sortable": True},
    {"key": "control_panel",    "label": "Control Panel",    "sortable": True},
    {"key": "cp_location",      "label": "CP Location",      "sortable": True},
    {"key": "incident_energy",  "label": "Incident Energy",  "sortable": True},
    {"key": "mcp",              "label": "MCP",              "sortable": True},
]

def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="SAT4_rme",     # <-- your MySQL password
        database="conveyance",
    )

# No-cache while developing
app.config["TEMPLATES_AUTO_RELOAD"] = True
@app.after_request
def add_no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

@app.route("/")
def index():
    # Read sort params
    sort = request.args.get("sort", "section_alias")
    direction = request.args.get("dir", "asc").lower()
    order_dir = "DESC" if direction == "desc" else "ASC"

    # Whitelist sortable columns
    allowed_cols = {c["key"] for c in COLUMNS if c.get("sortable")}
    col = sort if sort in allowed_cols else "section_alias"

    # Build SELECT list
    select_list = ", ".join([c["key"] for c in COLUMNS])

    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute(f"""
        SELECT {select_list}
        FROM conveyor_information
        ORDER BY {col} {order_dir};
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()

    return render_template(
        "index.html",
        rows=rows,
        row_count=len(rows),
        columns=COLUMNS,
        sort=col,
        dir=order_dir
    )

@app.route("/api/conveyors")
def api_conveyors():
    select_list = ", ".join([c["key"] for c in COLUMNS])
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute(f"SELECT {select_list} FROM conveyor_information ORDER BY section_alias;")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify(rows)

if __name__ == "__main__":
    app.run(debug=True)
