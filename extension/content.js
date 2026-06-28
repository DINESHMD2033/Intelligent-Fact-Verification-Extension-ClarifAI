// ClarifAI Browser Extension - Content Script (Clean Version)
const API_URL = "https://52a4-205-254-169-207.ngrok-free.app";

class ClarifAIExtension {
    constructor() {
        this.isActive = true;
        this.processedElements = new Set();
        this.hasAnalyzed = false;
        this.analysisAttempts = 0;
        this.init();
    }

    init() {
        console.log('🔍 ClarifAI Extension Initialized');
        this.injectStyles();
        this.createWidget();
        this.checkAPIConnection();
        this.startMonitoring();
        this.setupMessageListener();
    }

    async checkAPIConnection() {
        try {
            const response = await fetch(`${API_URL}/health`, { method: 'GET' });
            if (response.ok) {
                console.log('✅ API Connection Successful');
                this.showConnectionStatus(true);
                setTimeout(() => this.analyzePageContent(), 2000);
            } else {
                console.error('❌ API Connection Failed');
                this.showConnectionStatus(false);
            }
        } catch (error) {
            console.error('❌ API Connection Error:', error);
            this.showConnectionStatus(false);
        }
    }

    showConnectionStatus(connected) {
        const contentDiv = document.getElementById('clarifai-content');
        if (!contentDiv) return;

        if (connected) {
            contentDiv.innerHTML = `
                <div style="text-align: center; color: #10b981; padding: 20px;">
                    <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
                    <div style="font-weight: 600;">Connected to API</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">Analyzing page content...</div>
                </div>
            `;
        } else {
            contentDiv.innerHTML = `
                <div style="text-align: center; color: #ef4444; padding: 20px;">
                    <div style="font-size: 40px; margin-bottom: 12px;">❌</div>
                    <div style="font-weight: 600;">API Disconnected</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">
                        Start backend: <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">uvicorn main:app --reload --port 8000</code>
                    </div>
                </div>
            `;
        }
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #clarifai-widget {
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                width: 420px !important;
                max-height: 600px !important;
                background: white !important;
                border: 2px solid #667eea !important;
                border-radius: 12px !important;
                box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important;
                z-index: 10000 !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                display: block !important;
                animation: slideIn 0.3s ease-out;
                overflow: hidden !important;
            }
            
