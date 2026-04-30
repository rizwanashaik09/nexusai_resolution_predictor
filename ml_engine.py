import os
import pickle
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

MODEL_PATH = "models/rf_model.pkl"
ENCODER_PATH = "models/label_encoder.pkl"

try:
    from sentence_transformers import SentenceTransformer
    _embedder = SentenceTransformer("all-MiniLM-L6-v2")
except Exception:
    _embedder = None

try:
    from transformers import pipeline
    _emotion_clf = pipeline("text-classification", model="j-hartmann/emotion-english-distilroberta-base", top_k=1)
except Exception:
    _emotion_clf = None

EMOTION_MAP = {
    "anger": 0, "disgust": 1, "fear": 2, "joy": 3,
    "neutral": 4, "sadness": 5, "surprise": 6
}


def _get_embedding(text):
    if _embedder and isinstance(text, str) and text.strip():
        return _embedder.encode(text).tolist()
    return [0.0] * 384


def _get_emotion(text):
    if _emotion_clf and isinstance(text, str) and text.strip():
        try:
            result = _emotion_clf(text[:512])[0][0]
            return EMOTION_MAP.get(result["label"].lower(), 4), result["score"]
        except Exception:
            pass
    return 4, 0.5


def _build_features(df):
    rows = []
    for _, row in df.iterrows():
        chat = str(row.get("chat_text", ""))
        emb = _get_embedding(chat)
        emotion_idx, emotion_score = _get_emotion(chat)
        feat = emb + [emotion_idx, emotion_score]
        rows.append(feat)
    return np.array(rows)


def train_model(data_path="data/train_data.csv"):
    df = pd.read_csv(data_path)
    X = _build_features(df)
    y = df["label"].values

    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    X_train, X_test, y_train, y_test = train_test_split(X, y_enc, test_size=0.2, random_state=42)
    clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    clf.fit(X_train, y_train)

    preds = clf.predict(X_test)
    acc = round(accuracy_score(y_test, preds) * 100, 2)
    report = classification_report(y_test, preds, target_names=le.classes_, output_dict=True)

    os.makedirs("models", exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)
    with open(ENCODER_PATH, "wb") as f:
        pickle.dump(le, f)

    return {
        "accuracy": acc,
        "classes": le.classes_.tolist(),
        "report": report
    }


def _load_model():
    with open(MODEL_PATH, "rb") as f:
        clf = pickle.load(f)
    with open(ENCODER_PATH, "rb") as f:
        le = pickle.load(f)
    return clf, le


def predict_from_df(df):
    clf, le = _load_model()
    X = _build_features(df)
    probs = clf.predict_proba(X)
    preds = clf.predict(X)

    results = []
    for i, (pred, prob_row) in enumerate(zip(preds, probs)):
        label = le.inverse_transform([pred])[0]
        delayed_idx = list(le.classes_).index("Delayed") if "Delayed" in le.classes_ else 0
        risk = round(float(prob_row[delayed_idx]) * 100, 1)
        confidence = round(float(max(prob_row)) * 100, 1)

        chat_text = str(df.iloc[i].get("chat_text", ""))
        emotion_idx, emotion_score = _get_emotion(chat_text)
        emotion_label = [k for k, v in EMOTION_MAP.items() if v == emotion_idx][0]

        results.append({
            "id": i + 1,
            "chat_preview": chat_text[:120] + ("..." if len(chat_text) > 120 else ""),
            "prediction": label,
            "risk_score": risk,
            "confidence": confidence,
            "emotion": emotion_label,
            "emotion_score": round(emotion_score * 100, 1)
        })
    return results
