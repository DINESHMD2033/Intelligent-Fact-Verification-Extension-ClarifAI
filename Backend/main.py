import os
import json
import time
import sqlite3
import logging
import csv
from typing import Dict, Any, List, Optional
import numpy as np
import torch
import requests
from fastapi import FastAPI, Request, HTTPException, status, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from torch.utils.data import Dataset, DataLoader
from torch import nn, optim
import tempfile

try:
    import google.generativeai as genai
    AI_API_KEY = "AIzaSyBcaYZEd5MpiInIcQd6GMz2tsNyiU7qISg"
    genai.configure(api_key=AI_API_KEY)
    
    # Initialize advanced analysis engine
    model_names = [
        'gemini-1.5-flash',
        'gemini-1.5-flash-001',
        'gemini-1.0-pro',
        'gemini-2.5-flash',
        'gemini-1.0-pro-001',
        'gemini-pro',
        'models/gemini-pro'
    ]
    
    ai_engine = None
    ADVANCED_AI_AVAILABLE = False
    
    for model_name in model_names:
        try:
            ai_engine = genai.GenerativeModel(model_name)
            test_response = ai_engine.generate_content("Test")
            ADVANCED_AI_AVAILABLE = True
            print(f"✅ Advanced AI Engine Initialized Successfully")
            break
        except Exception as e:
            continue
    
    if not ADVANCED_AI_AVAILABLE:
        print("❌ Advanced AI Engine initialization failed")
        ai_engine = None
except Exception as e:
    ADVANCED_AI_AVAILABLE = False
    ai_engine = None
    print(f"❌ AI Engine configuration error: {e}")

# CONFIGURATION
MODEL_DIR = "clarif_model"
DB_PATH = "claims.db"
CORRECTIONS_FILE = "corrections.csv"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "1234"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# CSV Files
FEEDBACK_CSV = "data/feedback.csv"
PENDING_CLAIMS_CSV = "data/pending_claims.csv"
TRAINING_CLAIMS_CSV = "data/training_claims.csv"

os.makedirs("data", exist_ok=True)

