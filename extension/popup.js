// ClarifAI Popup Script - Enhanced Version

const API_BASE = "https://52a4-205-254-169-207.ngrok-free.app";

const verifyBtn = document.getElementById("verify-btn");
const analyzePageBtn = document.getElementById("analyze-page-btn");
const toggleWidgetBtn = document.getElementById("toggle-widget-btn");
const testClaimInput = document.getElementById("test-claim");
const resultDiv = document.getElementById("result");
const statusDiv = document.getElementById("status");

let lastResult = null;

// Load selected text from page automatically
async function loadSelectedText() {
    if (chrome && chrome.storage) {
        chrome.storage.local.get("clarif_selected_text", (data) => {
            if (data && data.clarif_selected_text) {
                testClaimInput.value = data.clarif_selected_text;
                console.log('✅ Auto-filled selected text');
                // Clear after loading
                chrome.storage.local.remove("clarif_selected_text");
            }
        });
    }
}

// Check API Health
async function checkAPIHealth() {
    try {
        const res = await fetch(`${API_BASE}/health`, { method: "GET" });
        if (!res.ok) throw new Error("API not healthy");
        const data = await res.json();
        showStatus(true);
        return data;
    } catch (e) {
        showStatus(false);
        return null;
    }
}

// Show connection status
function showStatus(connected) {
    statusDiv.style.display = "flex";
    if (connected) {
        statusDiv.className = "status connected";
        statusDiv.innerHTML = "✅ Connected to ClarifAI API";
    } else {
        statusDiv.className = "status disconnected";
        statusDiv.innerHTML = "❌ API Disconnected - Start backend server";
    }
}

// Load selected text from page
async function loadSelectedText() {
    if (chrome && chrome.storage) {
        chrome.storage.local.get("clarif_selected_text", (data) => {
            if (data && data.clarif_selected_text) {
                testClaimInput.value = data.clarif_selected_text;
                chrome.storage.local.remove("clarif_selected_text");
            }
        });
    }
}

// Verify claim
async function verifyClaim(claim) {
    resultDiv.style.display = "block";
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="loading"></div>
            <div style="margin-top: 12px; color: #6b7280; font-size: 13px;">Analyzing claim...</div>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE}/api/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claim: claim })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.status }));
            throw new Error(error.detail || "Verification failed");
        }
        
        const data = await response.json();
        displayResult(data);
        lastResult = data;
        
        // Save for feedback
        chrome.storage.local.set({ 
            clarif_last_result: { 
                claim: data.claim, 
                prediction: data.prediction, 
                confidence: data.confidence 
            } 
        });
        
    } catch (error) {
        resultDiv.className = "result";
        resultDiv.innerHTML = `
            <div style="color: #ef4444; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
                <div style="font-weight: 600; margin-bottom: 4px;">Analysis Failed</div>
                <div style="font-size: 12px;">${error.message}</div>
            </div>
        `;
    }
}

// Display result
function displayResult(data) {
    const prediction = data.prediction || 'unverifiable';
    const confidence = data.confidence || 0.5;
    
    const styles = {
        'true': { color: '#10b981', icon: '✅', label: 'VERIFIED TRUE' },
        'false': { color: '#ef4444', icon: '❌', label: 'FALSE' },
        'partially_true': { color: '#f59e0b', icon: '⚠️', label: 'PARTIALLY TRUE' },
        'unverifiable': { color: '#6b7280', icon: '❓', label: 'UNVERIFIABLE' }
    };
    
    const style = styles[prediction] || styles.unverifiable;
    
    // Build sources HTML
    let sourcesHTML = '';
    if (data.sources && data.sources.length > 0) {
        sourcesHTML = '<div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-top: 12px; border: 1px solid #e5e7eb;">';
        sourcesHTML += '<div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 8px;">📚 VERIFICATION SOURCES</div>';
        
        data.sources.forEach(src => {
            const reliabilityColor = {
                'high': '#10b981',
                'medium': '#f59e0b',
                'low': '#6b7280'
            }[src.reliability || 'medium'];
            
            sourcesHTML += `
                <div style="background: white; padding: 8px; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid #667eea;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 11px; font-weight: 700; color: #374151;">${src.name || 'Source'}</span>
                        <span style="font-size: 9px; padding: 2px 6px; border-radius: 8px; font-weight: 700; background: ${reliabilityColor}20; color: ${reliabilityColor}">
                            ${(src.reliability || 'medium').toUpperCase()}
                        </span>
                    </div>
                    <div style="font-size: 10px; color: #6b7280; line-height: 1.4;">${src.context || 'No details available'}</div>
                    ${src.url ? `<a href="${src.url}" target="_blank" style="font-size: 9px; color: #667eea; text-decoration: none; display: inline-block; margin-top: 4px;">🔗 View Source</a>` : ''}
                </div>
            `;
        });
        
        sourcesHTML += '</div>';
    }
    
    // Build verification context
    let verificationHTML = '';
    if (data.verification_context) {
        verificationHTML = `
            <div style="background: linear-gradient(135deg, #e0e7ff 0%, #f3f4f6 100%); padding: 10px; border-radius: 8px; margin-top: 12px; border-left: 3px solid #667eea;">
                <div style="font-size: 10px; font-weight: 700; color: #667eea; margin-bottom: 4px;">🔍 VERIFICATION PROCESS</div>
                <div style="font-size: 11px; color: #374151; line-height: 1.4;">${data.verification_context}</div>
            </div>
        `;
    }
    
    // Show wrong claim button only for verifiable predictions
    const showWrongButton = prediction !== 'unverifiable';
    
    resultDiv.className = `result ${prediction}`;
    resultDiv.innerHTML = `
        <div class="result-header">
            <div class="result-prediction" style="color: ${style.color}">
                <span style="font-size: 18px;">${style.icon}</span>
                ${style.label}
            </div>
            <div class="result-confidence" style="background: ${style.color}20; color: ${style.color}">
                ${Math.round(confidence * 100)}%
            </div>
        </div>
        <div class="result-explanation">
            ${data.explanation || 'Analysis completed based on available data.'}
        </div>
        ${verificationHTML}
        ${sourcesHTML}
        <div style="font-size: 11px; color: #9ca3af; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
            <strong>Analyzed Claim:</strong><br>
            ${data.claim.substring(0, 150)}${data.claim.length > 150 ? '...' : ''}
        </div>
        ${showWrongButton ? `
            <button id="wrong-claim-btn" class="btn-wrong-claim">
                ❌ Report Wrong Claim
            </button>
        ` : `
            <div style="text-align: center; padding: 10px; background: #f3f4f6; border-radius: 8px; margin-top: 12px; font-size: 11px; color: #6b7280; font-style: italic;">
                ℹ️ This claim could not be verified - no feedback needed
            </div>
        `}
    `;
    
    // Clear the input box after showing result
    testClaimInput.value = '';
    console.log('✅ Input cleared after prediction');
    
    // Add event listener for wrong claim button (only if it exists)
    if (showWrongButton) {
        setTimeout(() => {
            const btn = document.getElementById('wrong-claim-btn');
            if (btn) {
                btn.addEventListener('click', async () => {
                    await submitFeedback(data);
                });
            }
        }, 100);
    }
}