            @keyframes slideIn {
                from { transform: translateX(450px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            .clarifai-claim-card {
                background: white;
                border-radius: 8px;
                padding: 14px;
                margin: 12px 0;
                border-left: 4px solid;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
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
                font-size: 13px;
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
                font-size: 12px;
                color: #6b7280;
                margin-bottom: 10px;
                padding: 8px;
                background: rgba(0,0,0,0.03);
                border-radius: 6px;
                font-style: italic;
            }
            
            .claim-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
                color: #9ca3af;
                margin-top: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    createWidget() {
        const existingWidget = document.getElementById('clarifai-widget');
        if (existingWidget) existingWidget.remove();

        this.widget = document.createElement('div');
        this.widget.id = 'clarifai-widget';
        this.widget.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; border-radius: 10px 10px 0 0;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 700; font-size: 16px;">🔍 ClarifAI</div>
                        <div style="font-size: 12px; opacity: 0.9;">Fact Checker</div>
                    </div>
                    <button id="clarifai-close" style="background: rgba(255,255,255,0.2); border: none; color: white; font-size: 20px; cursor: pointer; padding: 4px 10px; border-radius: 6px; width: 32px; height: 32px; transition: background 0.2s;">×</button>
                </div>
            </div>
            <div id="clarifai-content" style="padding: 16px; max-height: 500px; overflow-y: auto;">
                <div style="text-align: center; color: #6b7280; padding: 20px;">
                    <div style="margin-bottom: 8px;">🔄 Initializing...</div>
                </div>
            </div>
            <div style="padding: 12px 16px; border-top: 1px solid #e5e7eb; background: #f9fafb; border-radius: 0 0 10px 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 11px; color: #6b7280;">AI-Powered Verification</div>
                    <button id="clarifai-retry" style="background: #667eea; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">🔄 Retry</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.widget);

        document.getElementById('clarifai-close').onclick = () => this.hideWidget();
        document.getElementById('clarifai-retry').onclick = () => {
            this.hasAnalyzed = false;
            this.analysisAttempts = 0;
            this.processedElements.clear();
            this.analyzePageContent();
        };
    }

    startMonitoring() {
        const observer = new MutationObserver((mutations) => {
            if (!this.hasAnalyzed && this.analysisAttempts < 3) {
                clearTimeout(this.analysisTimer);
                this.analysisTimer = setTimeout(() => this.analyzePageContent(), 1500);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    analyzePageContent() {
        if (this.hasAnalyzed) return;

        this.analysisAttempts++;
        console.log(`🔍 Analysis attempt ${this.analysisAttempts}/3`);

        try {
            const selectors = [
                'article', 'main', '.post-content', '.article-content', '.entry-content', '.content',
                'p', 'h1', 'h2', 'h3', '[class*="article"]', '[class*="post"]', '[class*="content"]', 'blockquote'
            ];
            
            let textContent = '';
            const seenTexts = new Set();
            
            selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const text = el.textContent.trim();
                        if (text.length >= 30 && !seenTexts.has(text)) {
                            textContent += text + ' ';
                            seenTexts.add(text);
                        }
                    });
                } catch (e) {}
            });

            textContent = textContent.trim();
            console.log(`📊 Extracted ${textContent.length} characters`);

            if (textContent.length > 50) {
                this.hasAnalyzed = true;
                this.sendForAnalysis(textContent.substring(0, 3000));
            } else {
                if (this.analysisAttempts < 3) {
                    setTimeout(() => this.analyzePageContent(), 2000);
                } else {
                    this.showNoContent();
                }
            }
        } catch (error) {
            console.error('Error analyzing page:', error);
            this.showError('Analysis failed');
        }
    }

    async sendForAnalysis(text) {
        try {
            this.showLoading();
            
            const response = await fetch(`${API_URL}/api/analyze-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (response.ok) {
                const data = await response.json();
                this.displayAnalysisResults(data);
            } else {
                this.showError('Analysis failed');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            this.showError('Connection failed');
        }
    }

    displayAnalysisResults(data) {
        const contentDiv = document.getElementById('clarifai-content');
        
        if (!data.results || data.results.length === 0) {
            contentDiv.innerHTML = `
                <div style="text-align: center; color: #6b7280; padding: 25px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                    <div style="font-weight: 600; font-size: 15px; margin-bottom: 8px;">No Verifiable Claims</div>
                    <div style="font-size: 12px; line-height: 1.5;">No fact-checkable claims found</div>
                </div>
            `;
            return;
        }

        let html = `
            <div style="text-align: center; margin-bottom: 16px; padding: 12px; background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%); border-radius: 8px; border: 1px solid #667eea40;">
                <div style="font-weight: 700; color: #667eea; font-size: 16px;">${data.results.length} Claim${data.results.length > 1 ? 's' : ''} Analyzed</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">${window.location.hostname}</div>
            </div>
        `;

        data.results.forEach(result => {
            html += this.createClaimCard(result);
        });

        contentDiv.innerHTML = html;
        this.showWidget();
    }

    createClaimCard(result) {
        const prediction = result.prediction || 'unverifiable';
        const confidence = result.confidence || 0.5;
        
        const styles = {
            'true': { color: '#10b981', icon: '✅', label: 'VERIFIED TRUE' },
            'false': { color: '#ef4444', icon: '❌', label: 'FALSE' },
            'partially_true': { color: '#f59e0b', icon: '⚠️', label: 'PARTIALLY TRUE' },
            'unverifiable': { color: '#6b7280', icon: '❓', label: 'UNVERIFIABLE' }
        };
        
        const style = styles[prediction] || styles.unverifiable;

        return `
            <div class="clarifai-claim-card claim-${prediction}">
                <div class="claim-header">
                    <div class="claim-prediction" style="color: ${style.color}">
                        ${style.icon} ${style.label}
                    </div>
                    <div class="claim-confidence" style="background: ${style.color}20; color: ${style.color}">
                        ${Math.round(confidence * 100)}%
                    </div>
                </div>
                <div class="claim-text">${result.claim}</div>
                ${result.explanation ? `<div class="claim-explanation">${result.explanation}</div>` : ''}
                <div class="claim-footer">
                    <span>⏱️ ${(result.processing_time * 1000 || 300).toFixed(0)}ms</span>
                    <span style="color: #10b981;">✓ Analyzed</span>
                </div>
            </div>
        `;
    }

    showLoading() {
        const contentDiv = document.getElementById('clarifai-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 30px;">
                <div style="width: 50px; height: 50px; border: 4px solid #e5e7eb; border-top-color: #667eea; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
                <div style="font-weight: 600; margin-bottom: 8px; font-size: 15px;">🔍 Analyzing Content</div>
                <div style="font-size: 12px;">Checking factual claims...</div>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
        this.showWidget();
    }

    showWidget() {
        if (this.widget) {
            this.widget.style.display = 'block';
        }
    }

    hideWidget() {
        if (this.widget) {
            this.widget.style.display = 'none';
        }
    }

    showNoContent() {
        const contentDiv = document.getElementById('clarifai-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 25px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 8px;">No Content Found</div>
                <div style="font-size: 12px; line-height: 1.5;">
                    Not enough text to analyze<br>Try a news article or blog post
                </div>
            </div>
        `;
    }

    showError(message) {
        const contentDiv = document.getElementById('clarifai-content');
        contentDiv.innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 25px;">
                <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                <div style="font-weight: 600; margin-bottom: 8px; font-size: 15px;">${message}</div>
                <div style="font-size: 12px; color: #6b7280; margin: 12px 0;">
                    Start backend:<br>
                    <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 11px;">uvicorn main:app --reload --port 8000</code>
                </div>
            </div>
        `;
        this.showWidget();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "toggleWidget") {
                if (this.widget.style.display === 'none') {
                    this.showWidget();
                    if (!this.hasAnalyzed) {
                        this.analyzePageContent();
                    }
                } else {
                    this.hideWidget();
                }
            }
            if (request.action === "analyzePage") {
                this.hasAnalyzed = false;
                this.analysisAttempts = 0;
                this.analyzePageContent();
            }
        });
    }
}

if (!window.location.hostname.includes('youtube.com')) {
    const clarifAI = new ClarifAIExtension();
    console.log('✅ ClarifAI Extension Ready');
}