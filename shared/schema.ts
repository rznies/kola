import { pgTable, text, varchar, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Users table (simplified for single-user MVP)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Snippets - atomic unit of saved knowledge
export const snippets = pgTable("snippets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceDomain: text("source_domain").notNull(),
  domPosition: text("dom_position"), // XPath/CSS selector (optional)
  savedAt: timestamp("saved_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // Auto-tags for retrieval (internal only, never exposed to user)
  autoTags: text("auto_tags").array().default(sql`ARRAY[]::text[]`),
});

export const insertSnippetSchema = createInsertSchema(snippets).omit({
  id: true,
  savedAt: true,
  autoTags: true,
});

export type InsertSnippet = z.infer<typeof insertSnippetSchema>;
export type Snippet = typeof snippets.$inferSelect;

// Threads - chat conversation container
export const threads = pgTable("threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  aiProvider: text("ai_provider"), // Track which AI provider was used (optional)
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertThreadSchema = createInsertSchema(threads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertThread = z.infer<typeof insertThreadSchema>;
export type Thread = typeof threads.$inferSelect;

// Messages - single chat exchange
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  // Citation IDs for assistant messages
  citations: text("citations").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  citations: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Pending deletions - for undo window
export const pendingDeletions = pgTable("pending_deletions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snippetId: varchar("snippet_id").notNull(),
  deletedAt: timestamp("deleted_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // Store full snippet data for potential restore
  snippetData: text("snippet_data").notNull(), // JSON stringified snippet
});

export const insertPendingDeletionSchema = createInsertSchema(pendingDeletions).omit({
  id: true,
  deletedAt: true,
});

export type InsertPendingDeletion = z.infer<typeof insertPendingDeletionSchema>;
export type PendingDeletion = typeof pendingDeletions.$inferSelect;

// API request/response types for frontend
export const saveSnippetRequestSchema = z.object({
  text: z.string().min(1, "Text is required"),
  sourceUrl: z.string().url("Valid URL is required"),
  sourceTitle: z.string().optional(),
  domPosition: z.string().optional(),
});

export type SaveSnippetRequest = z.infer<typeof saveSnippetRequestSchema>;

export const chatRequestSchema = z.object({
  threadId: z.string(),
  query: z.string().min(1, "Query is required"),
  provider: z.enum(["openai", "groq", "gemini"]).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  message: z.string(),
  citations: z.array(z.object({
    id: z.string(),
    text: z.string(),
    sourceUrl: z.string(),
    sourceDomain: z.string(),
  })),
  noData: z.boolean().optional(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
