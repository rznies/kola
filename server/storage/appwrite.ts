import { ID, Query } from "node-appwrite";
import { db } from "../services/appwrite";
import { IStorage, UserPreferences } from "./types";
import { 
  User, InsertUser, 
  Snippet, InsertSnippet,
  Thread, InsertThread,
  Message, InsertMessage,
  PendingDeletion
} from "@shared/schema";

export class AppwriteStorage implements IStorage {
  private dbId = process.env.APPWRITE_DATABASE_ID || "knowledge_vault";

  // User Preferences
  async getPreferences(): Promise<UserPreferences> {
    return { aiProvider: null };
  }

  async setPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    // No-op for backend storage - we use client-side localStorage
    return { aiProvider: prefs.aiProvider || null };
  }

  // Pending Deletions
  async createPendingDeletion(snippetId: string, snippetData: string): Promise<PendingDeletion> {
    const id = ID.unique();
    const pending: PendingDeletion = {
      id,
      snippetId,
      snippetData,
      deletedAt: new Date(),
    };
    
    // Store in Appwrite
    try {
      await db.createDocument(this.dbId, "pending_deletions", id, {
        snippetId,
        snippetData,
        deletedAt: pending.deletedAt.toISOString()
      });
    } catch (e) {
      console.error("Failed to persist pending deletion:", e);
      // Fallback: Just log it, but "Undo" won't survive restart. 
      // Better than crashing the request.
    }
    
    return pending;
  }

  async getPendingDeletion(snippetId: string): Promise<PendingDeletion | undefined> {
    try {
      const docs = await db.listDocuments(this.dbId, "pending_deletions", [
        Query.equal("snippetId", snippetId),
        Query.limit(1)
      ]);
      
      if (docs.documents.length === 0) return undefined;
      
      const doc = docs.documents[0];
      return {
        id: doc.$id,
        snippetId: doc.snippetId,
        snippetData: doc.snippetData,
        deletedAt: new Date(doc.deletedAt)
      };
    } catch (e) {
      return undefined;
    }
  }

  async restoreFromPendingDeletion(snippetId: string): Promise<Snippet | undefined> {
    const pending = await this.getPendingDeletion(snippetId);
    if (!pending) return undefined;
    
    try {
      const parsed = JSON.parse(pending.snippetData);
      // We need to restore to Appwrite DB
      const snippet = await this.createSnippet({
        text: parsed.text,
        sourceUrl: parsed.sourceUrl,
        sourceDomain: parsed.sourceDomain,
        domPosition: parsed.domPosition
      });
      
      // Cleanup pending deletion doc
      try {
        await db.deleteDocument(this.dbId, "pending_deletions", pending.id);
      } catch (cleanupErr) {
        console.warn("Failed to cleanup pending deletion doc:", cleanupErr);
      }
      
      return snippet;
    } catch (e) {
      console.error("Failed to restore snippet:", e);
      return undefined;
    }
  }

  async permanentlyDelete(snippetId: string): Promise<void> {
    // Find and delete the pending doc
    const pending = await this.getPendingDeletion(snippetId);
    if (pending) {
       try {
        await db.deleteDocument(this.dbId, "pending_deletions", pending.id);
      } catch (e) {
        // Ignore
      }
    }
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return undefined;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined;
  }
  async createUser(user: InsertUser): Promise<User> {
    throw new Error("User creation should be handled by Appwrite Auth");
  }

  // Snippets
  async getSnippet(id: string): Promise<Snippet | undefined> {
    try {
      const doc = await db.getDocument(this.dbId, "snippets", id);
      return this.mapSnippet(doc);
    } catch (e) {
      return undefined;
    }
  }

  async getAllSnippets(): Promise<Snippet[]> {
    try {
      const docs = await db.listDocuments(this.dbId, "snippets", [
        Query.orderDesc("savedAt"),
        Query.limit(100) // Default limit
      ]);
      return docs.documents.map(d => this.mapSnippet(d));
    } catch (e) {
      console.error("Error fetching snippets:", e);
      return [];
    }
  }

  async createSnippet(snippet: InsertSnippet): Promise<Snippet> {
    const data = {
      text: snippet.text,
      sourceUrl: snippet.sourceUrl,
      sourceDomain: snippet.sourceDomain || "",
      domPosition: snippet.domPosition || null,
      savedAt: new Date().toISOString(),
      autoTags: []
    };
    
    const doc = await db.createDocument(this.dbId, "snippets", ID.unique(), data);
    return this.mapSnippet(doc);
  }

  async deleteSnippet(id: string): Promise<void> {
    try {
      await db.deleteDocument(this.dbId, "snippets", id);
    } catch (e) {
      // Ignore if not found
    }
  }

  async searchSnippets(query: string, limit?: number): Promise<Array<{ snippet: Snippet; score: number }>> {
     // Basic keyword search for now
     try {
       const docs = await db.listDocuments(this.dbId, "snippets", [
         Query.search("text", query),
         Query.limit(limit || 5)
       ]);
       return docs.documents.map(d => ({
         snippet: this.mapSnippet(d),
         score: 1.0 // Appwrite doesn't return score in standard list
       }));
     } catch (e) {
       return [];
     }
  }

  // Helper
  private mapSnippet(doc: any): Snippet {
    return {
      id: doc.$id,
      text: doc.text,
      sourceUrl: doc.sourceUrl,
      sourceDomain: doc.sourceDomain,
      domPosition: doc.domPosition,
      savedAt: new Date(doc.savedAt),
      autoTags: doc.autoTags || []
    };
  }
  
  // Threads
  async getThread(id: string): Promise<Thread | undefined> {
    try {
      const doc = await db.getDocument(this.dbId, "threads", id);
      return this.mapThread(doc);
    } catch (e) {
      return undefined;
    }
  }

  async getAllThreads(): Promise<Thread[]> {
    try {
      const docs = await db.listDocuments(this.dbId, "threads", [
        Query.orderDesc("updatedAt"),
        Query.limit(100)
      ]);
      return docs.documents.map(d => this.mapThread(d));
    } catch (e) {
      return [];
    }
  }

  async createThread(thread: InsertThread & { aiProvider?: string }): Promise<Thread> {
    const now = new Date().toISOString();
    const data = {
      title: thread.title,
      aiProvider: thread.aiProvider || null,
      createdAt: now,
      updatedAt: now
    };
    const doc = await db.createDocument(this.dbId, "threads", ID.unique(), data);
    return this.mapThread(doc);
  }

  async updateThread(id: string, title: string): Promise<Thread | undefined> {
    try {
      const doc = await db.updateDocument(this.dbId, "threads", id, {
        title,
        updatedAt: new Date().toISOString()
      });
      return this.mapThread(doc);
    } catch (e) {
      return undefined;
    }
  }

  async deleteThread(id: string): Promise<void> {
    try {
      await db.deleteDocument(this.dbId, "threads", id);
      // Cascade delete messages? 
      // Appwrite doesn't do cascade by default unless configured in relationships.
      // We should manually delete messages or trust Appwrite configuration.
      // For this implementation, let's assume manual deletion or separate cleanup.
      await this.deleteMessagesByThread(id);
    } catch (e) {
      // Ignore
    }
  }

  // Messages
  async getMessage(id: string): Promise<Message | undefined> {
    try {
      const doc = await db.getDocument(this.dbId, "messages", id);
      return this.mapMessage(doc);
    } catch (e) {
      return undefined;
    }
  }

  async getMessagesByThread(threadId: string): Promise<Message[]> {
    try {
      const docs = await db.listDocuments(this.dbId, "messages", [
        Query.equal("threadId", threadId),
        Query.orderAsc("createdAt"),
        Query.limit(1000)
      ]);
      return docs.documents.map(d => this.mapMessage(d));
    } catch (e) {
      return [];
    }
  }

  async createMessage(message: InsertMessage & { citations?: string[] }): Promise<Message> {
    const data = {
      threadId: message.threadId,
      role: message.role,
      content: message.content,
      citations: message.citations || [],
      createdAt: new Date().toISOString()
    };
    const doc = await db.createDocument(this.dbId, "messages", ID.unique(), data);
    
    // Update thread updatedAt
    try {
       await db.updateDocument(this.dbId, "threads", message.threadId, {
         updatedAt: new Date().toISOString()
       });
    } catch (e) {
      // Ignore thread update error
    }

    return this.mapMessage(doc);
  }

  async deleteMessagesByThread(threadId: string): Promise<void> {
    try {
      const msgs = await this.getMessagesByThread(threadId);
      await Promise.all(msgs.map(m => db.deleteDocument(this.dbId, "messages", m.id)));
    } catch (e) {
      // Ignore
    }
  }

  // Helpers
  private mapThread(doc: any): Thread {
    return {
      id: doc.$id,
      title: doc.title,
      aiProvider: doc.aiProvider,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt)
    };
  }

  private mapMessage(doc: any): Message {
    return {
      id: doc.$id,
      threadId: doc.threadId,
      role: doc.role,
      content: doc.content,
      citations: doc.citations || [],
      createdAt: new Date(doc.createdAt)
    };
  }

  
  // User Preferences
  // Implemented above

}