// Submit feedback
async function submitFeedback(data) {
    const btn = document.getElementById('wrong-claim-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Submitting...';
    
    try {
        const response = await fetch(`${API_BASE}/api/submit-feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                claim: data.claim,
                prediction: data.prediction,
                feedback_type: "wrong_claim",
                user_correction: "user_disagreement",
                confidence: data.confidence,
                video_id: "",
                video_url: window.location.href || "",
                source: "popup"
            })
        });
        
        if (response.ok) {
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            btn.innerHTML = '✅ Feedback Submitted!';
            
            setTimeout(() => {
                resultDiv.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #10b981;">
                        <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
                        <div style="font-weight: 600; margin-bottom: 8px;">Thank You!</div>
                        <div style="font-size: 13px; color: #6b7280;">Your feedback helps improve ClarifAI</div>
                    </div>
                `;
            }, 1500);
        } else {
            throw new Error("Submission failed");
        }
    } catch (error) {
        btn.disabled = false;
        btn.innerHTML = '❌ Try Again';
        alert("Failed to submit feedback. Please try again.");
    }
}

// Event listeners
verifyBtn.addEventListener("click", async () => {
    const claim = testClaimInput.value.trim();
    
    if (!claim) {
        resultDiv.style.display = "block";
        resultDiv.className = "result";
        resultDiv.innerHTML = `
            <div style="text-align: center; color: #ef4444;">
                <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
                <div style="font-weight: 600;">Please enter a claim first</div>
            </div>
        `;
        return;
    }
    
    // Check API health first
    const health = await checkAPIHealth();
    if (!health) {
        resultDiv.style.display = "block";
        resultDiv.className = "result";
        resultDiv.innerHTML = `
            <div style="text-align: center; color: #ef4444;">
                <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
                <div style="font-weight: 600; margin-bottom: 8px;">API Not Reachable</div>
                <div style="font-size: 12px; color: #6b7280;">
                    Start the backend server:<br>
                    <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-top: 8px; display: inline-block;">
                        uvicorn main:app --reload --port 8000
                    </code>
                </div>
            </div>
        `;
        return;
    }
    
    await verifyClaim(claim);
});

// Allow Enter key to submit
testClaimInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
        verifyBtn.click();
    }
});

// Analyze Current Page button
analyzePageBtn.addEventListener("click", async () => {
    analyzePageBtn.disabled = true;
    analyzePageBtn.innerHTML = '<span>⏳</span><span>Analyzing...</span>';
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        await chrome.tabs.sendMessage(tab.id, { action: "analyzePage" });
        
        analyzePageBtn.innerHTML = '<span>✅</span><span>Analysis Started!</span>';
        analyzePageBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        setTimeout(() => {
            analyzePageBtn.disabled = false;
            analyzePageBtn.innerHTML = '<span>📄</span><span>Analyze Current Page</span>';
            analyzePageBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        }, 2000);
        
    } catch (error) {
        console.error('Failed to analyze page:', error);
        analyzePageBtn.innerHTML = '<span>❌</span><span>Failed - Try Again</span>';
        analyzePageBtn.disabled = false;
    }
});

// Toggle Widget button
toggleWidgetBtn.addEventListener("click", async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: "toggleWidget" });
        
        toggleWidgetBtn.innerHTML = '<span>✅</span><span>Widget Toggled</span>';
        setTimeout(() => {
            toggleWidgetBtn.innerHTML = '<span>🔲</span><span>Toggle Extension Widget</span>';
        }, 1000);
        
    } catch (error) {
        console.error('Failed to toggle widget:', error);
    }
});

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    await loadSelectedText();
    await checkAPIHealth();
});