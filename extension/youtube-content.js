// ClarifAI YouTube Fact Checker (updated)
// Works with FastAPI backend via ngrok tunnel

const API_URL = "https://52a4-205-254-169-207.ngrok-free.app"; 

class YouTubeClarifAI {
  constructor() {
    this.currentVideoId = null;
    this.processedVideos = new Set();
    this.overlayVisible = false;
    this.init();
  }

  init() {
    console.log("🎥 ClarifAI YouTube Extension Initialized");
    this.injectStyles();
    this.monitorURLChanges();
    this.checkForVideo();
  }

  injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #clarifai-youtube-overlay {
        position: fixed !important;
        bottom: 100px !important;
        right: 20px !important;
        width: 400px !important;
        max-height: 80vh !important;
        background: rgba(0, 0, 0, 0.95) !important;
        border: 2px solid #667eea !important;
        border-radius: 16px !important;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6) !important;
        z-index: 10000 !important;
        color: white !important;
        font-family: Arial, sans-serif !important;
        overflow: hidden !important;
        animation: slideInRight 0.4s ease-out;
      }
      @keyframes slideInRight {
        from { transform: translateX(450px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .yt-header {background:linear-gradient(135deg,#667eea,#764ba2);padding:16px;border-radius:14px 14px 0 0;}
      .yt-close-btn {background:rgba(255,255,255,0.2);border:none;color:white;font-size:22px;border-radius:50%;width:34px;height:34px;cursor:pointer;}
      .yt-content {padding:16px;max-height:calc(80vh - 100px);overflow-y:auto;}
      .yt-claim {border-left:4px solid #6b7280;margin:10px 0;padding:10px;border-radius:8px;background:rgba(255,255,255,0.1);}
      .yt-true {border-left-color:#10b981;}
      .yt-false {border-left-color:#ef4444;}
      .yt-partially_true {border-left-color:#f59e0b;}
      .yt-unverified {border-left-color:#6b7280;}
      .yt-spinner {width:48px;height:48px;border:4px solid rgba(102,126,234,0.2);border-top-color:#667eea;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px;}
      @keyframes spin {to {transform:rotate(360deg);}}
    `;
    document.head.appendChild(style);
  }

  monitorURLChanges() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        this.checkForVideo();
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  extractVideoId() {
    try {
      const url = new URL(window.location.href);
      if (url.hostname.includes("youtube.com")) {
        if (url.pathname.startsWith("/shorts/")) {
          return url.pathname.split("/shorts/")[1].split("?")[0];
        } else if (url.searchParams.get("v")) {
          return url.searchParams.get("v");
        }
      } else if (url.hostname === "youtu.be") {
        return url.pathname.substring(1);
      }
    } catch (e) {
      console.error("Video ID extraction error:", e);
    }
    return null;
  }

  async checkForVideo() {
    const videoId = this.extractVideoId();
    if (!videoId) return;

    if (videoId !== this.currentVideoId) {
      console.log("🎬 New YouTube video:", videoId);
      this.currentVideoId = videoId;

      if (!this.processedVideos.has(videoId)) {
        this.processedVideos.add(videoId);
        this.analyzeVideo(videoId);
      }
    }
  }

  showOverlay(message, isLoading = false) {
    this.removeOverlay();
    const overlay = document.createElement("div");
    overlay.id = "clarifai-youtube-overlay";
    overlay.innerHTML = `
      <div class="yt-header">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>🔍 ClarifAI</strong><div style="font-size:12px;opacity:.8">Fact Checker</div></div>
          <button class="yt-close-btn" id="yt-close-overlay">×</button>
        </div>
      </div>
      <div class="yt-content" id="yt-content-body">
        <div style="text-align:center;padding:20px;color:#ccc;">
          ${isLoading ? `<div class="yt-spinner"></div>` : ""}
          <div style="font-size:14px;">${message}</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("yt-close-overlay").addEventListener("click", () => {
      this.removeOverlay();
    });
  }

  removeOverlay() {
    const existing = document.getElementById("clarifai-youtube-overlay");
    if (existing) existing.remove();
  }

  async analyzeVideo(videoId) {
    this.showOverlay("Getting transcript & analyzing...", true);

    try {
      const resp = await fetch(`${API_URL}/api/analyze-youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          url: window.location.href,
        }),
      });

      if (!resp.ok) {
        this.showOverlay(`API Error: ${resp.status}`, false);
        return;
      }

      const data = await resp.json();
      console.log("✅ YouTube analysis result:", data);

      if (data.status === "no_transcript") {
        this.showOverlay("No transcript available for this video.", false);
        return;
      } else if (data.status === "error") {
        this.showOverlay(`Analysis failed: ${data.message}`, false);
        return;
      }

      this.displayResults(data);
    } catch (err) {
      console.error("❌ Connection failed:", err);
      this.showOverlay(`Connection failed: ${err.message}`, false);
    }
  }

  displayResults(data) {
    this.removeOverlay();
    const overlay = document.createElement("div");
    overlay.id = "clarifai-youtube-overlay";

    const results = data.results || [];
    let claimsHTML = "";

    if (results.length === 0) {
      claimsHTML = `<div style="padding:20px;text-align:center;color:#9ca3af">No verifiable claims found.</div>`;
    } else {
      results.forEach((r) => {
        const pred = r.prediction || "unverifiable";
        const conf = ((r.confidence || 0) * 100).toFixed(1);
        const claim = r.claim || r.claim_text || "Unknown claim";
        const exp = r.explanation || "";
        claimsHTML += `
          <div class="yt-claim yt-${pred}">
            <div style="font-weight:700;text-transform:uppercase;font-size:13px;">${pred} (${conf}%)</div>
            <div style="margin-top:6px;">${claim}</div>
            ${exp ? `<div style="margin-top:6px;font-size:12px;opacity:.8">${exp}</div>` : ""}
          </div>
        `;
      });
    }

    overlay.innerHTML = `
      <div class="yt-header">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>🔍 ClarifAI</strong><div style="font-size:12px;opacity:.8">Fact Checker</div></div>
          <button class="yt-close-btn" id="yt-close-overlay">×</button>
        </div>
      </div>
      <div class="yt-content">
        ${claimsHTML}
        <div style="text-align:center;color:#aaa;margin-top:8px;font-size:11px;">
          Transcript length: ${data.transcript_length || 0} chars
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("yt-close-overlay").addEventListener("click", () => {
      this.removeOverlay();
    });
  }
}

// Initialize on YouTube pages only
if (window.location.hostname.includes("youtube.com")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new YouTubeClarifAI());
  } else {
    new YouTubeClarifAI();
  }
}
