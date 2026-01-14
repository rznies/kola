import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { saveSnippetRequestSchema, chatRequestSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import { getAvailableProviders, getDefaultProviderName, streamChat } from "./ai/client";
import type { ProviderName } from "./ai/types";

// Helper to extract domain from URL
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ===== SNIPPETS =====
  
  // Get all snippets
  app.get("/api/snippets", async (req: Request, res: Response) => {
    try {
      const snippets = await storage.getAllSnippets();
      res.json(snippets);
    } catch (error) {
      console.error("Error fetching snippets:", error);
      res.status(500).json({ error: "Failed to fetch snippets" });
    }
  });

  // Create snippet
  app.post("/api/snippets", async (req: Request, res: Response) => {
    try {
      const parseResult = saveSnippetRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const validationError = fromError(parseResult.error);
        return res.status(400).json({ error: validationError.message });
      }

      const { text, sourceUrl, domPosition } = parseResult.data;
      const snippet = await storage.createSnippet({
        text,
        sourceUrl,
        sourceDomain: extractDomain(sourceUrl),
        domPosition: domPosition || null,
      });

      res.status(201).json(snippet);
    } catch (error) {
      console.error("Error creating snippet:", error);
      res.status(500).json({ error: "Failed to save snippet" });
    }
  });

  // Delete snippet (soft delete with undo window)
  app.delete("/api/snippets/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const snippet = await storage.getSnippet(id);
      
      if (!snippet) {
        return res.status(404).json({ error: "Snippet not found" });
      }

      // Store in pending deletions for undo
      await storage.createPendingDeletion(id, JSON.stringify(snippet));
      
      // Remove from active snippets
      await storage.deleteSnippet(id);

      res.status(200).json({ message: "Snippet deleted", undoAvailable: true });
    } catch (error) {
      console.error("Error deleting snippet:", error);
      res.status(500).json({ error: "Failed to delete snippet" });
    }
  });

  // Restore deleted snippet
  app.post("/api/snippets/:id/restore", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const restored = await storage.restoreFromPendingDeletion(id);
      
      if (!restored) {
        return res.status(404).json({ error: "Snippet not found or undo window expired" });
      }

      res.json(restored);
    } catch (error) {
      console.error("Error restoring snippet:", error);
      res.status(500).json({ error: "Failed to restore snippet" });
    }
  });

  // ===== AI PROVIDERS =====
  
  // Get available AI providers
  app.get("/api/ai/providers", async (req: Request, res: Response) => {
    try {
      const providers = getAvailableProviders();
      const defaultProvider = getDefaultProviderName();
      res.json({ providers, defaultProvider });
    } catch (error) {
      console.error("Error fetching providers:", error);
      res.status(500).json({ error: "Failed to fetch AI providers" });
    }
  });

  // ===== USER PREFERENCES =====
  
  // Get user preferences
  app.get("/api/user/preferences", async (req: Request, res: Response) => {
    // Deprecated: Client uses localStorage now.
    res.json({ aiProvider: null });
  });

  // Update user preferences
  const updatePreferencesSchema = z.object({
    aiProvider: z.enum(["openai", "groq", "gemini"]).nullable().optional(),
  });

  app.patch("/api/user/preferences", async (req: Request, res: Response) => {
    // Deprecated: Client uses localStorage now.
    res.json({ aiProvider: req.body.aiProvider || null });
  });

  // ===== THREADS =====
  
  // Get all threads
  app.get("/api/threads", async (req: Request, res: Response) => {
    try {
      const threads = await storage.getAllThreads();
      res.json(threads);
    } catch (error) {
      console.error("Error fetching threads:", error);
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  });

  // Get single thread with messages
  app.get("/api/threads/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const thread = await storage.getThread(id);
      
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const messages = await storage.getMessagesByThread(id);
      
      // Enrich messages with citation data
      const enrichedMessages = await Promise.all(
        messages.map(async (msg) => {
          if (msg.role === "assistant" && msg.citations && msg.citations.length > 0) {
            const citations = await Promise.all(
              msg.citations.map(async (snippetId) => {
                const snippet = await storage.getSnippet(snippetId);
                if (snippet) {
                  return {
                    id: snippet.id,
                    text: snippet.text,
                    sourceUrl: snippet.sourceUrl,
                    sourceDomain: snippet.sourceDomain,
                  };
                }
                return null;
              })
            );
            return {
              ...msg,
              citations: citations.filter(Boolean),
            };
          }
          return { ...msg, citations: [] };
        })
      );

      res.json({ thread, messages: enrichedMessages });
    } catch (error) {
      console.error("Error fetching thread:", error);
      res.status(500).json({ error: "Failed to fetch thread" });
    }
  });

  // Create thread
  app.post("/api/threads", async (req: Request, res: Response) => {
    try {
      const { title = "New conversation" } = req.body;
      const thread = await storage.createThread({ title });
      res.status(201).json(thread);
    } catch (error) {
      console.error("Error creating thread:", error);
      res.status(500).json({ error: "Failed to create thread" });
    }
  });

  // Update thread title
  app.patch("/api/threads/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title } = req.body;
      
      if (!title || typeof title !== "string") {
        return res.status(400).json({ error: "Title is required" });
      }

      const thread = await storage.updateThread(id, title);
      
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      res.json(thread);
    } catch (error) {
      console.error("Error updating thread:", error);
      res.status(500).json({ error: "Failed to update thread" });
    }
  });

  // Delete thread
  app.delete("/api/threads/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteThread(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting thread:", error);
      res.status(500).json({ error: "Failed to delete thread" });
    }
  });

  // ===== CHAT =====
  
  // Send chat message with streaming response
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const parseResult = chatRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const validationError = fromError(parseResult.error);
        return res.status(400).json({ error: validationError.message });
      }

      const { threadId, query, provider: requestedProvider } = parseResult.data;

      // Determine which provider to use
      let selectedProvider: ProviderName | null = null;
      if (requestedProvider) {
        selectedProvider = requestedProvider;
      } else {
        // Use user preference or default
        const prefs = await storage.getPreferences();
        selectedProvider = prefs.aiProvider || getDefaultProviderName();
      }

      // Verify thread exists
      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      // Save user message
      await storage.createMessage({
        threadId,
        role: "user",
        content: query,
      });

      // Search for relevant snippets
      let searchResults = await storage.searchSnippets(query, 5);
      
      // FALLBACK: If no specific snippets found but user asked something, 
      // include the 5 most recent snippets as context. 
      // This helps with general questions like "summarize my notes".
      if (searchResults.length === 0) {
        console.log(`[Chat] No keyword matches for "${query}", falling back to recent snippets`);
        const allSnippets = await storage.getAllSnippets();
        if (allSnippets.length > 0) {
          searchResults = allSnippets.slice(0, 5).map(s => ({ snippet: s, score: 0.1 }));
        }
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      // If still no snippets found (vault is empty)
      if (searchResults.length === 0) {
        const noDataResponse = "You haven't saved anything related to this yet. Try saving some snippets about this topic first.";
        
        await storage.createMessage({
          threadId,
          role: "assistant",
          content: noDataResponse,
          citations: [],
        });

        res.write(`data: ${JSON.stringify({ content: noDataResponse })}\n\n`);
        res.write(`data: ${JSON.stringify({ citations: [], done: true })}\n\n`);
        res.end();
        return;
      }

      // Build context from relevant snippets
      const citedSnippets = searchResults.map((r) => r.snippet);
      const context = citedSnippets
        .map((s, i) => `[${i + 1}] "${s.text}" (Source: ${s.sourceDomain})`)
        .join("\n\n");

      // System prompt enforcing grounded answers
      const systemPrompt = `You are a knowledge assistant that ONLY answers based on the user's saved snippets. You must NEVER use any external knowledge or make assumptions.

CRITICAL RULES:
1. ONLY use information from the provided snippets below.
2. Every claim MUST be traceable to a specific snippet.
3. Reference sources by their number (e.g., "According to [1]..." or "As noted in [2]...")
4. If the snippets don't contain enough information to fully answer, say so explicitly.
5. Never hallucinate or invent information not present in the snippets.
6. Be concise and direct.

USER'S SAVED SNIPPETS:
${context}

Answer the user's question using ONLY the information above.`;

      // Get conversation history for context
      const messages = await storage.getMessagesByThread(threadId);
      const chatHistory = messages.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Stream response using the selected provider
      let fullResponse = "";
      let streamError: Error | null = null;

      console.log(`[Chat] Starting stream for thread ${threadId} using provider ${selectedProvider}`);

      try {
        const aiStream = streamChat(selectedProvider as ProviderName, {
          messages: chatHistory,
          systemPrompt,
          maxTokens: 1024,
        });

        for await (const content of aiStream) {
          if (content) {
            fullResponse += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      } catch (err) {
        streamError = err instanceof Error ? err : new Error(String(err));
        console.error("[Chat] Error during stream:", streamError);
      }

      // Only save assistant message if streaming completed successfully with content
      if (fullResponse && !streamError) {
        const citationIds = citedSnippets.map((s) => s.id);
        await storage.createMessage({
          threadId,
          role: "assistant",
          content: fullResponse,
          citations: citationIds,
        });

        // Send citations and done signal
        const citationsData = citedSnippets.map((s) => ({
          id: s.id,
          text: s.text,
          sourceUrl: s.sourceUrl,
          sourceDomain: s.sourceDomain,
        }));

        res.write(`data: ${JSON.stringify({ citations: citationsData, provider: selectedProvider, done: true })}\\n\\n`);

        // Update thread title based on first message if it's still default
        if (thread.title === "New conversation") {
          const newTitle = query.slice(0, 50) + (query.length > 50 ? "..." : "");
          await storage.updateThread(threadId, newTitle);
        }
      } else {
        // Send error if stream failed
        res.write(`data: ${JSON.stringify({ error: streamError?.message || "Stream ended unexpectedly", done: true })}\n\n`);
      }
      
      res.end();

    } catch (error) {
      console.error("Error in chat:", error);
      
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "An error occurred while processing your request", done: true })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process chat request" });
      }
    }
  });

  return httpServer;
}