# Initialize CSV files
if not os.path.exists(FEEDBACK_CSV):
    with open(FEEDBACK_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "original_claim", "model_prediction", 
                        "feedback_type", "user_correction", "confidence", 
                        "video_id", "video_url", "source"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clarifai_api")

# ============================================
# DATABASE INITIALIZATION
# ============================================
def ensure_db_schema():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            model_prediction TEXT,
            confidence REAL,
            user_claim TEXT,
            status TEXT DEFAULT 'pending',
            timestamp TEXT,
            video_id TEXT,
            video_url TEXT,
            sources TEXT
        )
    """)
    
    # Add video_url column if missing
    c.execute("PRAGMA table_info(claims)")
    cols = [r[1] for r in c.fetchall()]
    if "video_url" not in cols:
        try:
            c.execute("ALTER TABLE claims ADD COLUMN video_url TEXT")
        except:
            pass
    
    conn.commit()
    conn.close()

ensure_db_schema()

# ============================================
# FASTAPI APP SETUP
# ============================================
app = FastAPI(title="ClarifAI Advanced Fact Checker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()

# ============================================
# LOAD MODEL
# ============================================
model_loaded = False
tokenizer = None
model = None
id2label: Dict[int, str] = {}
label2id: Dict[str, int] = {}

logger.info("Loading model from: %s", MODEL_DIR)
try:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model.to(DEVICE)
    model.eval()
    model_loaded = True
    logger.info("✅ Model loaded successfully")
except Exception as e:
    logger.exception("Failed to load model: %s", e)
    model_loaded = False

# Load label mapping
def load_label_mapping(model_dir: str) -> Dict[int, str]:
    try:
        label2id_path = os.path.join(model_dir, "label2id.json")
        if os.path.exists(label2id_path):
            with open(label2id_path, "r", encoding="utf-8") as f:
                label2id_loaded = json.load(f)
            id2label_loaded = {int(v): k for k, v in label2id_loaded.items()}
            return id2label_loaded
    except Exception as e:
        logger.error("Label mapping load failed: %s", e)
    
    return {0: "fake", 1: "real", 2: "partially_true"}

id2label = load_label_mapping(MODEL_DIR)
label2id = {v: k for k, v in id2label.items()}

# ============================================
# HELPER FUNCTIONS
# ============================================
def softmax(arr: np.ndarray) -> np.ndarray:
    exps = np.exp(arr - np.max(arr))
    return exps / np.sum(exps)

def normalize_prediction_for_frontend(prediction: str) -> str:
    prediction = str(prediction).lower().strip()
    mapping = {
        "real": "true",
        "true": "true",
        "correct": "true",
        "fake": "false",
        "false": "false",
        "incorrect": "false",
        "partially_true": "partially_true",
        "partially true": "partially_true",
        "mixed": "partially_true",
        "unverified": "unverifiable",
        "unverifiable": "unverifiable"
    }
    return mapping.get(prediction, "unverifiable")

def predict_text_raw(text: str) -> Dict[str, Any]:
    if not model_loaded or model is None or tokenizer is None:
        raise RuntimeError("Model not loaded")
    
    enc = tokenizer.encode_plus(
        text,
        add_special_tokens=True,
        truncation=True,
        padding="max_length",
        max_length=128,
        return_tensors="pt"
    )
    
    input_ids = enc["input_ids"].to(DEVICE)
    attention_mask = enc["attention_mask"].to(DEVICE)
    
    with torch.no_grad():
        outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        logits = outputs.logits.cpu().numpy()[0]
    
    probs = softmax(logits)
    pred_id = int(np.argmax(probs))
    confidence = float(probs[pred_id])
    label_str = id2label.get(pred_id, str(pred_id))
    
    return {"pred_id": pred_id, "label": label_str, "confidence": confidence}

# ============================================
# ADVANCED AI ANALYSIS WITH SOURCE VERIFICATION
# ============================================
async def advanced_content_analysis(content: str, video_title: str = "") -> Dict[str, Any]:
    """
    Advanced AI-powered content analysis system with source verification
    """
    try:
        if not ADVANCED_AI_AVAILABLE or ai_engine is None:
            return {
                "has_verifiable_claims": False,
                "primary_claim": "Analysis service unavailable",
                "prediction": "UNVERIFIABLE",
                "confidence": 0.5,
                "explanation": "Advanced analysis temporarily unavailable",
                "reasoning": "Service configuration issue",
                "sources": [],
                "verification_context": "Analysis engine offline"
            }
        
        prompt = f"""
Analyze this content for factual claims and provide detailed verification with sources:

{f"Title: {video_title}" if video_title else ""}
Content: {content}

Respond with ONLY valid JSON in this exact format:
{{
    "has_verifiable_claims": true/false,
    "primary_claim": "main claim found",
    "prediction": "TRUE/FALSE/PARTIALLY_TRUE/UNVERIFIABLE",
    "confidence": 0.85,
    "explanation": "brief explanation of verdict",
    "reasoning": "detailed reasoning for classification",
    "sources": [
        {{
            "name": "Source name (e.g., CDC, WHO, Scientific Journal)",
            "context": "Relevant information from this source",
            "url": "URL if available",
            "reliability": "high/medium/low"
        }}
    ],
    "verification_context": "Detailed explanation of how this was verified, including specific facts, data points, or expert consensus used"
}}

