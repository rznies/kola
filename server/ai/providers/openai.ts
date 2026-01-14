/**
 * OpenAI Provider Implementation
 * Wraps the OpenAI SDK to implement the ChatProvider interface
 */

import OpenAI from "openai";
import type { ChatProvider, ChatOptions, ChatMessage } from "../types";

/**
 * OpenAI provider for chat completions
 * Uses gpt-4o model by default
 */
export class OpenAIProvider implements ChatProvider {
  readonly name = "openai";
  readonly displayName = "OpenAI";
  readonly models = ["gpt-4o", "gpt-4o-mini"];
  readonly defaultModel = "gpt-4o";

  private client: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: baseURL || undefined,
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
   */
  async *streamChat(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    if (!this.client) {
      throw new Error("OpenAI provider is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY environment variable.");
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
      max_completion_tokens: options.maxTokens || 1024,
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
 * Singleton instance of the OpenAI provider
 */
export const openaiProvider = new OpenAIProvider();
