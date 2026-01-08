// Background Service Worker - Central message router and API caller

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
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.log("[Background] Received message:", message.type);
  
  switch (message.type) {
    case "SAVE_SNIPPET":
      handleSaveSnippet(message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response
      
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
  }
});

// Handle save snippet request
async function handleSaveSnippet(
  payload: SaveSnippetRequest["payload"]
): Promise<{ status: "pending" | "error"; queueId?: string; error?: string }> {
  
  // Validate selection
  if (!payload.text || payload.text.length < CONFIG.MIN_SELECTION_LENGTH) {
    return { status: "error", error: "Selection too short (minimum 10 characters)" };
  }
  
  if (payload.text.length > CONFIG.MAX_SELECTION_LENGTH) {
    return { status: "error", error: "Selection too long (maximum 10,000 characters)" };
  }
  
  // Check for duplicates
  if (await isDuplicate(payload.text, payload.sourceUrl)) {
    return { status: "error", error: "This snippet was already saved recently" };
  }
  
  // Add to queue - returns pending, not success
  const queueItem = await enqueue({ payload });
  
  // Process immediately (async, don't wait)
  // Success/failure will be broadcast when complete
  processQueueItem(queueItem).catch(err => {
    console.error("[Background] Failed to process queue item:", err);
  });
  
  // Return pending status - content script should show "Saving..."
  return { status: "pending", queueId: queueItem.id };
}

// Process a single queue item
async function processQueueItem(item: QueueItem): Promise<void> {
  // Prevent duplicate processing
  if (processingIds.has(item.id)) {
    return;
  }
  processingIds.add(item.id);
  
  try {
    await updateItemStatus(item.id, "saving");
    
    const response = await fetchWithRetry(
      `${CONFIG.API_BASE_URL}/api/snippets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: item.payload.text,
          sourceUrl: item.payload.sourceUrl,
          sourceTitle: item.payload.sourceTitle,
        }),
      },
      item.retryCount
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    const snippet: SnippetResponse = await response.json();
    
    // Success - remove from queue
    await dequeue(item.id);
    
    // Notify ALL contexts (popup and content script) of success
    broadcastMessage({
      type: "SAVE_RESULT",
      payload: {
        success: true,
        snippetId: snippet.id,
        originalText: item.payload.text,
        queueId: item.id,
      },
    });
    
    // Also broadcast state update for popup
    const state = await handleSyncState();
    broadcastMessage({
      type: "STATE_UPDATE",
      payload: state,
    });
    
    console.log("[Background] Snippet saved successfully:", snippet.id);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Background] Failed to save snippet:", errorMessage);
    
    // Check if we should retry
    if (item.retryCount < CONFIG.MAX_RETRIES && isRetryableError(error)) {
      await updateItemStatus(item.id, "pending", errorMessage);
      
      // Schedule retry with exponential backoff
      const delay = Math.min(
        CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, item.retryCount),
        CONFIG.MAX_RETRY_DELAY_MS
      );
      
      setTimeout(() => {
        retryQueueItem(item.id);
      }, delay);
      
    } else {
      // Mark as failed
      await updateItemStatus(item.id, "failed", errorMessage);
      
      // Notify ALL contexts of failure
      broadcastMessage({
        type: "SAVE_RESULT",
        payload: {
          success: false,
          error: errorMessage,
          originalText: item.payload.text,
          queueId: item.id,
        },
      });
      
      // Also broadcast state update for popup
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
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
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

// Check if error is retryable (network/5xx vs 4xx)
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors are retryable
    if (error.name === "AbortError" || error.message.includes("network")) {
      return true;
    }
    // 5xx errors are retryable
    if (error.message.includes("HTTP 5")) {
      return true;
    }
  }
  return false;
}

// Broadcast message to all extension contexts
function broadcastMessage(message: SaveResultMessage | StateUpdateMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might not be open, ignore error
  });
}

// Handle sync state request from popup
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
    // Stagger processing to avoid overwhelming the backend
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

// Listen for online/offline events to retry pending
self.addEventListener("online", () => {
  console.log("[Background] Back online, processing pending items");
  processPendingOnStartup();
});

// Process pending on service worker startup
processPendingOnStartup();
