// Message types for communication between extension components

// ===== Content Script → Background =====

export interface SaveSnippetRequest {
  type: "SAVE_SNIPPET";
  payload: {
    text: string;
    sourceUrl: string;
    sourceTitle: string;
    sourceDomain: string;
    selectionContext?: string; // surrounding text for context
  };
}

export interface GetStateRequest {
  type: "GET_STATE";
}

// ===== Background → Content/Popup =====

export interface SaveResultMessage {
  type: "SAVE_RESULT";
  payload: {
    success: boolean;
    snippetId?: string;
    error?: string;
    originalText: string; // for matching pending items
    queueId?: string; // for matching content script pending saves
  };
}

export interface StateUpdateMessage {
  type: "STATE_UPDATE";
  payload: {
    pendingCount: number;
    recentSaves: Array<{
      id: string;
      text: string;
      sourceDomain: string;
      status: "pending" | "saved" | "failed";
    }>;
  };
}

// ===== Popup → Background =====

export interface SyncStateRequest {
  type: "SYNC_STATE";
}

export interface RetryFailedRequest {
  type: "RETRY_FAILED";
  payload: {
    queueId: string;
  };
}

export interface ClearFailedRequest {
  type: "CLEAR_FAILED";
  payload: {
    queueId: string;
  };
}

// Union types for type guards
export type ContentToBackgroundMessage = SaveSnippetRequest | GetStateRequest;
export type PopupToBackgroundMessage = SyncStateRequest | RetryFailedRequest | ClearFailedRequest;
export type BackgroundMessage = SaveResultMessage | StateUpdateMessage;

export type ExtensionMessage = 
  | ContentToBackgroundMessage 
  | PopupToBackgroundMessage 
  | BackgroundMessage;

// ===== Queue Item for Pending Saves =====

export interface QueueItem {
  id: string;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  status: "pending" | "saving" | "failed";
  payload: SaveSnippetRequest["payload"];
}

// ===== API Response Types =====

export interface SnippetResponse {
  id: string;
  text: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  savedAt: string;
}

export interface ApiError {
  error: string;
}

// ===== Configuration =====

export const CONFIG = {
  // Backend URL - update for production
  API_BASE_URL: "http://localhost:5000",
  
  // Retry settings
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  
  // Queue settings
  MAX_QUEUE_SIZE: 100,
  
  // Selection validation
  MIN_SELECTION_LENGTH: 10,
  MAX_SELECTION_LENGTH: 10000,
} as const;
