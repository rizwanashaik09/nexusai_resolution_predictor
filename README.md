# NexusAI — Resolution Delay Prediction Platform

A production-grade AI dashboard for predicting chat resolution delays using
RandomForest, SentenceTransformers embeddings, and HuggingFace emotion detection.

---

##  Live Demo
 [Click here to view NexusAI Live](https://nexusai-resolution-predictor.onrender.com)

> **Note:** First load may take 30-50 seconds to wake up (free hosting). Please be patient!



## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10 or 3.11 (recommended) |
| pip | Latest |
| VS Code | Latest |

**VS Code Extensions (install from Extensions tab):**
- Python (Microsoft)
- Pylance
- SQLite Viewer (qwtel) — view the auth.db
- Thunder Client — test API endpoints without Postman

---

## Project Structure

```
resolution_predictor/
├── app.py                  # Flask application & routes
├── ml_engine.py            # ML logic (embeddings, emotion, RandomForest)
├── requirements.txt
├── auth.db                 # Auto-created on first run
├── data/
│   ├── train_data.csv      # Your training data
│   └── sample_predict.csv  # Sample prediction input
├── models/
│   ├── rf_model.pkl        # Saved after training
│   └── label_encoder.pkl
├── logs/
│   └── app.log             # Auto-created
├── static/
│   ├── css/style.css
│   └── js/
│       ├── main.js
│       └── predict.js
└── templates/
    ├── base.html
    ├── login.html
    ├── register.html
    ├── dashboard.html
    ├── train.html
    └── predict.html
```

---

## Step-by-Step Setup

### 1. Clone / Download the project

```bash
cd Desktop
# If using git:
git clone <your-repo-url> resolution_predictor
cd resolution_predictor

# Or just unzip and cd into the folder
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Activate (Windows):
venv\Scripts\activate

# Activate (Mac/Linux):
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

> First install downloads ~2GB of model weights (SentenceTransformers + DistilRoBERTa).
> Do this on a good internet connection. It only downloads once, then caches locally.

### 4. Create required directories

```bash
mkdir -p models logs data
```

### 5. Run the application

```bash
python app.py
```

Open your browser at: **http://localhost:5000**

---

## Using the Application

### Register & Login
1. Go to `/register` → create a username + password
2. Login at `/login`
3. You land on the **Dashboard**

### Train the Model
1. Make sure `data/train_data.csv` exists with columns:
   - `chat_text` — the conversation text
   - `label` — either `Delayed` or `On-Time`
2. Click **Train Model** in the navbar
3. Click **Start Training** — watch the live log
4. Model saves to `models/rf_model.pkl` automatically

### Run a Prediction
1. Click **Predict** in the navbar
2. Drag & drop or browse for a CSV file containing a `chat_text` column
3. Click **Analyze Conversations**
4. View results: risk gauge, emotion breakdown, per-chat table
5. Download report as CSV

### Download Reports
- From the Predict page after analysis: **Download CSV** button
- From the Dashboard history table: download icon per run

---

## Training Data Format

`data/train_data.csv`:
```csv
chat_text,label
"Customer waited 3 days with no response. Very frustrated.",Delayed
"Issue resolved in under an hour. Agent excellent.",On-Time
```

## Prediction Input Format

`data/sample_predict.csv`:
```csv
chat_text
"Customer escalated 3 times. Still no resolution."
"Resolved on first contact. Smooth experience."
```

---

## Environment Variables (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| SECRET_KEY | dev-secret-change-in-prod | Flask session secret |
| FLASK_ENV | development | Set to `production` for prod |

```bash
# Windows
set SECRET_KEY=your-long-random-secret

# Mac/Linux
export SECRET_KEY=your-long-random-secret
```

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'sentence_transformers'`**
→ Run: `pip install sentence-transformers`

**Training takes forever / crashes**
→ Reduce dataset size for testing. GPU is not required but speeds things up.

**`FileNotFoundError: models/rf_model.pkl`**
→ You need to train the model first before predicting.

**Port 5000 already in use**
→ Change the port in `app.py`: `app.run(debug=True, port=5001)`
→ Or on Mac, disable AirPlay Receiver in System Settings.

**Emotion classifier not loading**
→ Requires internet on first run to download the model. Subsequent runs use cache.
→ If offline, emotion features gracefully fall back to neutral defaults.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask 3.0 |
| Database | SQLite (auth + history) |
| ML | RandomForest (scikit-learn) |
| Embeddings | all-MiniLM-L6-v2 (SentenceTransformers) |
| Emotions | j-hartmann/emotion-english-distilroberta-base |
| Frontend | HTML5 + CSS3 (custom design system) + Vanilla JS |
| Charts | Chart.js 4.4 |
| Icons | Font Awesome 6.5 |
| Fonts | Rajdhani, Space Grotesk, JetBrains Mono |