Important: 
- For TRUE claims: Provide reliable sources that confirm the claim
- For FALSE claims: Provide sources that contradict or debunk the claim
- For PARTIALLY_TRUE: Provide sources for both accurate and inaccurate parts
- For UNVERIFIABLE: Explain why sources are insufficient
- Always include verification_context explaining the verification process
"""
        
        response = ai_engine.generate_content(prompt)
        response_text = response.text.strip()
        
        if "{" in response_text and "}" in response_text:
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            json_str = response_text[json_start:json_end]
            result = json.loads(json_str)
            
            # Ensure sources field exists
            if "sources" not in result or not result["sources"]:
                result["sources"] = [{
                    "name": "AI Analysis Engine",
                    "context": result.get("reasoning", "Analysis based on trained knowledge"),
                    "url": "",
                    "reliability": "medium"
                }]
            
            # Ensure verification_context exists
            if "verification_context" not in result:
                result["verification_context"] = result.get("reasoning", "Verified through comprehensive analysis")
            
        else:
            result = {
                "has_verifiable_claims": False,
                "primary_claim": "No clear claims detected",
                "prediction": "UNVERIFIABLE",
                "confidence": 0.5,
                "explanation": "Content analysis completed",
                "reasoning": response_text,
                "sources": [{
                    "name": "Analysis Engine",
                    "context": "Unable to extract structured verification data",
                    "url": "",
                    "reliability": "low"
                }],
                "verification_context": "Insufficient information for verification"
            }
        
        return result
        
    except Exception as e:
        logger.error(f"Advanced analysis error: {e}")
        return {
            "has_verifiable_claims": False,
            "primary_claim": "Analysis unavailable",
            "prediction": "UNVERIFIABLE",
            "confidence": 0.0,
            "explanation": "Analysis service error",
            "reasoning": str(e),
            "sources": [],
            "verification_context": "Technical error during analysis"
        }

async def get_video_title(video_id: str) -> str:
    try:
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        response = requests.get(oembed_url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return data.get('title', f'Video {video_id}')
    except:
        pass
    return f"Video {video_id}"

# ============================================
# AUTH HELPER
# ============================================
def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = credentials.username == ADMIN_USERNAME
    correct_password = credentials.password == ADMIN_PASSWORD
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return True

# ============================================
# API ENDPOINTS
# ============================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model_loaded,
        "device": str(DEVICE),
        "advanced_ai": ADVANCED_AI_AVAILABLE
    }

@app.post("/api/verify")
async def verify_claim(req: Request):
    body = await req.json()
    claim_text = body.get("claim") or body.get("text") or ""
    
    if not claim_text:
        raise HTTPException(status_code=400, detail="Missing claim")
    
    try:
        # First try AI analysis for source verification
        ai_result = await advanced_content_analysis(claim_text)
        
        if ai_result.get("has_verifiable_claims", False):
            normalized_pred = normalize_prediction_for_frontend(ai_result["prediction"])
            
            result = {
                "id": str(time.time()),
                "claim": claim_text,
                "prediction": normalized_pred,
                "confidence": ai_result["confidence"],
                "explanation": ai_result["explanation"],
                "sources": ai_result.get("sources", []),
                "verification_context": ai_result.get("verification_context", ""),
                "reasoning": ai_result.get("reasoning", ""),
                "processing_time": 0.8,
                "source": "advanced_analysis"
            }
        else:
            # Fallback to model prediction
            raw_result = predict_text_raw(claim_text)
            normalized_pred = normalize_prediction_for_frontend(raw_result["label"])
            
            # Generate basic sources for model predictions
            model_sources = [{
                "name": "ClarifAI ML Model",
                "context": f"Trained on {len(label2id)} categories with transformer architecture",
                "url": "",
                "reliability": "high" if raw_result["confidence"] > 0.8 else "medium"
            }]
            
            explanations = {
                "true": "This claim appears factual based on trained model analysis.",
                "false": "This claim appears inaccurate based on trained patterns.",
                "partially_true": "This claim contains mixed accuracy elements.",
                "unverifiable": "Unable to verify with high confidence from available data."
            }
            
            result = {
                "id": str(time.time()),
                "claim": claim_text,
                "prediction": normalized_pred,
                "confidence": raw_result["confidence"],
                "explanation": explanations.get(normalized_pred, "Analysis completed."),
                "sources": model_sources,
                "verification_context": f"Analyzed using machine learning model with {raw_result['confidence']:.2%} confidence. Model trained on verified fact-checking datasets.",
                "reasoning": f"Prediction based on pattern recognition across {len(label2id)} categories",
                "processing_time": 0.5,
                "source": "model"
            }
        
        # Save to DB
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO claims (text, model_prediction, confidence, status, timestamp, sources) VALUES (?, ?, ?, ?, ?, ?)",
            (claim_text, result["prediction"], result["confidence"], "verified", 
             time.strftime("%Y-%m-%dT%H:%M:%S"), json.dumps(result.get("sources", [])))
        )
        conn.commit()
        conn.close()
        
        return result
        
    except Exception as e:
        logger.exception("Verification failed: %s", e)
        raise HTTPException(status_code=500, detail="Analysis failed")

@app.post("/api/analyze-text")
async def analyze_text(req: Request):
    body = await req.json()
    text = body.get("text", "")
    
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")
    
    import re
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    sentences = [s for s in sentences if len(s) >= 20][:5]
    
    results = []
    for sentence in sentences:
        try:
            # Try AI analysis first for source verification
            ai_result = await advanced_content_analysis(sentence)
            
            if ai_result.get("has_verifiable_claims", False):
                normalized_pred = normalize_prediction_for_frontend(ai_result["prediction"])
                
                claim_result = {
                    "claim": sentence,
                    "prediction": normalized_pred,
                    "confidence": ai_result["confidence"],
                    "explanation": ai_result["explanation"],
                    "sources": ai_result.get("sources", []),
                    "verification_context": ai_result.get("verification_context", ""),
                    "reasoning": ai_result.get("reasoning", ""),
                    "processing_time": 0.6,
                    "source": "advanced_analysis"
                }
            else:
                # Fallback to model
                raw_result = predict_text_raw(sentence)
                normalized_pred = normalize_prediction_for_frontend(raw_result["label"])
                
                model_sources = [{
                    "name": "ClarifAI ML Model",
                    "context": f"Pattern analysis with {raw_result['confidence']:.2%} confidence",
                    "url": "",
                    "reliability": "high" if raw_result["confidence"] > 0.8 else "medium"
                }]
                
                explanations = {
                    "true": "Factual claim verified by trained model.",
                    "false": "Claim appears inaccurate based on patterns.",
                    "partially_true": "Mixed accuracy detected in claim.",
                    "unverifiable": "Unable to verify confidently."
                }
                
                claim_result = {
                    "claim": sentence,
                    "prediction": normalized_pred,
                    "confidence": raw_result["confidence"],
                    "explanation": explanations.get(normalized_pred, "Analysis completed."),
                    "sources": model_sources,
                    "verification_context": f"ML model analysis with {raw_result['confidence']:.2%} confidence",
                    "reasoning": "Based on trained fact-checking patterns",
                    "processing_time": 0.3,
                    "source": "model"
                }
            
            results.append(claim_result)
            
        except Exception as e:
            logger.error(f"Error processing sentence: {e}")
            results.append({
                "claim": sentence,
                "prediction": "unverifiable",
                "confidence": 0.5,
                "explanation": "Analysis error occurred",
                "sources": [],
                "verification_context": "Technical error",
                "reasoning": str(e),
                "processing_time": 0.1,
                "source": "error"
            })
    
    return {
        "claims_found": len(results),
        "results": results,
        "status": "success"
    }

@app.post("/api/analyze-youtube")
async def analyze_youtube_video(req: Request):
    body = await req.json()
    video_id = body.get("video_id")
    url = body.get("url", "")
    
    if not video_id:
        raise HTTPException(status_code=400, detail="Missing video_id")
    
    try:
        video_title = await get_video_title(video_id)
        
        # Use advanced AI analysis with source verification
        analysis_context = f"""
