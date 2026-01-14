// Background Service Worker - Central message router, API caller, and side panel controller

import { 
  ExtensionMessage, 
  SaveSnippetRequest, 
  SaveResultMessage,
  StateUpdateMessage,
  QueueItem,
  SnippetResponse,
  CONFIG 
} from "../shared/types";
import { 
  enqueue, 
  dequeue, 
  getQueue, 
  updateItemStatus, 
  getPendingItems,
  isDuplicate 
} from "../shared/storage";

// Track active processing to prevent duplicate requests
const processingIds = new Set<string>();

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Background] Extension installed");
  
  // Create context menu for saving selections
  chrome.contextMenus.create({
    id: "save-selection",
    title: "Save to Knowledge Vault",
    contexts: ["selection"],
  });
  
  // Set side panel behavior - open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Handle action click (extension icon) - open side panel
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-selection" && info.selectionText && tab?.url) {
    const payload = {
      text: info.selectionText,
      sourceUrl: tab.url,
      sourceTitle: tab.title || "",
      sourceDomain: extractDomain(tab.url),
    };
    
    await handleSaveSnippet(payload);
    
    // Send feedback to content script
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "CONTEXT_MENU_SAVE",
        payload,
      }).catch(() => {});
    }
  }
});

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.log("[Background] Received message:", message.type);
  
  switch (message.type) {
    case "SAVE_SNIPPET":
      handleSaveSnippet(message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    case "SYNC_STATE":
      handleSyncState()
        .then(state => sendResponse(state))
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case "RETRY_FAILED":
      retryQueueItem(message.payload.queueId)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    case "CLEAR_FAILED":
      dequeue(message.payload.queueId)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    case "OPEN_SIDE_PANEL":
      if (sender.tab?.id) {
        chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      sendResponse({ success: true });
      return true;
  }
});

// Handle save snippet request
async function handleSaveSnippet(
  payload: SaveSnippetRequest["payload"]
): Promise<{ status: "pending" | "error"; queueId?: string; error?: string }> {
  console.log("[Background] handleSaveSnippet called with:", { 
    textLength: payload.text?.length, 
    sourceUrl: payload.sourceUrl 
  });
  
  // Validate selection
  if (!payload.text || payload.text.length < CONFIG.MIN_SELECTION_LENGTH) {
    console.log("[Background] Validation failed: text too short");
    return { status: "error", error: "Selection too short (minimum 10 characters)" };
  }
  
  if (payload.text.length > CONFIG.MAX_SELECTION_LENGTH) {
    console.log("[Background] Validation failed: text too long");
    return { status: "error", error: "Selection too long (maximum 10,000 characters)" };
  }
  
  // Check for duplicates
  if (await isDuplicate(payload.text, payload.sourceUrl)) {
    console.log("[Background] Validation failed: duplicate");
    return { status: "error", error: "This snippet was already saved recently" };
  }
  
  // Add to queue
  console.log("[Background] Adding to queue...");
  const queueItem = await enqueue({ payload });
  console.log("[Background] Queue item created:", queueItem.id);
  
  // Process immediately (async, don't wait)
  processQueueItem(queueItem).catch(err => {
    console.error("[Background] Failed to process queue item:", err);
  });
  
  return { status: "pending", queueId: queueItem.id };
}

// Process a single queue item
async function processQueueItem(item: QueueItem): Promise<void> {
  console.log("[Background] processQueueItem started:", item.id);
  
  if (processingIds.has(item.id)) {
    console.log("[Background] Already processing:", item.id);
    return;
  }
  processingIds.add(item.id);
  
  try {
    await updateItemStatus(item.id, "saving");
    
    const url = `${CONFIG.API_BASE_URL}/api/snippets`;
    console.log("[Background] Sending POST to:", url);
    
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Origin": `chrome-extension://${chrome.runtime.id}`
        },
        body: JSON.stringify({
          text: item.payload.text,
          sourceUrl: item.payload.sourceUrl,
          sourceTitle: item.payload.sourceTitle,
        }),
      },
      item.retryCount
    );
    
    console.log("[Background] Response status:", response.status);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    const snippet: SnippetResponse = await response.json();
    console.log("[Background] Snippet saved:", snippet.id);
    
    // Success - remove from queue
    await dequeue(item.id);
    
    // Notify ALL contexts of success
    broadcastMessage({
      type: "SAVE_RESULT",
      payload: {
        success: true,
        snippetId: snippet.id,
        originalText: item.payload.text,
        queueId: item.id,
      },
    });
    
    // Also broadcast state update
    const state = await handleSyncState();
    broadcastMessage({
      type: "STATE_UPDATE",
      payload: state,
    });
    
    console.log("[Background] Snippet saved successfully:", snippet.id);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Background] Failed to save snippet:", errorMessage, error);
    
    if (item.retryCount < CONFIG.MAX_RETRIES && isRetryableError(error)) {
      await updateItemStatus(item.id, "pending", errorMessage);
      
      const delay = Math.min(
        CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, item.retryCount),
        CONFIG.MAX_RETRY_DELAY_MS
      );
      
      setTimeout(() => {
        retryQueueItem(item.id);
      }, delay);
      
    } else {
      await updateItemStatus(item.id, "failed", errorMessage);
      
      broadcastMessage({
        type: "SAVE_RESULT",
        payload: {
          success: false,
          error: errorMessage,
          originalText: item.payload.text,
          queueId: item.id,
        },
      });
      
      const state = await handleSyncState();
      broadcastMessage({
        type: "STATE_UPDATE",
        payload: state,
      });
    }
  } finally {
    processingIds.delete(item.id);
  }
}

// Retry a failed queue item
async function retryQueueItem(queueId: string): Promise<void> {
  const queue = await getQueue();
  const item = queue.find(q => q.id === queueId);
  
  if (item && (item.status === "pending" || item.status === "failed")) {
    await processQueueItem(item);
  }
}

// Fetch with timeout
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  retryCount: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// Check if error is retryable
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("network")) {
      return true;
    }
    if (error.message.includes("HTTP 5")) {
      return true;
    }
  }
  return false;
}

// Broadcast message to all extension contexts
function broadcastMessage(message: SaveResultMessage | StateUpdateMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// Handle sync state request
async function handleSyncState(): Promise<StateUpdateMessage["payload"]> {
  const queue = await getQueue();
  
  return {
    pendingCount: queue.filter(q => q.status === "pending" || q.status === "saving").length,
    recentSaves: queue.slice(-10).map(item => ({
      id: item.id,
      text: item.payload.text.slice(0, 100),
      sourceDomain: item.payload.sourceDomain,
      status: item.status === "saving" ? "pending" : item.status,
    })),
  };
}

// Process pending items on startup
async function processPendingOnStartup(): Promise<void> {
  const pending = await getPendingItems();
  
  for (const item of pending) {
    await new Promise(resolve => setTimeout(resolve, 500));
    await processQueueItem(item);
  }
}

// Extract domain from URL
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Listen for online/offline events
self.addEventListener("online", () => {
  console.log("[Background] Back online, processing pending items");
  processPendingOnStartup();
});

// Process pending on service worker startup
processPendingOnStartup();
