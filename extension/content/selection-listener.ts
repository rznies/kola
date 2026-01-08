// Content Script - Text selection detection and context menu support

import { SaveSnippetRequest, CONFIG } from "../shared/types";

// Debounce selection events
let selectionTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSelection = "";

// Extract page metadata
function getPageMetadata() {
  return {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname.replace(/^www\./, ""),
  };
}

// Get selection with surrounding context
function getSelectionWithContext(): { text: string; context: string } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return null;
  }
  
  const text = selection.toString().trim();
  
  if (text.length < CONFIG.MIN_SELECTION_LENGTH) {
    return null;
  }
  
  if (text.length > CONFIG.MAX_SELECTION_LENGTH) {
    return null;
  }
  
  // Try to get surrounding context
  let context = "";
  try {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const parentElement = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container as Element;
    
    if (parentElement) {
      // Get parent paragraph or similar block element
      const blockParent = parentElement.closest("p, div, article, section, li, td, blockquote");
      if (blockParent) {
        context = blockParent.textContent?.slice(0, 500) || "";
      }
    }
  } catch (e) {
    // Ignore context extraction errors
  }
  
  return { text, context };
}

// Track pending saves to match broadcasts
const pendingSaves = new Map<string, string>(); // queueId -> truncated text

// Send save request to background
async function saveSelection(text: string, context: string): Promise<void> {
  const metadata = getPageMetadata();
  
  const message: SaveSnippetRequest = {
    type: "SAVE_SNIPPET",
    payload: {
      text,
      sourceUrl: metadata.url,
      sourceTitle: metadata.title,
      sourceDomain: metadata.domain,
      selectionContext: context,
    },
  };
  
  try {
    const response = await chrome.runtime.sendMessage(message);
    
    if (response.status === "pending" && response.queueId) {
      // Save is queued, show pending feedback
      pendingSaves.set(response.queueId, text.slice(0, 50));
      showFeedback("Saving...", "pending");
    } else if (response.status === "error" || response.error) {
      // Immediate validation error
      showFeedback(response.error || "Failed to save", "error");
    }
  } catch (error) {
    console.error("[Content] Failed to send message:", error);
    showFeedback("Failed to save snippet", "error");
  }
}

// Listen for save result broadcasts from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SAVE_RESULT" && message.payload?.queueId) {
    const { queueId, success, error } = message.payload;
    
    // Only show feedback if we initiated this save
    if (pendingSaves.has(queueId)) {
      pendingSaves.delete(queueId);
      
      if (success) {
        showFeedback("Saved to Knowledge Vault", "success");
      } else {
        showFeedback(error || "Failed to save", "error");
      }
    }
  }
});

// Show visual feedback to user
function showFeedback(message: string, type: "success" | "error" | "pending"): void {
  // Remove existing feedback
  const existing = document.getElementById("skc-feedback");
  if (existing) {
    existing.remove();
  }
  
  const feedback = document.createElement("div");
  feedback.id = "skc-feedback";
  feedback.textContent = message;
  
  // Choose color based on type
  const colors: Record<typeof type, string> = {
    success: "#10b981",
    error: "#ef4444",
    pending: "#6366f1",
  };
  
  // Style the feedback toast
  Object.assign(feedback.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    padding: "12px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: "500",
    zIndex: "2147483647",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    transition: "opacity 0.3s, transform 0.3s",
    opacity: "0",
    transform: "translateY(10px)",
    backgroundColor: colors[type],
    color: "#ffffff",
  });
  
  document.body.appendChild(feedback);
  
  // Animate in
  requestAnimationFrame(() => {
    feedback.style.opacity = "1";
    feedback.style.transform = "translateY(0)";
  });
  
  // Remove after delay (longer for pending since success/error will replace it)
  const delay = type === "pending" ? 10000 : 3000;
  setTimeout(() => {
    // Only fade out if this is still the current feedback
    const current = document.getElementById("skc-feedback");
    if (current === feedback) {
      feedback.style.opacity = "0";
      feedback.style.transform = "translateY(10px)";
      setTimeout(() => {
        if (feedback.parentNode) feedback.remove();
      }, 300);
    }
  }, delay);
}

// Handle keyboard shortcut (Ctrl/Cmd + Shift + S)
function handleKeyboard(event: KeyboardEvent): void {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  
  if (modifier && event.shiftKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    
    const selection = getSelectionWithContext();
    if (selection) {
      saveSelection(selection.text, selection.context);
    } else {
      showFeedback("Select some text first", "error");
    }
  }
}

// Initialize content script
function initialize(): void {
  // Listen for keyboard shortcut
  document.addEventListener("keydown", handleKeyboard);
  
  // Listen for messages from background (e.g., context menu trigger)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_SELECTION") {
      const selection = getSelectionWithContext();
      sendResponse(selection);
    }
  });
  
  console.log("[Content] Knowledge Vault content script loaded");
}

// Only initialize in top-level frames to avoid duplicate listeners
if (window === window.top) {
  initialize();
}
