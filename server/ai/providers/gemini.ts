/**
 * Gemini Provider Implementation
 * Wraps the Google Generative AI SDK to implement the ChatProvider interface
 * 
 * Note: Gemini has a different API than OpenAI:
 * - No separate "system" role - must prepend to first user message
 * - Uses different message format (parts instead of content)
 */

import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import type { ChatProvider, ChatOptions } from "../types";

/**
 * Gemini provider for chat completions
 * Uses gemini-1.5-flash model by default (fast and cost-effective)
 */
export class GeminiProvider implements ChatProvider {
  readonly name = "gemini";
  readonly displayName = "Gemini";
  readonly models = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro"];
  readonly defaultModel = "gemini-2.0-flash-exp";

  private client: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Check if the provider is available (API key configured)
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Stream a chat completion response
   * 
   * Gemini doesn't have a system role, so we prepend the system prompt
   * to the first user message.
   */
  async *streamChat(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    if (!this.client) {
      throw new Error("Gemini provider is not configured. Set GEMINI_API_KEY environment variable.");
    }

    const model = this.client.getGenerativeModel({ model: this.defaultModel });

    // Convert messages to Gemini format
    // Gemini uses "user" and "model" roles (not "assistant")
    const history: Content[] = [];
    let systemPromptPrepended = false;

    for (const msg of options.messages) {
      let content = msg.content;

      // Prepend system prompt to the first user message
      if (!systemPromptPrepended && msg.role === "user" && options.systemPrompt) {
        content = `${options.systemPrompt}\n\n---\n\nUser message:\n${content}`;
        systemPromptPrepended = true;
      }

      // Map roles: assistant -> model
      const role = msg.role === "assistant" ? "model" : "user";
      
      // Skip system messages (we've prepended to first user message)
      if (msg.role === "system") {
        continue;
      }

      history.push({
        role,
        parts: [{ text: content }],
      });
    }

    // If we only have the system prompt and no user messages yet,
    // we need to handle this edge case
    if (history.length === 0 && options.systemPrompt) {
      // This shouldn't happen in normal usage, but handle gracefully
      throw new Error("Cannot start a Gemini conversation without a user message.");
    }

    // Get the last user message to send
    const lastMessage = history.pop();
    if (!lastMessage || lastMessage.role !== "user") {
      throw new Error("Last message must be from user.");
    }

    // Start chat with history (excluding the last message we'll send)
    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 1024,
        temperature: options.temperature,
      },
    });

    // Send the last user message and stream the response
    const result = await chat.sendMessageStream(lastMessage.parts[0].text as string);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }
}

/**
 * Singleton instance of the Gemini provider
 */
export const geminiProvider = new GeminiProvider();
