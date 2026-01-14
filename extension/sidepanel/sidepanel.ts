// Side Panel - Main chat interface and knowledge management

import { CONFIG } from "../shared/types";

// Types
interface Snippet {
  id: number;
  text: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  savedAt: string;
  tags?: string[];
}

interface Thread {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: number;
  threadId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations?: Array<{
    snippetId: number;
    text: string;
    sourceDomain: string;
  }>;
}

interface ChatResponse {
  message: Message;
  citations: Array<{
    snippetId: number;
    text: string;
    sourceDomain: string;
  }>;
}

// State
let currentThreadId: number | null = null;
let snippets: Snippet[] = [];
let threads: Thread[] = [];
let messages: Message[] = [];
let isLoading = false;
let selectedProvider: string | null = null;
let availableProviders: Array<{ name: string; displayName: string; models: string[]; available: boolean }> = [];

// DOM Elements
const chatMessages = document.getElementById("chat-messages")!;
const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement;
const btnSend = document.getElementById("btn-send") as HTMLButtonElement;
const btnNewChat = document.getElementById("btn-new-chat") as HTMLButtonElement;
const snippetsList = document.getElementById("snippets-list")!;
const threadsList = document.getElementById("threads-list")!;
const snippetCount = document.getElementById("snippet-count")!;
const searchInput = document.getElementById("search-snippets") as HTMLInputElement;
const btnExport = document.getElementById("btn-export") as HTMLButtonElement;
const toastContainer = document.getElementById("toast-container")!;

// Initialize
async function init() {
  setupEventListeners();
  await Promise.all([loadSnippets(), loadThreads(), loadProviders()]);
  
  // Load last active thread from storage
  const stored = await chrome.storage.local.get(["lastThreadId", "selectedProvider"]);
  if (stored.lastThreadId && threads.find(t => t.id === stored.lastThreadId)) {
    await selectThread(stored.lastThreadId);
  }
  if (stored.selectedProvider) {
    selectedProvider = stored.selectedProvider;
    updateProviderSelector();
  }
  
  updateSnippetCount();
}

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");
      switchTab(tabId!);
    });
  });
  
  // Chat input
  chatInput.addEventListener("input", () => {
    btnSend.disabled = !chatInput.value.trim();
    autoResizeTextarea();
  });
  
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (chatInput.value.trim()) {
        sendMessage();
      }
    }
  });
  
  btnSend.addEventListener("click", sendMessage);
  btnNewChat.addEventListener("click", createNewThread);
  
  // Search snippets
  searchInput.addEventListener("input", () => {
    renderSnippets(searchInput.value);
  });
  
  // Export
  btnExport.addEventListener("click", showExportModal);
  
  // Listen for save results from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SAVE_RESULT" && message.payload?.success) {
      loadSnippets();
      showToast("Snippet saved to your vault", "success");
    }
  });
}

function switchTab(tabId: string) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
  document.getElementById(`tab-${tabId}`)?.classList.add("active");
  
  if (tabId === "snippets") {
    renderSnippets();
  } else if (tabId === "threads") {
    renderThreads();
  }
}

function autoResizeTextarea() {
  chatInput.style.height = "24px";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
}

// API Functions
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Origin": `chrome-extension://${chrome.runtime.id}`,
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

async function loadSnippets() {
  try {
    snippets = await fetchAPI<Snippet[]>("/api/snippets");
    updateSnippetCount();
    renderSnippets();
  } catch (error) {
    console.error("Failed to load snippets:", error);
    showToast("Failed to load snippets", "error");
  }
}

async function loadThreads() {
  try {
    threads = await fetchAPI<Thread[]>("/api/threads");
    renderThreads();
  } catch (error) {
    console.error("Failed to load threads:", error);
  }
}

async function loadMessages(threadId: number) {
  try {
    const data = await fetchAPI<{ thread: Thread; messages: Message[] }>(`/api/threads/${threadId}`);
    messages = data.messages;
    renderMessages();
  } catch (error) {
    console.error("Failed to load messages:", error);
    messages = [];
    renderMessages();
  }
}

async function selectThread(threadId: number) {
  currentThreadId = threadId;
  await chrome.storage.local.set({ lastThreadId: threadId });
  await loadMessages(threadId);
  renderThreads();
}

