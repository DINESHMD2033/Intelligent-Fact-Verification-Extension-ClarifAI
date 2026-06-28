
(function() {
    const API_BASE = "https://52a4-205-254-169-207.ngrok-free.app";
    
    if (window.__clarifai_injected) return;
    window.__clarifai_injected = true;
    
    let isManuallyHidden = false;
    let hasAnalyzed = false;
    let processedElements = new Set();
    

    function extractPageContent() {
        console.log('🔍 ClarifAI: Fast content extraction starting');
        
        const selectors = ['p', 'article', 'main', '.content', '.article', '.post-content', 'h1', 'h2', 'h3'];
        let textContent = '';
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (!processedElements.has(el) && el.textContent.trim().length > 50) {
                    const text = el.textContent.trim();
                    // Skip obvious non-content
                    if (!text.match(/^(Click|Subscribe|Sign up|Follow|Cookie|Privacy|Advertisement)/i)) {
                        textContent += text + ' ';
                        processedElements.add(el);
                    }
                }
            });
        });

        const finalText = textContent.trim();
        console.log(`📊 Extracted ${finalText.length} characters`);
        return finalText;
    }
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    
    function extractVideoId(url) {
        try {
            const urlObj = new URL(url);
            if (urlObj.pathname.startsWith("/shorts/")) {
                return urlObj.pathname.split("/shorts/")[1].split("?")[0];
            }
            if (urlObj.hostname.includes("youtube.com")) {
                return urlObj.searchParams.get("v");
            } else if (urlObj.hostname === "youtu.be") {
                return urlObj.pathname.replace("/", "");
            }
        } catch (e) {}
        return null;
    }
    
    function isYouTubePage() {
        return window.location.hostname.includes("youtube.com");
    }
    
    // ============================================
    // INJECT STYLES
    // ============================================
    
    const style = document.createElement('style');
    style.textContent = `
        #clarifai-widget {
            position: fixed !important;
            top: 80px !important;
            right: 20px !important;
            width: 420px !important;
            max-height: 85vh !important;
            background: white !important;
            border: 2px solid #667eea !important;
            border-radius: 16px !important;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25) !important;
            z-index: 999999 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            display: none !important;
            overflow: hidden !important;
        }
        
        #clarifai-widget.show {
            display: block !important;
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from { transform: translateX(450px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .clarifai-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 16px;
            color: white;
        }
        
        .clarifai-header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .clarifai-title {
            font-size: 18px;
            font-weight: 700;
        }
        
        .clarifai-subtitle {
            font-size: 11px;
            opacity: 0.9;
            margin-top: 2px;
        }
        
        .clarifai-close {
            background: rgba(255,255,255,0.3) !important;
            border: 2px solid rgba(255,255,255,0.5) !important;
            color: white !important;
            font-size: 24px !important;
            font-weight: 700 !important;
            cursor: pointer !important;
            padding: 0 !important;
            border-radius: 50% !important;
            width: 36px !important;
            height: 36px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
        }
        
        .clarifai-close:hover {
            background: rgba(255,255,255,0.5) !important;
            transform: rotate(90deg) !important;
        }
        
        .clarifai-content {
            padding: 16px;
            max-height: calc(85vh - 140px);
            overflow-y: auto;
        }
        
        .clarifai-content::-webkit-scrollbar {
            width: 6px;
        }
        
        .clarifai-content::-webkit-scrollbar-thumb {
            background: #667eea;
            border-radius: 3px;
        }
        
        .clarifai-claim-card {
            background: white;
            border-radius: 12px;
            padding: 14px;
            margin-bottom: 12px;
            border-left: 4px solid #6b7280;
            box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        }
        
        .claim-true { border-left-color: #10b981; background: #f0fdf4; }
        .claim-false { border-left-color: #ef4444; background: #fef2f2; }
        .claim-partially_true { border-left-color: #f59e0b; background: #fffbeb; }
        .claim-unverifiable { border-left-color: #6b7280; background: #f9fafb; }
        
        .claim-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .claim-prediction {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 700;
            font-size: 12px;
            text-transform: uppercase;
        }
        
        .claim-confidence {
            font-size: 11px;
            padding: 3px 10px;
            border-radius: 12px;
            font-weight: 600;
        }
        
        .claim-text {
            font-size: 13px;
            line-height: 1.5;
            color: #374151;
            margin-bottom: 10px;
        }
        
        .claim-explanation {
            font-size: 11px;
            color: #6b7280;
            background: rgba(107, 114, 128, 0.05);
            padding: 8px;
            border-radius: 6px;
            margin-bottom: 10px;
        }
        
        .verification-sources {
            background: #f9fafb;
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid #e5e7eb;
        }
        
        .sources-title {
            font-size: 10px;
            font-weight: 700;
            color: #374151;
            margin-bottom: 8px;
            text-transform: uppercase;
        }
        
        .source-item {
            background: white;
            padding: 8px;
            border-radius: 6px;
            margin-bottom: 6px;
            border-left: 3px solid #667eea;
        }
        
        .source-name {
            font-size: 11px;
            font-weight: 700;
            color: #374151;
        }
        
        .source-context {
            font-size: 10px;
            color: #6b7280;
            line-height: 1.4;
            margin-top: 4px;
        }
        
        .source-reliability {
            display: inline-block;
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 8px;
            font-weight: 700;
            margin-left: 6px;
        }
        
        .button-wrong {
            width: 100%;
            padding: 10px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        
        .button-wrong:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }
        
        .no-feedback {
            text-align: center;
            padding: 8px;
            background: #f3f4f6;
            border-radius: 6px;
            font-size: 11px;
            color: #6b7280;
            font-style: italic;
        }
        
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(102, 126, 234, 0.1);
            border-top-color: #667eea;
            border-radius: 50%;
            margin: 0 auto 12px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .status-message {
            text-align: center;
            padding: 30px 20px;
            color: #6b7280;
        }
        
        .status-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }
        
        .status-title {
            font-size: 16px;
            font-weight: 700;
            color: #374151;
            margin-bottom: 6px;
        }
        
        .status-subtitle {
            font-size: 12px;
        }
        
        .summary-badge {
            background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
            border: 2px solid #667eea40;
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 16px;
            text-align: center;
        }
        
        .summary-title {
            font-weight: 700;
            color: #667eea;
            font-size: 14px;
        }
        
        .summary-subtitle {
            font-size: 10px;
            color: #6b7280;
            margin-top: 2px;
        }
        
        .youtube-badge {
            background: #ff0000;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            display: inline-block;
            margin-bottom: 8px;
        }
    `;
    document.head.appendChild(style);
    
    
    const widget = document.createElement('div');
    widget.id = 'clarifai-widget';
    widget.innerHTML = `
        <div class="clarifai-header">
            <div class="clarifai-header-content">
                <div>
                    <div class="clarifai-title">🔍 ClarifAI</div>
                    <div class="clarifai-subtitle">Advanced Fact Checker</div>
                </div>
                <button class="clarifai-close" id="clarifai-close" type="button">×</button>
            </div>
        </div>
        <div class="clarifai-content" id="clarifai-content">
            <div class="status-message">
                <div class="loading-spinner"></div>
                <div class="status-title">Initializing</div>
                <div class="status-subtitle">Connecting to API...</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(widget);
    
    document.getElementById('clarifai-close').onclick = function() {
        isManuallyHidden = true;
        widget.classList.remove('show');
        setTimeout(() => {
            widget.style.display = 'none';
        }, 300);
    };
    
    
    function showWidget() {
        if (!isManuallyHidden) {
            widget.style.display = 'block';
            setTimeout(() => widget.classList.add('show'), 10);
        }
    }
    
    function hideWidget() {
        widget.classList.remove('show');
        setTimeout(() => widget.style.display = 'none', 300);
    }
    
    function showLoading(message = "Analyzing Content") {
        const contentDiv = document.getElementById('clarifai-content');
        contentDiv.innerHTML = `
            <div class="status-message">
                <div class="loading-spinner"></div>
                <div class="status-title">${message}</div>
                <div class="status-subtitle">Please wait...</div>
            </div>
        `;
        showWidget();
    }
    
    function createClaimCard(result, index, isYouTube = false) {
        const prediction = result.prediction || 'unverifiable';
        const confidence = result.confidence || 0.5;
        
        const styles = {
            'true': { color: '#10b981', icon: '✅', label: 'VERIFIED TRUE' },
            'false': { color: '#ef4444', icon: '❌', label: 'FALSE' },
            'partially_true': { color: '#f59e0b', icon: '⚠️', label: 'PARTIALLY TRUE' },
            'unverifiable': { color: '#6b7280', icon: '❓', label: 'UNVERIFIABLE' }
        };
        
        const style = styles[prediction] || styles.unverifiable;
        const showWrongButton = prediction !== 'unverifiable';
        
        // Sources HTML
        let sourcesHTML = '';
        if (result.sources && result.sources.length > 0) {
            sourcesHTML = '<div class="verification-sources"><div class="sources-title">📚 VERIFICATION SOURCES</div>';
            result.sources.forEach(src => {
                const reliabilityColor = {
                    'high': '#10b981',
                    'medium': '#f59e0b',
                    'low': '#6b7280'
                }[src.reliability || 'medium'];
                
                sourcesHTML += `
                    <div class="source-item">
                        <div class="source-name">${src.name || 'Source'}
                            <span class="source-reliability" style="background: ${reliabilityColor}20; color: ${reliabilityColor}">
                                ${(src.reliability || 'MEDIUM').toUpperCase()}
                            </span>
                        </div>
                        <div class="source-context">${src.context || ''}</div>
                    </div>
                `;
            });
            sourcesHTML += '</div>';
        }
        
        const card = document.createElement('div');
        card.className = `clarifai-claim-card claim-${prediction}`;
        card.innerHTML = `
            ${isYouTube ? '<div class="youtube-badge">📹 YOUTUBE</div>' : ''}
            <div class="claim-header">
                <div class="claim-prediction" style="color: ${style.color}">
                    <span>${style.icon}</span>
                    <span>${style.label}</span>
                </div>
                <div class="claim-confidence" style="background: ${style.color}20; color: ${style.color}">
                    ${Math.round(confidence * 100)}%
                </div>
            </div>
            <div class="claim-text">${result.claim}</div>
            ${result.explanation ? `<div class="claim-explanation">${result.explanation}</div>` : ''}
            ${result.verification_context ? `
                <div style="background: #e0e7ff; padding: 8px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #667eea;">
                    <div style="font-size: 10px; font-weight: 700; color: #667eea; margin-bottom: 4px;">🔍 VERIFICATION</div>
                    <div style="font-size: 11px; color: #374151;">${result.verification_context}</div>
                </div>
            ` : ''}
            ${sourcesHTML}
            ${showWrongButton ? `
                <button class="button-wrong" data-index="${index}">
                    ❌ Report Wrong Claim
                </button>
            ` : '<div class="no-feedback">ℹ️ This claim could not be verified</div>'}
        `;
        
        return card;
    }

    // DISPLAY RESULTS
    function displayResults(data, isYouTube = false) {
        const contentDiv = document.getElementById('clarifai-content');
        contentDiv.innerHTML = '';
        
        if (!data.results || data.results.length === 0) {
            contentDiv.innerHTML = `
                <div class="status-message">
                    <div class="status-icon">📋</div>
                    <div class="status-title">No Claims Found</div>
                    <div class="status-subtitle">No verifiable claims detected</div>
                </div>
            `;
            showWidget();
            return;
        }
        
        // Summary
        const summary = document.createElement('div');
        summary.className = 'summary-badge';
        summary.innerHTML = `
            <div class="summary-title">${data.results.length} Claim${data.results.length > 1 ? 's' : ''} Analyzed</div>
            <div class="summary-subtitle">${isYouTube ? '📹 YouTube Video' : window.location.hostname}</div>
        `;
        contentDiv.appendChild(summary);
        
        // Claims
        data.results.forEach((result, index) => {
            const card = createClaimCard(result, index, isYouTube);
            contentDiv.appendChild(card);
            
            // Attach button listener
            const btn = card.querySelector('.button-wrong');
            if (btn) {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.innerHTML = '⏳ Submitting...';
                    
                    const success = await submitFeedback(
                        result.claim,
                        result.prediction,
                        result.confidence,
                        isYouTube ? data.video_id || "" : "",
                        isYouTube ? data.url || window.location.href : window.location.href
                    );
                    
                    if (success) {
                        btn.innerHTML = '✅ Submitted';
                        btn.style.background = '#10b981';
                    } else {
                        btn.innerHTML = '❌ Failed';
                        btn.disabled = false;
                    }
                });
            }
        });
        
        showWidget();
    }
    
    
    async function submitFeedback(claim, prediction, confidence, videoId, videoUrl) {
        try {
            const response = await fetch(`${API_BASE}/api/submit-feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    claim: claim,
                    prediction: prediction,
                    feedback_type: "wrong_claim",
                    user_correction: "user_disagreement",
                    confidence: confidence,
                    video_id: videoId,
                    video_url: videoUrl,
                    source: videoId ? "youtube" : "web"
                })
            });
            return response.ok;
        } catch (error) {
            console.error('Feedback failed:', error);
            return false;
        }
    }
    
    
    async function analyzeYouTube(videoId, videoUrl) {
        showLoading("Analyzing YouTube Video");
        console.log('📹 Analyzing YouTube:', videoId);
        
        try {
            const response = await fetch(`${API_BASE}/api/analyze-youtube`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_id: videoId,
                    url: videoUrl
                })
            });
            
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            
            const data = await response.json();
            
            if (data.status === "error" || data.status === "no_transcript") {
                const contentDiv = document.getElementById('clarifai-content');
                contentDiv.innerHTML = `
                    <div class="status-message">
                        <div class="status-icon">🔇</div>
                        <div class="status-title">No Transcript</div>
                        <div class="status-subtitle">This video doesn't have captions</div>
                    </div>
                `;
                showWidget();
                return;
            }
            
            hasAnalyzed = true;
            displayResults(data, true);
            
        } catch (error) {
            console.error('YouTube analysis failed:', error);
            const contentDiv = document.getElementById('clarifai-content');
            contentDiv.innerHTML = `
                <div class="status-message">
                    <div class="status-icon">❌</div>
                    <div class="status-title">Analysis Failed</div>
                    <div class="status-subtitle">${error.message}</div>
                </div>
            `;
            showWidget();
        }
    }
    
    
    async function analyzeRegularPage() {
        showLoading("Analyzing Page");
        console.log('📄 Analyzing regular page');
        
        try {
            const text = extractPageContent();
            
            if (!text || text.length < 100) {
                const contentDiv = document.getElementById('clarifai-content');
                contentDiv.innerHTML = `
                    <div class="status-message">
                        <div class="status-icon">📄</div>
                        <div class="status-title">Insufficient Content</div>
                        <div class="status-subtitle">Not enough text found</div>
                    </div>
                `;
                showWidget();
                return;
            }
            
            console.log(`📊 Sending ${text.length} characters for analysis`);
            
            const response = await fetch(`${API_BASE}/api/analyze-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.substring(0, 3000) })
            });
            
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            
            const data = await response.json();
            hasAnalyzed = true;
            displayResults(data, false);
            
        } catch (error) {
            console.error('Page analysis failed:', error);
            const contentDiv = document.getElementById('clarifai-content');
            contentDiv.innerHTML = `
                <div class="status-message">
                    <div class="status-icon">❌</div>
                    <div class="status-title">Analysis Failed</div>
                    <div class="status-subtitle">${error.message}</div>
                </div>
            `;
            showWidget();
        }
    }
    
    
    async function initialize() {
        if (isManuallyHidden) return;
        
        console.log('🚀 ClarifAI initializing...');
        
        // Check API
        try {
            const health = await fetch(`${API_BASE}/health`);
            if (!health.ok) throw new Error('API not ready');
        } catch (error) {
            const contentDiv = document.getElementById('clarifai-content');
            contentDiv.innerHTML = `
                <div class="status-message">
                    <div class="status-icon">❌</div>
                    <div class="status-title">API Not Connected</div>
                    <div class="status-subtitle">Start backend: uvicorn main:app --port 8000</div>
                </div>
            `;
            showWidget();
            return;
        }
        
        // Wait for page
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // YouTube or regular page
        if (isYouTubePage()) {
            const videoId = extractVideoId(window.location.href);
            if (videoId) {
                await analyzeYouTube(videoId, window.location.href);
            }
        } else {
            await analyzeRegularPage();
        }
    }
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    
    // URL changes (YouTube SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (isYouTubePage() && !isManuallyHidden) {
                hasAnalyzed = false;
                processedElements.clear();
                setTimeout(() => {
                    const videoId = extractVideoId(window.location.href);
                    if (videoId) analyzeYouTube(videoId, window.location.href);
                }, 1500);
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
    
    // Store selected text for popup
    document.addEventListener("mouseup", () => {
        const sel = window.getSelection().toString().trim();
        if (sel && sel.length > 20) {
            chrome.storage.local.set({ clarif_selected_text: sel });
            console.log('📝 Stored selected text:', sel.substring(0, 50) + '...');
        }
    });
    
    // Extension messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('📨 Message received:', request.action);
        
        if (request.action === "toggleWidget") {
            if (widget.style.display === 'none') {
                isManuallyHidden = false;
                showWidget();
                if (!hasAnalyzed) initialize();
            } else {
                isManuallyHidden = true;
                hideWidget();
            }
            sendResponse({ success: true });
        }
        
        if (request.action === "analyzePage") {
            isManuallyHidden = false;
            hasAnalyzed = false;
            processedElements.clear();
            initialize();
            sendResponse({ success: true });
        }
        
        return true;
    });
    
    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initialize, 1000));
    } else {
        setTimeout(initialize, 1000);
    }
    
    console.log('✅ ClarifAI Ready');
    
})();