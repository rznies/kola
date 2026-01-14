// Popup Script - Display snippet status and queue

import { CONFIG, SyncStateRequest, StateUpdateMessage } from "../shared/types";

interface SnippetData {
  id: string;
  text: string;
  sourceUrl: string;
  sourceDomain: string;
  savedAt: string;
}

// Fetch snippets from backend
async function fetchSnippets(): Promise<SnippetData[]> {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/snippets`, {
      headers: {
        "Origin": `chrome-extension://${chrome.runtime.id}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("[Popup] Failed to fetch snippets:", error);
    return [];
  }
}

// Fetch pending state from background
async function fetchPendingState(): Promise<StateUpdateMessage["payload"] | null> {
  try {
    const message: SyncStateRequest = { type: "SYNC_STATE" };
    const response = await chrome.runtime.sendMessage(message);
    return response;
  } catch (error) {
    console.error("[Popup] Failed to sync state:", error);
    return null;
  }
}

// Render the UI
async function render(): Promise<void> {
  const contentEl = document.getElementById("content");
  const statusBar = document.getElementById("status-bar");
  const statsEl = document.getElementById("stats");
  
  if (!contentEl || !statusBar || !statsEl) return;
  
  // Fetch data in parallel
  const [snippets, pendingState] = await Promise.all([
    fetchSnippets(),
    fetchPendingState(),
  ]);
  
  // Update stats
  const domains = new Set(snippets.map(s => s.sourceDomain));
  statsEl.textContent = `${snippets.length} snippet${snippets.length !== 1 ? "s" : ""} from ${domains.size} site${domains.size !== 1 ? "s" : ""}`;
  
  // Show pending status if any
  if (pendingState && pendingState.pendingCount > 0) {
    statusBar.style.display = "block";
    statusBar.className = "status pending";
    statusBar.textContent = `Saving ${pendingState.pendingCount} snippet${pendingState.pendingCount !== 1 ? "s" : ""}...`;
  } else {
    statusBar.style.display = "none";
  }
  
  // Combine saved snippets with pending/failed from queue
  const allItems: Array<{
    id: string;
    text: string;
    sourceDomain: string;
    status: "saved" | "pending" | "failed";
    savedAt?: string;
  }> = snippets.map(s => ({
    id: s.id,
    text: s.text,
    sourceDomain: s.sourceDomain,
    status: "saved" as const,
    savedAt: s.savedAt,
  }));
  
  // Add pending/failed items from queue
  if (pendingState?.recentSaves) {
    for (const item of pendingState.recentSaves) {
      if (item.status !== "saved") {
        allItems.unshift({
          id: item.id,
          text: item.text,
          sourceDomain: item.sourceDomain,
          status: item.status,
        });
      }
    }
  }
  
  // Render content
  if (allItems.length === 0) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
        </svg>
        <h3>No snippets saved yet</h3>
        <p>Select text on any webpage and press the keyboard shortcut to save.</p>
      </div>
    `;
    return;
  }
  
  // Sort by most recent first
  const sortedItems = allItems.sort((a, b) => {
    if (a.status !== "saved" && b.status === "saved") return -1;
    if (a.status === "saved" && b.status !== "saved") return 1;
    if (a.savedAt && b.savedAt) {
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    }
    return 0;
  });
  
  contentEl.innerHTML = `
    <div class="snippet-list">
      ${sortedItems.slice(0, 20).map(item => `
        <div class="snippet-card ${item.status !== "saved" ? item.status : ""}" data-id="${item.id}">
          <div class="snippet-text">${escapeHtml(item.text)}</div>
          <div class="snippet-meta">
            <span class="snippet-domain">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              ${escapeHtml(item.sourceDomain)}
            </span>
            ${item.status !== "saved" ? `
              <span class="snippet-status ${item.status}">
                ${item.status === "pending" ? "Saving..." : "Failed"}
              </span>
            ` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SAVE_RESULT" || message.type === "STATE_UPDATE") {
    render();
  }
});

// Initial render
document.addEventListener("DOMContentLoaded", render);

// Refresh every 5 seconds to catch updates
setInterval(render, 5000);
