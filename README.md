# 🧠 ClarifAI - Intelligent Fact Verification Using NLP and Machine Learning

> An AI-powered Chrome Extension that performs real-time fact verification on web content using NLP, Machine Learning, and Large Language Models.
---

## 📖 Overview

ClarifAI is an intelligent browser extension that helps users identify misinformation while browsing the web.

Instead of manually checking facts through multiple websites, ClarifAI automatically analyzes webpage content, extracts factual claims, sends them to an AI-powered backend, and displays predictions with confidence scores in real time.

The system combines:

- 🧠 Natural Language Processing (NLP)
- 🤖 Machine Learning
- 🔍 Transformer Models (DistilBERT/BERT)
- 💬 LLM-based Explanation Generation
- 🌐 Chrome Extension
- ⚡ FastAPI Backend

---

## ✨ Features

- ✅ Real-time webpage fact verification
- ✅ Manual text fact checking
- ✅ Confidence score prediction
- ✅ AI-generated explanation for predictions
- ✅ YouTube Shorts analysis
- ✅ Admin dashboard
- ✅ Feedback collection for continuous learning
- ✅ Browser Extension for Chrome

---

# 📂 Repository Structure

ClarifAI/
│
├── Backend/
│   ├── Data/
│   │
│   ├── clarif_model/
│   │   ├── config.json
│   │   ├── id2label.json
│   │   ├── label2id.json
│   │   ├── model
│   │   ├── special_tokens_map.json
│   │   ├── tokenizer.json
│   │   ├── tokenizer_config.json
│   │   └── vocab.txt
│   │
│   ├── main.py
│   └── requirements.txt
│
├── Extension/
│   ├── background.js
│   ├── content.js
│   ├── content_script.js
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── manifest.json
│   ├── popup.css
│   ├── popup.html
│   ├── popup.js
│   ├── sample/
│   ├── serve_api.py
│   └── youtube-content.js
│
├── Working demo/
│   └── Drive link
│
└── README.md

---

# 🚧 Current Repository Status

### ✅ Available

- Chrome Extension Source Code
- Extension Assets
- UI Components
- FastAPI Backend
- Machine Learning Model
- Admin Dashboard
- Documentation
- Demo Video

---

# 🛠️ Technology Stack

## Frontend

- Chrome Extension (Manifest V3)
- HTML
- CSS
- JavaScript

## Backend 

- FastAPI
- Python

## AI / Machine Learning

- HuggingFace Transformers
- DistilBERT
- PyTorch
- Scikit-Learn
- Google Gemini API

---

# ⚙️ Installation

## Clone Repository

```bash
git clone https://github.com/yourusername/Intelligent-Fact-Verification-Extension-ClarifAI.git

cd Intelligent-Fact-Verification-Extension-ClarifAI
```

---

## Load Chrome Extension

1. Open Chrome

2. Go to

```
chrome://extensions
```

3. Enable

```
Developer Mode
```

4. Click

```
Load Unpacked
```

5. Select

```
Extension/
```

6. Pin the extension.

---

# 🚀 How It Works

1. User opens any webpage.
2. Extension extracts visible text.
3. Text is sent to the backend API.
4. AI model classifies the claim.
5. Confidence score is generated.
6. Optional AI explanation is returned.
7. Result is displayed instantly inside the extension popup.

---

---

# 👨‍💻 Author

**Dinesh M D**

M.Tech Software Engineering

VIT Vellore

---

# ⭐ Support

If you found this project useful,

please consider giving it a ⭐ on GitHub.

It helps others discover the project.