async function createNewThread() {
  try {
    const thread = await fetchAPI<Thread>("/api/threads", {
      method: "POST",
      body: JSON.stringify({ title: "New Chat" }),
    });
    
    threads.unshift(thread);
    await selectThread(thread.id);
    switchTab("chat");
    chatInput.focus();
  } catch (error) {
    console.error("Failed to create thread:", error);
    showToast("Failed to create new chat", "error");
  }
}

async function deleteThread(threadId: number) {
  try {
    await fetchAPI(`/api/threads/${threadId}`, { method: "DELETE" });
    threads = threads.filter(t => t.id !== threadId);
    
    if (currentThreadId === threadId) {
      currentThreadId = null;
      messages = [];
      renderMessages();
    }
    
    renderThreads();
    showToast("Conversation deleted", "success");
  } catch (error) {
    console.error("Failed to delete thread:", error);
    showToast("Failed to delete conversation", "error");
  }
}

async function deleteSnippet(snippetId: number) {
  const snippet = snippets.find(s => s.id === snippetId);
  if (!snippet) return;
  
  try {
    await fetchAPI(`/api/snippets/${snippetId}`, { method: "DELETE" });
    snippets = snippets.filter(s => s.id !== snippetId);
    updateSnippetCount();
    renderSnippets();
    
    // Show undo toast
    showToast("Snippet deleted", "success", {
      action: "Undo",
      onAction: () => undoDeleteSnippet(snippet),
      duration: 5000,
    });
  } catch (error) {
    console.error("Failed to delete snippet:", error);
    showToast("Failed to delete snippet", "error");
  }
}

async function undoDeleteSnippet(snippet: Snippet) {
  try {
    const restored = await fetchAPI<Snippet>("/api/snippets", {
      method: "POST",
      body: JSON.stringify({
        text: snippet.text,
        sourceUrl: snippet.sourceUrl,
        sourceTitle: snippet.sourceTitle,
      }),
    });
    
    snippets.unshift(restored);
    updateSnippetCount();
    renderSnippets();
    showToast("Snippet restored", "success");
  } catch (error) {
    console.error("Failed to restore snippet:", error);
    showToast("Failed to restore snippet", "error");
  }
}

async function sendMessage() {
  const content = chatInput.value.trim();
  if (!content || isLoading) return;
  
  // Create thread if none exists
  if (!currentThreadId) {
    try {
      const thread = await fetchAPI<Thread>("/api/threads", {
        method: "POST",
        body: JSON.stringify({ title: content.slice(0, 50) }),
      });
      threads.unshift(thread);
      currentThreadId = thread.id;
      await chrome.storage.local.set({ lastThreadId: thread.id });
    } catch (error) {
      console.error("Failed to create thread:", error);
      showToast("Failed to start chat", "error");
      return;
    }
  }
  
  // Add user message to UI
  const userMessage: Message = {
    id: Date.now(),
    threadId: currentThreadId,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
  messages.push(userMessage);
  renderMessages();
  
  // Clear input
  chatInput.value = "";
  btnSend.disabled = true;
  autoResizeTextarea();
  
  // Start streaming
  isLoading = true;
  
  const assistantMsgId = Date.now() + 1;
  const assistantMessage: Message = {
    id: assistantMsgId,
    threadId: currentThreadId!,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    citations: [],
  };
  messages.push(assistantMessage);
  renderMessages();
  
  const messageElement = chatMessages.querySelector(`[data-id="${assistantMsgId}"] .message-text`);
  const messageContainer = chatMessages.querySelector(`[data-id="${assistantMsgId}"]`);
  
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": `chrome-extension://${chrome.runtime.id}`,
      },
      body: JSON.stringify({
        threadId: currentThreadId,
        query: content,
        provider: selectedProvider,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to connect" }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader available");

    const decoder = new TextDecoder();
    let accumulatedContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.content) {
              accumulatedContent += data.content;
              assistantMessage.content = accumulatedContent;
              if (messageElement) {
                messageElement.innerHTML = formatMessageContent(accumulatedContent);
              }
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            
            if (data.citations) {
              assistantMessage.citations = data.citations;
              // Re-render message with citations at the end
              renderMessages();
            }
          } catch (e) {
            // Ignore partial JSON
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to send message:", error);
    assistantMessage.content = "I'm sorry, I couldn't process your request. Please check your API key and connection.";
    renderMessages();
    showToast("Failed to get response", "error");
  } finally {
    isLoading = false;
    renderMessages();
  }
}

