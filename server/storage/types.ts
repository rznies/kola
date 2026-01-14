import type { 
  User, InsertUser, 
  Snippet, InsertSnippet,
  Thread, InsertThread,
  Message, InsertMessage,
  PendingDeletion
} from "@shared/schema";
import type { ProviderName } from "../ai/types";

export interface UserPreferences {
  aiProvider: ProviderName | null;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Snippets
  getSnippet(id: string): Promise<Snippet | undefined>;
  getAllSnippets(): Promise<Snippet[]>;
  createSnippet(snippet: InsertSnippet): Promise<Snippet>;
  deleteSnippet(id: string): Promise<void>;
  searchSnippets(query: string, limit?: number): Promise<Array<{ snippet: Snippet; score: number }>>;
  
  // Pending deletions (for undo)
  createPendingDeletion(snippetId: string, snippetData: string): Promise<PendingDeletion>;
  getPendingDeletion(snippetId: string): Promise<PendingDeletion | undefined>;
  restoreFromPendingDeletion(snippetId: string): Promise<Snippet | undefined>;
  permanentlyDelete(snippetId: string): Promise<void>;
  
  // Threads
  getThread(id: string): Promise<Thread | undefined>;
  getAllThreads(): Promise<Thread[]>;
  createThread(thread: InsertThread): Promise<Thread>;
  updateThread(id: string, title: string): Promise<Thread | undefined>;
  deleteThread(id: string): Promise<void>;
  
  // Messages
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesByThread(threadId: string): Promise<Message[]>;
  createMessage(message: InsertMessage & { citations?: string[] }): Promise<Message>;
  deleteMessagesByThread(threadId: string): Promise<void>;
  
  // User Preferences
  getPreferences(): Promise<UserPreferences>;
  setPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences>;
}
