/**
 * Groq Provider Implementation
 * Wraps the Groq SDK to implement the ChatProvider interface
 * Groq provides extremely fast inference for open-source models
 */

import Groq from "groq-sdk";
import type { ChatProvider, ChatOptions } from "../types";

/**
 * Groq provider for chat completions
 * Uses llama-3.3-70b-versatile model by default
 */
export class GroqProvider implements ChatProvider {
  readonly name = "groq";
  readonly displayName = "Groq";
  readonly models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "llama-3.1-8b-instant"];
  readonly defaultModel = "llama-3.3-70b-versatile";

  private client: Groq | null = null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;

    if (apiKey) {
      this.client = new Groq({
        apiKey,
      });
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
   * Groq SDK is OpenAI-compatible, so the API is nearly identical
   */
  async *streamChat(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    if (!this.client) {
      throw new Error("Groq provider is not configured. Set GROQ_API_KEY environment variable.");
    }

    // Build messages array with system prompt
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    // Add system prompt
    if (options.systemPrompt) {
      messages.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // Add conversation messages
    for (const msg of options.messages) {
      messages.push({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      });
    }

    // Create streaming completion
    const stream = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages,
      stream: true,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature,
    });

    // Yield chunks as they arrive
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

/**
 * Singleton instance of the Groq provider
 */
export const groqProvider = new GroqProvider();