// Render Functions
function updateSnippetCount() {
  snippetCount.textContent = `${snippets.length} snippet${snippets.length !== 1 ? "s" : ""}`;
}

function renderMessages() {
  if (messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3>Ask about your saved knowledge</h3>
        <p>I only answer using snippets you've saved. No hallucinations, just your knowledge with citations.</p>
      </div>
    `;
    return;
  }
  
  chatMessages.innerHTML = messages.map(msg => {
    const isUser = msg.role === "user";
    const time = formatTime(msg.createdAt);
    
    let citationsHtml = "";
    if (msg.citations && msg.citations.length > 0) {
      citationsHtml = `
        <div class="citations-list">
          <div class="citations-title">Sources</div>
          ${msg.citations.map(c => `
            <div class="citation-item">
              ${escapeHtml(c.text.slice(0, 150))}${c.text.length > 150 ? "..." : ""}
              <div class="citation-source">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                ${escapeHtml(c.sourceDomain)}
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }
    
    return `
      <div class="message" data-id="${msg.id}">
        <div class="message-avatar ${isUser ? "user" : "assistant"}">
          ${isUser ? `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          ` : `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              <circle cx="7.5" cy="14.5" r="1"/>
              <circle cx="16.5" cy="14.5" r="1"/>
            </svg>
          `}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-author">${isUser ? "You" : "Knowledge AI"}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-text">${formatMessageContent(msg.content)}</div>
          ${citationsHtml}
        </div>
      </div>
    `;
  }).join("");
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.id = "typing-indicator";
  indicator.className = "message";
  indicator.innerHTML = `
    <div class="message-avatar assistant">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
      </svg>
    </div>
    <div class="message-content">
      <div class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
  chatMessages.appendChild(indicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  document.getElementById("typing-indicator")?.remove();
}

function renderSnippets(searchQuery = "") {
  const filtered = searchQuery
    ? snippets.filter(s => 
        s.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sourceDomain.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : snippets;
  
  if (filtered.length === 0) {
    snippetsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <h3>${searchQuery ? "No matching snippets" : "No snippets saved yet"}</h3>
        <p>${searchQuery ? "Try a different search term" : "Select text on any webpage and click the save button or press Ctrl+Shift+S"}</p>
      </div>
    `;
    return;
  }
  
  snippetsList.innerHTML = filtered.map(snippet => `
    <div class="snippet-card" data-id="${snippet.id}">
      <div class="snippet-text">${escapeHtml(snippet.text)}</div>
      <div class="snippet-meta">
        <div class="snippet-source">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <span class="snippet-domain">${escapeHtml(snippet.sourceDomain)}</span>
        </div>
        <div class="snippet-actions">
          <button class="btn btn-ghost btn-copy" data-id="${snippet.id}" title="Copy">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="btn btn-ghost btn-delete" data-id="${snippet.id}" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `).join("");
  
  // Add event listeners
  snippetsList.querySelectorAll(".btn-copy").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute("data-id")!);
      const snippet = snippets.find(s => s.id === id);
      if (snippet) {
        navigator.clipboard.writeText(snippet.text);
        showToast("Copied to clipboard", "success");
      }
    });
  });
  
  snippetsList.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute("data-id")!);
      deleteSnippet(id);
    });
  });
}

function renderThreads() {
  if (threads.length === 0) {
    threadsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h3>No conversations yet</h3>
        <p>Start a new chat to ask questions about your saved knowledge</p>
      </div>
    `;
    return;
  }
  
  threadsList.innerHTML = threads.map(thread => `
    <div class="thread-card ${currentThreadId === thread.id ? "active" : ""}" data-id="${thread.id}">
      <div class="thread-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div class="thread-info">
        <div class="thread-title">${escapeHtml(thread.title)}</div>
        <div class="thread-preview">${formatDate(thread.updatedAt)}</div>
      </div>
      <button class="btn btn-ghost thread-delete" data-id="${thread.id}" title="Delete">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `).join("");
  
  // Add event listeners
  threadsList.querySelectorAll(".thread-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if ((e.target as Element).closest(".thread-delete")) return;
      const id = parseInt(card.getAttribute("data-id")!);
      selectThread(id);
      switchTab("chat");
    });
  });
  
  threadsList.querySelectorAll(".thread-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute("data-id")!);
      deleteThread(id);
    });
  });
}

