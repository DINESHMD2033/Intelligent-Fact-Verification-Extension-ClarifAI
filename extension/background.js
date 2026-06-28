// ClarifAI Background Service Worker - Enhanced

const API_BASE = "http://127.0.0.1:8000";

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    if (message.type === "analyze_text") {
        fetch(`${API_BASE}/api/analyze-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message.text })
        })
        .then(res => res.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
        
        return true;
    }
    
    if (message.type === "analyze_youtube") {
        fetch(`${API_BASE}/api/analyze-youtube`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                video_id: message.video_id, 
                url: message.url 
            })
        })
        .then(res => res.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
        
        return true;
    }
    
    if (message.type === "submit_feedback") {
        fetch(`${API_BASE}/api/submit-feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message.data)
        })
        .then(res => res.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
        
        return true;
    }
});

// Handle extension icon click - toggle widget
chrome.action.onClicked.addListener(async (tab) => {
    console.log('Extension icon clicked on tab:', tab.id);
    
    try {
        // Send message to content script to toggle widget
        await chrome.tabs.sendMessage(tab.id, { action: "toggleWidget" });
    } catch (error) {
        console.error('Failed to toggle widget:', error);
    }
});

// Log extension startup
console.log('🔍 ClarifAI Background Service Worker initialized');