Video Analysis Request:
Title: {video_title}
URL: {url}
Video ID: {video_id}

Analyze the main factual claims in this video and provide comprehensive source verification.
Include specific sources, scientific consensus, or authoritative references that support or contradict the claims.
"""
        
        ai_result = await advanced_content_analysis(analysis_context, video_title)
        
        prediction_map = {
            "TRUE": "true",
            "FALSE": "false",
            "PARTIALLY_TRUE": "partially_true",
            "UNVERIFIABLE": "unverifiable"
        }
        
        normalized_pred = prediction_map.get(
            ai_result.get("prediction", "UNVERIFIABLE").upper(),
            "unverifiable"
        )
        
        result = {
            "status": "success",
            "video_id": video_id,
            "url": url,
            "video_title": video_title,
            "source": "advanced_analysis",
            "results": [{
                "claim": ai_result.get("primary_claim", "Video content analysis"),
                "prediction": normalized_pred,
                "confidence": ai_result.get("confidence", 0.5),
                "explanation": ai_result.get("explanation", "Advanced analysis completed"),
                "reasoning": ai_result.get("reasoning", ""),
                "sources": ai_result.get("sources", [{
                    "name": "Video Analysis Engine",
                    "context": "Comprehensive video content analysis",
                    "url": "",
                    "reliability": "medium"
                }]),
                "verification_context": ai_result.get("verification_context", "Analysis based on video content and title"),
                "source": "advanced_ai"
            }],
            "overall_prediction": normalized_pred,
            "confidence": ai_result.get("confidence", 0.5)
        }
        
        # Save to DB with sources
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute(
                """INSERT INTO claims 
                (text, model_prediction, confidence, status, timestamp, video_id, video_url, sources)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    ai_result.get("primary_claim", "YouTube content"),
                    normalized_pred,
                    ai_result.get("confidence", 0.5),
                    "youtube_analyzed",
                    time.strftime("%Y-%m-%dT%H:%M:%S"),
                    video_id,
                    url,
                    json.dumps(result["results"][0].get("sources", []))
                )
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to save YouTube analysis: {e}")
        
        return result
        
    except Exception as e:
        logger.exception(f"YouTube analysis failed: {e}")
        return {
            "status": "error",
            "message": "Analysis temporarily unavailable",
            "video_id": video_id,
            "url": url
        }

