// Chrome storage utilities for managing the save queue

import { QueueItem, CONFIG } from "./types";

const QUEUE_KEY = "saveQueue";

// Generate unique ID for queue items
export function generateQueueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Get the current save queue
export async function getQueue(): Promise<QueueItem[]> {
  try {
    const result = await chrome.storage.local.get(QUEUE_KEY);
    return result[QUEUE_KEY] || [];
  } catch (error) {
    console.error("[Storage] Failed to get queue:", error);
    return [];
  }
}

// Save the queue
async function saveQueue(queue: QueueItem[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  } catch (error) {
    console.error("[Storage] Failed to save queue:", error);
    throw error;
  }
}

// Add item to queue
export async function enqueue(item: Omit<QueueItem, "id" | "createdAt" | "retryCount" | "status">): Promise<QueueItem> {
  const queue = await getQueue();
  
  // Check queue size limit
  if (queue.length >= CONFIG.MAX_QUEUE_SIZE) {
    // Remove oldest failed items first, then oldest pending
    const failedIndex = queue.findIndex(q => q.status === "failed");
    if (failedIndex !== -1) {
      queue.splice(failedIndex, 1);
    } else {
      queue.shift(); // Remove oldest
    }
  }
  
  const queueItem: QueueItem = {
    id: generateQueueId(),
    createdAt: Date.now(),
    retryCount: 0,
    status: "pending",
    payload: item.payload,
  };
  
  queue.push(queueItem);
  await saveQueue(queue);
  
  return queueItem;
}

// Update item status
export async function updateItemStatus(
  id: string, 
  status: QueueItem["status"], 
  error?: string
): Promise<void> {
  const queue = await getQueue();
  const index = queue.findIndex(q => q.id === id);
  
  if (index !== -1) {
    queue[index].status = status;
    if (error) {
      queue[index].lastError = error;
    }
    if (status === "saving") {
      queue[index].retryCount += 1;
    }
    await saveQueue(queue);
  }
}

// Remove item from queue (after successful save)
export async function dequeue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter(q => q.id !== id);
  await saveQueue(filtered);
}

// Get pending and failed items for retry
export async function getPendingItems(): Promise<QueueItem[]> {
  const queue = await getQueue();
  return queue.filter(q => q.status === "pending" || q.status === "failed");
}

// Check for duplicate (same text + URL within last hour)
export async function isDuplicate(text: string, sourceUrl: string): Promise<boolean> {
  const queue = await getQueue();
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  return queue.some(item => 
    item.payload.text === text && 
    item.payload.sourceUrl === sourceUrl &&
    item.createdAt > oneHourAgo
  );
}

// Create content hash for deduplication
export function createContentHash(text: string, url: string): string {
  // Simple hash - in production use crypto.subtle
  let hash = 0;
  const str = `${text}|${url}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
