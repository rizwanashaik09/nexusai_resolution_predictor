import os
import json
import logging
import sqlite3
import hashlib
import csv
import io
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, redirect, url_for,
    session, jsonify, send_file, flash
)

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")

logging.basicConfig(
    filename="logs/app.log",
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

DB_PATH = "auth.db"


@app.context_processor
def inject_now():
    return {"now": datetime.utcnow()}
MODEL_PATH = "models/rf_model.pkl"
ENCODER_PATH = "models/label_encoder.pkl"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                filename TEXT,
                total_chats INTEGER,
                delayed INTEGER,
                on_time INTEGER,
                avg_risk_score REAL,
                results_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


# ── Auth routes ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not username or not password:
            return render_template("login.html", error="All fields required.")
        with get_db() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE username=? AND password=?",
                (username, hash_password(password))
            ).fetchone()
        if user:
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            logger.info(f"Login: {username}")
            return redirect(url_for("dashboard"))
        return render_template("login.html", error="Invalid credentials.")
    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not username or not password:
            return render_template("register.html", error="All fields required.")
        try:
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO users (username, password) VALUES (?,?)",
                    (username, hash_password(password))
                )
                conn.commit()
            logger.info(f"Registered: {username}")
            return redirect(url_for("login"))
        except sqlite3.IntegrityError:
            return render_template("register.html", error="Username already taken.")
    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.route("/dashboard")
@login_required
def dashboard():
    with get_db() as conn:
        history = conn.execute(
            "SELECT * FROM predictions WHERE user_id=? ORDER BY created_at DESC LIMIT 10",
            (session["user_id"],)
        ).fetchall()
        stats = conn.execute(
            """SELECT COUNT(*) as runs, COALESCE(SUM(total_chats),0) as total,
               COALESCE(SUM(delayed),0) as delayed, COALESCE(SUM(on_time),0) as on_time
               FROM predictions WHERE user_id=?""",
            (session["user_id"],)
        ).fetchone()
    return render_template("dashboard.html", history=history, stats=stats)


# ── Training ──────────────────────────────────────────────────────────────────

@app.route("/train")
@login_required
def train_page():
    return render_template("train.html")


@app.route("/api/train", methods=["POST"])
@login_required
def api_train():
    try:
        from ml_engine import train_model
        metrics = train_model()
        logger.info(f"Model trained by user {session['user_id']}")
        return jsonify({"success": True, "metrics": metrics})
    except Exception as e:
        logger.error(f"Training error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ── Prediction ────────────────────────────────────────────────────────────────

@app.route("/predict")
@login_required
def predict_page():
    return render_template("predict.html")


@app.route("/api/predict", methods=["POST"])
@login_required
def api_predict():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
    f = request.files["file"]
    if not f.filename.endswith(".csv"):
        return jsonify({"success": False, "error": "Only CSV files accepted"}), 400
    try:
        from ml_engine import predict_from_df
        import pandas as pd
        df = pd.read_csv(f)
        results = predict_from_df(df)

        delayed = sum(1 for r in results if r["prediction"] == "Delayed")
        on_time = len(results) - delayed
        avg_risk = round(sum(r["risk_score"] for r in results) / len(results), 2) if results else 0

        with get_db() as conn:
            conn.execute(
                """INSERT INTO predictions
                   (user_id, filename, total_chats, delayed, on_time, avg_risk_score, results_json)
                   VALUES (?,?,?,?,?,?,?)""",
                (session["user_id"], f.filename, len(results),
                 delayed, on_time, avg_risk, json.dumps(results))
            )
            pred_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.commit()

        logger.info(f"Prediction run by user {session['user_id']}: {len(results)} chats")
        return jsonify({
            "success": True,
            "pred_id": pred_id,
            "total": len(results),
            "delayed": delayed,
            "on_time": on_time,
            "avg_risk": avg_risk,
            "results": results
        })
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/download/<int:pred_id>")
@login_required
def download_report(pred_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM predictions WHERE id=? AND user_id=?",
            (pred_id, session["user_id"])
        ).fetchone()
    if not row:
        return "Not found", 404

    results = json.loads(row["results_json"])
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=results[0].keys() if results else [])
    writer.writeheader()
    writer.writerows(results)
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype="text/csv",
        as_attachment=True,
        download_name=f"prediction_report_{pred_id}.csv"
    )


@app.route("/api/history")
@login_required
def api_history():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, filename, total_chats, delayed, on_time, avg_risk_score, created_at FROM predictions WHERE user_id=? ORDER BY created_at DESC LIMIT 10",
            (session["user_id"],)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


if __name__ == "__main__":
    init_db()
    print(" Server running at http://localhost:5000")
app.run(debug=True, port=5000, use_reloader=False)
