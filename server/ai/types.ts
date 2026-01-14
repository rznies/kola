/**
 * AI Provider Abstraction Layer Types
 * Defines the common interface for all AI providers (OpenAI, Groq, Gemini)
 */

/**
 * Message format for chat conversations
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Options for streaming chat completions
 */
export interface ChatOptions {
  /** Conversation messages */
  messages: ChatMessage[];
  /** System prompt to prepend */
  systemPrompt: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for response randomness (0-2) */
  temperature?: number;
}

/**
 * Provider information for UI display
 */
export interface ProviderInfo {
  /** Provider identifier */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Available models for this provider */
  models: string[];
  /** Whether the provider is currently available (API key configured) */
  available: boolean;
}

/**
 * Common interface for all AI chat providers
 */
export interface ChatProvider {
  /** Unique provider identifier */
  readonly name: string;
  
  /** Human-readable display name */
  readonly displayName: string;
  
  /** List of available models */
  readonly models: string[];
  
  /** Default model to use */
  readonly defaultModel: string;
  
  /**
   * Stream a chat completion response
   * @param options Chat options including messages and system prompt
   * @returns AsyncGenerator yielding string chunks
   */
  streamChat(options: ChatOptions): AsyncGenerator<string, void, unknown>;
  
  /**
   * Check if the provider is available (API key configured)
   * @returns true if provider can be used
   */
  isAvailable(): boolean;
}

/**
 * Supported provider names
 */
export type ProviderName = "openai" | "groq" | "gemini";

/**
 * Provider priority order for default selection
 * First available provider in this order will be used as default
 */
export const PROVIDER_PRIORITY: ProviderName[] = ["gemini", "groq", "openai"];
