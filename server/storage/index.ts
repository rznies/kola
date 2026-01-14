import { randomUUID } from "crypto";
import { AppwriteStorage } from "./appwrite";
import { IStorage, UserPreferences } from "./types";
import type { 
  User, InsertUser, 
  Snippet, InsertSnippet,
  Thread, InsertThread,
  Message, InsertMessage,
  PendingDeletion
} from "@shared/schema";

export * from "./types";

// Helper to extract domain from URL
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Simple text similarity using TF-IDF-like approach
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function calculateSimilarity(query: string, text: string): number {
  const queryTokens = new Set(tokenize(query));
  const textTokens = tokenize(text);
  
  if (queryTokens.size === 0 || textTokens.length === 0) return 0;
  
  // Calculate how many query tokens are present in the text
  let matches = 0;
  const textTokenSet = new Set(textTokens);
  for (const token of Array.from(queryTokens)) {
    if (textTokenSet.has(token)) {
      matches++;
    }
  }
  
  // Score is percentage of query tokens that matched
  const queryMatchScore = matches / queryTokens.size;
  
  // Boost for phrase matching
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const phraseBoost = textLower.includes(queryLower) ? 0.4 : 0;
  
  return queryMatchScore + phraseBoost;
}



export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private snippets: Map<string, Snippet>;
  private threads: Map<string, Thread>;
  private messages: Map<string, Message>;
  private pendingDeletions: Map<string, PendingDeletion>;
  private preferences: UserPreferences;

  constructor() {
    this.users = new Map();
    this.snippets = new Map();
    this.threads = new Map();
    this.messages = new Map();
    this.pendingDeletions = new Map();
    this.preferences = { aiProvider: null };
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Snippets
  async getSnippet(id: string): Promise<Snippet | undefined> {
    return this.snippets.get(id);
  }

  async getAllSnippets(): Promise<Snippet[]> {
    return Array.from(this.snippets.values())
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }

  async createSnippet(insertSnippet: InsertSnippet): Promise<Snippet> {
    const id = randomUUID();
    const snippet: Snippet = {
      id,
      text: insertSnippet.text,
      sourceUrl: insertSnippet.sourceUrl,
      sourceDomain: insertSnippet.sourceDomain || extractDomain(insertSnippet.sourceUrl),
      domPosition: insertSnippet.domPosition || null,
      savedAt: new Date(),
      autoTags: [],
    };
    this.snippets.set(id, snippet);
    return snippet;
  }

  async deleteSnippet(id: string): Promise<void> {
    this.snippets.delete(id);
  }

  async searchSnippets(query: string, limit = 5): Promise<Array<{ snippet: Snippet; score: number }>> {
    const snippets = await this.getAllSnippets();
    
    const scored = snippets.map((snippet) => ({
      snippet,
      score: calculateSimilarity(query, snippet.text),
    }));
    
    return scored
      .filter((item) => item.score > 0.05) // Minimum threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Pending deletions
  async createPendingDeletion(snippetId: string, snippetData: string): Promise<PendingDeletion> {
    const id = randomUUID();
    const pending: PendingDeletion = {
      id,
      snippetId,
      snippetData,
      deletedAt: new Date(),
    };
    this.pendingDeletions.set(snippetId, pending);
    return pending;
  }

  async getPendingDeletion(snippetId: string): Promise<PendingDeletion | undefined> {
    return this.pendingDeletions.get(snippetId);
  }

  async restoreFromPendingDeletion(snippetId: string): Promise<Snippet | undefined> {
    const pending = this.pendingDeletions.get(snippetId);
    if (!pending) return undefined;
    
    try {
      const parsed = JSON.parse(pending.snippetData);
      // Rehydrate the snippet with proper Date object
      const snippetData: Snippet = {
        ...parsed,
        savedAt: new Date(parsed.savedAt),
      };
      this.snippets.set(snippetId, snippetData);
      this.pendingDeletions.delete(snippetId);
      return snippetData;
    } catch {
      return undefined;
    }
  }

  async permanentlyDelete(snippetId: string): Promise<void> {
    this.pendingDeletions.delete(snippetId);
  }

  // Threads
  async getThread(id: string): Promise<Thread | undefined> {
    return this.threads.get(id);
  }

  async getAllThreads(): Promise<Thread[]> {
    return Array.from(this.threads.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async createThread(insertThread: InsertThread & { aiProvider?: string }): Promise<Thread> {
    const id = randomUUID();
    const now = new Date();
    const thread: Thread = {
      id,
      title: insertThread.title,
      aiProvider: insertThread.aiProvider || null,
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(id, thread);
    return thread;
  }

  async updateThread(id: string, title: string): Promise<Thread | undefined> {
    const thread = this.threads.get(id);
    if (!thread) return undefined;
    
    const updated: Thread = {
      ...thread,
      title,
      updatedAt: new Date(),
    };
    this.threads.set(id, updated);
    return updated;
  }

  async deleteThread(id: string): Promise<void> {
    this.threads.delete(id);
    // Also delete all messages in this thread
    const entries = Array.from(this.messages.entries());
    for (const [msgId, msg] of entries) {
      if (msg.threadId === id) {
        this.messages.delete(msgId);
      }
    }
  }

  // Messages
  async getMessage(id: string): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesByThread(threadId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((msg) => msg.threadId === threadId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createMessage(insertMessage: InsertMessage & { citations?: string[] }): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      id,
      threadId: insertMessage.threadId,
      role: insertMessage.role,
      content: insertMessage.content,
      citations: insertMessage.citations || [],
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    
    // Update thread's updatedAt
    const thread = this.threads.get(insertMessage.threadId);
    if (thread) {
      thread.updatedAt = new Date();
      this.threads.set(insertMessage.threadId, thread);
    }
    
    return message;
  }

  async deleteMessagesByThread(threadId: string): Promise<void> {
    const entries = Array.from(this.messages.entries());
    for (const [msgId, msg] of entries) {
      if (msg.threadId === threadId) {
        this.messages.delete(msgId);
      }
    }
  }

  // User Preferences
  async getPreferences(): Promise<UserPreferences> {
    return { ...this.preferences };
  }

  async setPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    this.preferences = { ...this.preferences, ...prefs };
    return { ...this.preferences };
  }
}

export const storage = new AppwriteStorage();