// Export Functions
function showExportModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">Export Knowledge</div>
      <div class="modal-options">
        <div class="modal-option" data-format="json">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div class="modal-option-text">
            <div class="modal-option-title">JSON</div>
            <div class="modal-option-desc">Machine-readable format</div>
          </div>
        </div>
        <div class="modal-option" data-format="markdown">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div class="modal-option-text">
            <div class="modal-option-title">Markdown</div>
            <div class="modal-option-desc">Human-readable format</div>
          </div>
        </div>
      </div>
      <button class="btn btn-outline modal-close">Cancel</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector(".modal-close")?.addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  
  modal.querySelectorAll(".modal-option").forEach(option => {
    option.addEventListener("click", () => {
      const format = option.getAttribute("data-format");
      exportData(format as "json" | "markdown");
      modal.remove();
    });
  });
}

function exportData(format: "json" | "markdown") {
  let content: string;
  let filename: string;
  let mimeType: string;
  
  if (format === "json") {
    content = JSON.stringify(snippets, null, 2);
    filename = `knowledge-vault-${formatDateForFile(new Date())}.json`;
    mimeType = "application/json";
  } else {
    content = `# Knowledge Vault Export\n\nExported on ${new Date().toLocaleDateString()}\n\n---\n\n`;
    content += snippets.map(s => 
      `## From ${s.sourceDomain}\n\n> ${s.text}\n\nSource: [${s.sourceTitle || s.sourceUrl}](${s.sourceUrl})\n\nSaved: ${formatDate(s.savedAt)}\n\n---\n`
    ).join("\n");
    filename = `knowledge-vault-${formatDateForFile(new Date())}.md`;
    mimeType = "text/markdown";
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast(`Exported ${snippets.length} snippets`, "success");
}

// Utility Functions
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Provider Functions
async function loadProviders() {
  try {
    const response = await fetchAPI<{ providers: typeof availableProviders; defaultProvider: string | null }>("/api/ai/providers");
    availableProviders = response.providers;
    if (!selectedProvider && response.defaultProvider) {
      selectedProvider = response.defaultProvider;
    }
    renderProviderSelector();
  } catch (error) {
    console.error("Failed to load providers:", error);
  }
}

function renderProviderSelector() {
  const providerContainer = document.getElementById("provider-selector");
  if (!providerContainer) return;
  
  const available = availableProviders.filter(p => p.available);
  if (available.length <= 1) {
    providerContainer.style.display = "none";
    return;
  }
  
  providerContainer.style.display = "flex";
  providerContainer.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="provider-icon">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <path d="M9 9h6v6H9z"/>
    </svg>
    <select id="provider-select" class="provider-select">
      ${available.map(p => `
        <option value="${p.name}" ${p.name === selectedProvider ? 'selected' : ''}>
          ${p.displayName} - ${p.models[0]}
        </option>
      `).join('')}
    </select>
  `;
  
  const select = document.getElementById("provider-select") as HTMLSelectElement;
  select?.addEventListener("change", async () => {
    selectedProvider = select.value;
    await chrome.storage.local.set({ selectedProvider });
  });
}

function updateProviderSelector() {
  const select = document.getElementById("provider-select") as HTMLSelectElement;
  if (select && selectedProvider) {
    select.value = selectedProvider;
  }
}

function formatMessageContent(content: string): string {
  // Convert line breaks to <br> and paragraphs
  return content
    .split("\n\n")
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString();
}

function formatDateForFile(date: Date): string {
  return date.toISOString().split("T")[0];
}

interface ToastOptions {
  action?: string;
  onAction?: () => void;
  duration?: number;
}

function showToast(message: string, type: "success" | "error" = "success", options?: ToastOptions) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    ${options?.action ? `<button class="toast-action">${options.action}</button>` : ""}
  `;
  
  if (options?.action && options?.onAction) {
    toast.querySelector(".toast-action")?.addEventListener("click", () => {
      options.onAction!();
      toast.remove();
    });
  }
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, options?.duration || 3000);
}

// Initialize on load
init();
