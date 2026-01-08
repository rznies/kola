// Content Script - Text selection detection with floating save button

import { SaveSnippetRequest, CONFIG } from "../shared/types";

// State
let saveButton: HTMLDivElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let currentSelection: { text: string; context: string } | null = null;

// Track pending saves to match broadcasts
const pendingSaves = new Map<string, string>();

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

// Create floating save button
function createSaveButton(): HTMLDivElement {
  const btn = document.createElement("div");
  btn.id = "skc-save-fab";
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
    <span>Save</span>
  `;
  
  btn.addEventListener("click", handleSaveClick);
  document.body.appendChild(btn);
  
  return btn;
}

// Position the save button near selection
function positionSaveButton(selection: Selection) {
  if (!saveButton) {
    saveButton = createSaveButton();
  }
  
  try {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Position above the selection, centered
    const buttonWidth = 80;
    const buttonHeight = 36;
    let left = rect.left + (rect.width / 2) - (buttonWidth / 2) + window.scrollX;
    let top = rect.top - buttonHeight - 8 + window.scrollY;
    
    // Keep within viewport
    left = Math.max(10, Math.min(left, window.innerWidth - buttonWidth - 10));
    if (top < window.scrollY + 10) {
      // Position below if no room above
      top = rect.bottom + 8 + window.scrollY;
    }
    
    saveButton.style.left = `${left}px`;
    saveButton.style.top = `${top}px`;
    saveButton.classList.add("visible");
    saveButton.classList.remove("saving", "success", "error");
    saveButton.querySelector("span")!.textContent = "Save";
    
  } catch (e) {
    hideSaveButton();
  }
}

// Hide the save button
function hideSaveButton() {
  if (saveButton) {
    saveButton.classList.remove("visible");
  }
}

// Handle save button click
async function handleSaveClick(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!currentSelection || !saveButton) return;
  
  // Update button state
  saveButton.classList.add("saving");
  saveButton.querySelector("span")!.textContent = "Saving...";
  
  await saveSelection(currentSelection.text, currentSelection.context);
}

// Send save request to background
async function saveSelection(text: string, context: string): Promise<void> {
  const metadata = getPageMetadata();
  
  console.log("[Content] Saving selection:", { textLength: text.length, url: metadata.url });
  
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
    console.log("[Content] Sending message to background...");
    const response = await chrome.runtime.sendMessage(message);
    console.log("[Content] Response from background:", response);
    
    if (response?.status === "pending" && response?.queueId) {
      pendingSaves.set(response.queueId, text.slice(0, 50));
      console.log("[Content] Save queued, waiting for result...");
      // Button will be updated by message listener
    } else if (response?.status === "error" || response?.error) {
      console.error("[Content] Save error:", response?.error);
      showButtonError(response?.error || "Failed to save");
    } else if (!response) {
      console.error("[Content] No response from background");
      showButtonError("Extension error");
    }
  } catch (error) {
    console.error("[Content] Failed to send message:", error);
    showButtonError("Connection failed");
  }
}

// Show success state on button
function showButtonSuccess() {
  if (!saveButton) return;
  
  saveButton.classList.remove("saving");
  saveButton.classList.add("success");
  saveButton.querySelector("span")!.textContent = "Saved!";
  
  setTimeout(() => {
    hideSaveButton();
    currentSelection = null;
  }, 1500);
}

// Show error state on button  
function showButtonError(message: string) {
  if (!saveButton) return;
  
  saveButton.classList.remove("saving");
  saveButton.classList.add("error");
  saveButton.querySelector("span")!.textContent = message.slice(0, 20);
  
  setTimeout(() => {
    hideSaveButton();
    currentSelection = null;
  }, 2000);
}

// Listen for save result broadcasts from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SAVE_RESULT" && message.payload?.queueId) {
    const { queueId, success, error } = message.payload;
    
    if (pendingSaves.has(queueId)) {
      pendingSaves.delete(queueId);
      
      if (success) {
        showButtonSuccess();
      } else {
        showButtonError(error || "Failed");
      }
    }
  }
});

// Handle selection changes
function handleSelectionChange() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideTimeout = setTimeout(hideSaveButton, 200);
    currentSelection = null;
    return;
  }
  
  const selectionData = getSelectionWithContext();
  if (!selectionData) {
    hideSaveButton();
    currentSelection = null;
    return;
  }
  
  currentSelection = selectionData;
  positionSaveButton(selection);
}

// Debounced selection handler
let selectionDebounce: ReturnType<typeof setTimeout> | null = null;
function debouncedSelectionChange() {
  if (selectionDebounce) {
    clearTimeout(selectionDebounce);
  }
  selectionDebounce = setTimeout(handleSelectionChange, 150);
}

// Handle keyboard shortcut (Ctrl/Cmd + Shift + S)
function handleKeyboard(event: KeyboardEvent): void {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  
  if (modifier && event.shiftKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    
    const selection = getSelectionWithContext();
    if (selection) {
      currentSelection = selection;
      
      // Create temporary button for feedback
      if (!saveButton) {
        saveButton = createSaveButton();
      }
      
      // Position in corner for keyboard shortcut
      saveButton.style.left = "auto";
      saveButton.style.right = "20px";
      saveButton.style.top = "auto";
      saveButton.style.bottom = "20px";
      saveButton.classList.add("visible", "saving");
      saveButton.querySelector("span")!.textContent = "Saving...";
      
      saveSelection(selection.text, selection.context);
    } else {
      showFeedback("Select some text first", "error");
    }
  }
}

// Legacy feedback toast (for keyboard shortcut errors)
function showFeedback(message: string, type: "success" | "error" | "pending"): void {
  const existing = document.getElementById("skc-feedback");
  if (existing) {
    existing.remove();
  }
  
  const feedback = document.createElement("div");
  feedback.id = "skc-feedback";
  feedback.textContent = message;
  
  const colors: Record<typeof type, string> = {
    success: "#10b981",
    error: "#ef4444",
    pending: "#6366f1",
  };
  
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
    backgroundColor: colors[type],
    color: "#ffffff",
  });
  
  document.body.appendChild(feedback);
  
  setTimeout(() => {
    if (feedback.parentNode) feedback.remove();
  }, 3000);
}

// Hide button on scroll or click elsewhere
function handleDocumentClick(e: MouseEvent) {
  if (saveButton && !saveButton.contains(e.target as Node)) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideSaveButton();
      currentSelection = null;
    }
  }
}

// Initialize content script
function initialize(): void {
  // Listen for selection changes
  document.addEventListener("selectionchange", debouncedSelectionChange);
  
  // Listen for keyboard shortcut
  document.addEventListener("keydown", handleKeyboard);
  
  // Hide on click elsewhere
  document.addEventListener("click", handleDocumentClick);
  
  // Hide on scroll (with debounce to allow for small movements)
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener("scroll", () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (!saveButton?.classList.contains("saving")) {
        hideSaveButton();
      }
    }, 100);
  }, { passive: true });
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_SELECTION") {
      const selection = getSelectionWithContext();
      sendResponse(selection);
    }
  });
  
  console.log("[Content] Knowledge Vault content script loaded with floating save button");
}

// Only initialize in top-level frames
if (window === window.top) {
  initialize();
}