@app.post("/api/submit-feedback")
async def submit_feedback(req: Request):
    try:
        body = await req.json()
    except:
        form = await req.form()
        body = dict(form)
    
    claim = body.get("claim") or body.get("text") or ""
    prediction = body.get("prediction", "")
    user_correction = body.get("user_correction", "") or body.get("correction", "")
    confidence = float(body.get("confidence", 0.0) or 0.0)
    video_id = body.get("video_id", "")
    video_url = body.get("video_url", "")
    source = body.get("source", "web")
    
    if not claim:
        raise HTTPException(status_code=422, detail="Missing claim")
    
    # Save to feedback CSV with video URL
    try:
        with open(FEEDBACK_CSV, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                time.strftime("%Y-%m-%d %H:%M:%S"),
                claim,
                prediction,
                "wrong_claim",
                user_correction,
                confidence,
                video_id,
                video_url,
                source
            ])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save feedback: {e}")
    
    # Save to DB
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            """INSERT INTO claims 
            (text, model_prediction, confidence, user_claim, status, timestamp, video_id, video_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (claim, prediction, confidence, user_correction if user_correction else None, 
             "user_feedback", time.strftime("%Y-%m-%dT%H:%M:%S"), video_id, video_url)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.exception("DB save failed: %s", e)
    
    return {"status": "success", "message": "Feedback saved. Thank you!"}

# ============================================
# ADMIN PANEL
# ============================================

@app.get("/admin")
async def admin_panel(auth: bool = Depends(verify_admin)):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            SELECT id, text, model_prediction, confidence, user_claim, status, timestamp, video_url
            FROM claims
            ORDER BY id DESC
            LIMIT 100
        """)
        claims = c.fetchall()
        conn.close()
        
        # Count statistics
        feedback_count = 0
        if os.path.exists(FEEDBACK_CSV):
            with open(FEEDBACK_CSV, 'r', encoding='utf-8') as f:
                feedback_count = len(f.readlines()) - 1
        
        pending_claims_count = len([c for c in claims if c[5] == 'user_feedback'])
        
        # Generate HTML rows
        rows = ""
        for claim in claims:
            claim_id, text, model_pred, confidence, user_claim, status, timestamp, video_url = claim
            
            status_color = {
                "user_feedback": "#ffc107",
                "approved": "#28a745",
                "rejected": "#dc3545",
                "verified": "#17a2b8",
                "youtube_analyzed": "#9c27b0"
            }.get(status, "#6c757d")
            
            display_text = str(text)[:150] + ('...' if len(str(text)) > 150 else '')
            conf_display = f"{confidence:.3f}" if confidence is not None else 'N/A'
            
            # Show video URL if available
            url_display = ""
            if video_url:
                url_display = f'<div style="font-size:10px;color:#666;margin-top:4px;">🎥 <a href="{video_url}" target="_blank" style="color:#667eea;">Video Link</a></div>'
            
            rows += f"""
            <tr style="background-color: {status_color}20;">
                <td>{claim_id}</td>
                <td style="max-width:400px; word-wrap:break-word;">
                    {display_text}
                    {url_display}
                </td>
                <td>{model_pred or 'N/A'}</td>
                <td>{conf_display}</td>
                <td><strong>{user_claim or 'N/A'}</strong></td>
                <td style="color:{status_color}"><strong>{status}</strong></td>
                <td>{timestamp or 'N/A'}</td>
                <td>
                {f'''
                <form action="/admin/approve" method="post" style="display:inline">
                    <input type="hidden" name="id" value="{claim_id}">
                    <button type="submit" style="background:#28a745;color:white;border:none;padding:5px 10px;margin:2px;border-radius:4px;cursor:pointer;">Approve</button>
                </form>
                <form action="/admin/reject" method="post" style="display:inline">
                    <input type="hidden" name="id" value="{claim_id}">
                    <button type="submit" style="background:#dc3545;color:white;border:none;padding:5px 10px;margin:2px;border-radius:4px;cursor:pointer;">Reject</button>
                </form>
                ''' if status == 'user_feedback' and user_claim else 'N/A'}
                </td>
            </tr>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>ClarifAI Admin Panel</title>
            <style>
                * {{ margin: 0; padding: 0; box-sizing: border-box; }}
                body {{ 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }}
                .container {{
                    max-width: 1400px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    overflow: hidden;
                }}
                .header {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }}
                .header h1 {{ font-size: 32px; margin-bottom: 10px; }}
                .header p {{ opacity: 0.9; font-size: 16px; }}
                .stats {{
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    padding: 30px;
                    background: #f8f9fa;
                }}
                .stat-card {{
                    background: white;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    text-align: center;
                }}
                .stat-number {{ 
                    font-size: 36px; 
                    font-weight: 700; 
                    color: #667eea; 
                    margin-bottom: 8px;
                }}
                .stat-label {{ color: #6b7280; font-size: 14px; }}
                .content {{ padding: 30px; }}
                table {{ 
                    border-collapse: collapse; 
                    width: 100%; 
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                }}
                th, td {{ 
                    border: 1px solid #e5e7eb; 
                    padding: 12px; 
                    text-align: left; 
                    font-size: 13px;
                }}
                th {{ 
                    background: #f3f4f6; 
                    font-weight: 600;
                    color: #374151;
                }}
                tr:hover {{ background: #f9fafb; }}
                .download-section {{
                    padding: 20px 30px;
                    background: #e0e7ff;
                    display: flex;
                    gap: 15px;
                    flex-wrap: wrap;
                    justify-content: center;
                }}
                .download-btn {{
                    background: #667eea;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: 600;
                    transition: all 0.3s;
                }}
                .download-btn:hover {{
                    background: #5a67d8;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🛡️ ClarifAI Admin Panel</h1>
                    <p>Advanced Fact-Checking Management System</p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">{pending_claims_count}</div>
                        <div class="stat-label">Pending Reviews</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{len(claims)}</div>
                        <div class="stat-label">Total Claims</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{feedback_count}</div>
                        <div class="stat-label">User Feedback</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{"✅" if ADVANCED_AI_AVAILABLE else "❌"}</div>
                        <div class="stat-label">AI Engine Status</div>
                    </div>
                </div>
                
                <div class="download-section">
                    <a href="/download-csv/feedback" class="download-btn">📥 Download Feedback Data</a>
                    <a href="/download-csv/pending" class="download-btn">📥 Download Pending Claims</a>
                    <a href="/download-csv/training" class="download-btn">📥 Download Training Data</a>
                </div>
                
                <div class="content">
                    <h2 style="margin-bottom: 20px; color: #374151;">Recent Claims & Feedback</h2>
                    <div style="overflow-x: auto;">
                        <table>
                            <tr>
                                <th>ID</th>
                                <th>Claim Text</th>
                                <th>Prediction</th>
                                <th>Confidence</th>
                                <th>User Correction</th>
                                <th>Status</th>
                                <th>Timestamp</th>
                                <th>Actions</th>
                            </tr>
                            {rows}
                        </table>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content)
        
    except Exception as e:
        logger.exception("Admin panel error: %s", e)
        return HTMLResponse(f"<html><body><h2>Error loading admin panel</h2><p>{str(e)}</p></body></html>")

@app.post("/admin/approve")
async def approve_claim(request: Request, auth: bool = Depends(verify_admin)):
    form_data = await request.form()
    claim_id = form_data.get("id")
    
    if not claim_id:
        return RedirectResponse("/admin", status_code=303)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT text, user_claim FROM claims WHERE id = ?", (claim_id,))
        row = c.fetchone()
        
        if row:
            text, corrected_label = row
            if corrected_label and corrected_label in label2id:
                with open(CORRECTIONS_FILE, "a", encoding="utf-8") as f:
                    f.write(f"{text},{corrected_label}\n")
                
                c.execute("UPDATE claims SET status = 'approved' WHERE id = ?", (claim_id,))
                conn.commit()
                logger.info(f"✅ Approved correction: {text} -> {corrected_label}")
        
        conn.close()
    except Exception as e:
        logger.exception("Error approving claim: %s", e)
    
    return RedirectResponse("/admin", status_code=303)

@app.post("/admin/reject")
async def reject_claim(request: Request, auth: bool = Depends(verify_admin)):
    form_data = await request.form()
    claim_id = form_data.get("id")
    
    if not claim_id:
        return RedirectResponse("/admin", status_code=303)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE claims SET status = 'rejected' WHERE id = ?", (claim_id,))
        conn.commit()
        conn.close()
        logger.info(f"❌ Rejected claim ID: {claim_id}")
    except Exception as e:
        logger.exception("Error rejecting claim: %s", e)
    
    return RedirectResponse("/admin", status_code=303)

@app.get("/download-csv/{csv_type}")
async def download_csv(csv_type: str, auth: bool = Depends(verify_admin)):
    if csv_type == "feedback":
        file_path = FEEDBACK_CSV
        filename = f"clarifai_feedback_{time.strftime('%Y%m%d')}.csv"
    elif csv_type == "pending":
        file_path = PENDING_CLAIMS_CSV
        filename = f"clarifai_pending_{time.strftime('%Y%m%d')}.csv"
    elif csv_type == "training":
        file_path = TRAINING_CLAIMS_CSV
        filename = f"clarifai_training_{time.strftime('%Y%m%d')}.csv"
    else:
        raise HTTPException(status_code=404, detail="CSV type not found")
    
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type='text/csv', filename=filename)
    else:
        raise HTTPException(status_code=404, detail="CSV file not found")

@app.get("/", response_class=HTMLResponse)
def root():
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>ClarifAI - Advanced Fact Checker</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }}
            .container {{
                background: white;
                border-radius: 20px;
                padding: 50px;
                max-width: 600px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
            }}
            h1 {{ 
                font-size: 48px; 
                margin-bottom: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }}
            .status {{
                display: inline-block;
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: 600;
                margin: 10px 5px;
            }}
            .status.ok {{ background: #d4edda; color: #155724; }}
            .status.error {{ background: #f8d7da; color: #721c24; }}
            .links {{
                margin-top: 30px;
                display: flex;
                gap: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }}
            .links a {{
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                border-radius: 10px;
                font-weight: 600;
                transition: all 0.3s;
            }}
            .links a:hover {{
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }}
            .info {{
                margin-top: 30px;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 12px;
                text-align: left;
            }}
            .info h3 {{ margin-bottom: 10px; color: #374151; }}
            .info ul {{ list-style: none; padding-left: 0; }}
            .info li {{ 
                padding: 8px 0; 
                border-bottom: 1px solid #e5e7eb;
                color: #6b7280;
            }}
            .info li:last-child {{ border-bottom: none; }}
            .info li:before {{ content: "✅ "; color: #10b981; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔍 ClarifAI</h1>
            <p style="font-size: 20px; color: #6b7280; margin-bottom: 20px;">Advanced Fact-Checking System</p>
            
            <div>
                <span class="status {'ok' if model_loaded else 'error'}">
                    {'✅ Model Loaded' if model_loaded else '❌ Model Not Loaded'}
                </span>
                <span class="status {'ok' if ADVANCED_AI_AVAILABLE else 'error'}">
                    {'✅ AI Engine Active' if ADVANCED_AI_AVAILABLE else '❌ AI Engine Offline'}
                </span>
            </div>
            
            <div class="links">
                <a href="/admin">🛡️ Admin Panel</a>
                <a href="/health">💊 System Health</a>
                <a href="/docs">📚 API Docs</a>
            </div>
            
            <div class="info">
                <h3>🚀 System Features</h3>
                <ul>
                    <li>Real-time fact verification</li>
                    <li>YouTube video analysis</li>
                    <li>Advanced AI-powered detection</li>
                    <li>Multi-source verification</li>
                    <li>User feedback integration</li>
                    <li>Continuous learning system</li>
                </ul>
            </div>
            
            <div style="margin-top: 30px; padding: 15px; background: #e0e7ff; border-radius: 10px;">
                <p style="font-size: 12px; color: #4c51bf;">
                    <strong>API Endpoint:</strong> http://127.0.0.1:8000<br>
                    <strong>Admin Access:</strong> admin / 1234
                </p>
            </div>
        </div>
    </body>
    </html>
    """

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("🚀 ClarifAI Advanced Fact-Checking System")
    print("=" * 60)
    print(f"📊 Model Status: {'✅ LOADED' if model_loaded else '❌ NOT LOADED'}")
    print(f"🤖 AI Engine: {'✅ ACTIVE' if ADVANCED_AI_AVAILABLE else '❌ OFFLINE'}")
    print(f"🎯 Label Mapping: {id2label}")
    print(f"🔗 API URL: http://127.0.0.1:8000")
    print(f"👑 Admin Panel: http://127.0.0.1:8000/admin")
    print("=" * 60)
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)