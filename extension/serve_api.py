# serve_api.py
import json
import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, DistilBertForSequenceClassification
from typing import List
import uvicorn

MODEL_DIR = "outputs/clarif_model"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = DistilBertForSequenceClassification.from_pretrained(MODEL_DIR).to(device)

with open(MODEL_DIR + "/label2id.json", "r") as f:
    label2id = json.load(f)
id2label = {int(v): k for k,v in label2id.items()}

app = FastAPI(title="ClarifAI - Fact Check API")

class ClaimRequest(BaseModel):
    claim: str

class ClaimsRequest(BaseModel):
    claims: List[str]

@app.get("/health")
def health():
    return {"status":"ok", "model_loaded": True, "device": str(device)}

@app.post("/api/verify")
def verify(req: ClaimRequest):
    text = req.claim
    enc = tokenizer(text, truncation=True, padding='max_length', max_length=128, return_tensors='pt')
    input_ids = enc['input_ids'].to(device)
    attention_mask = enc['attention_mask'].to(device)
    model.eval()
    with torch.no_grad():
        out = model(input_ids=input_ids, attention_mask=attention_mask)
        logits = out.logits
        probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]
        pred_idx = int(probs.argmax())
    return {
        "claim": text,
        "prediction": id2label[pred_idx],
        "confidence": float(probs[pred_idx]),
        "probabilities": {id2label[i]: float(probs[i]) for i in range(len(probs))}
    }

@app.post("/api/verify-batch")
def verify_batch(req: ClaimsRequest):
    results = []
    for claim in req.claims:
        results.append(verify(ClaimRequest(claim=claim)))
    return {"results": results, "total": len(results)}

if __name__ == "__main__":
    uvicorn.run("serve_api:app", host="0.0.0.0", port=8000, workers=4)
