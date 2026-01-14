/**
 * AI Client - Main Entry Point
 * Provides a unified API for interacting with AI providers
 */

import type { ChatOptions, ChatProvider, ProviderInfo, ProviderName } from "./types";
import {
  getProvider,
  getDefaultProvider,
  getAvailableProviders as getProvidersFromFactory,
  isValidProviderName,
} from "./providers/factory";

/**
 * Stream a chat completion using the specified provider
 * 
 * @param providerName - Name of the provider to use (or null for default)
 * @param options - Chat options including messages and system prompt
 * @returns AsyncGenerator yielding response chunks
 * @throws Error if provider not available or not configured
 */
export async function* streamChat(
  providerName: ProviderName | null,
  options: ChatOptions
): AsyncGenerator<string, void, unknown> {
  let provider: ChatProvider | null;

  if (providerName) {
    if (!isValidProviderName(providerName)) {
      throw new Error(`Invalid provider name: ${providerName}`);
    }
    provider = getProvider(providerName);
    if (!provider || !provider.isAvailable()) {
      throw new Error(`Provider '${providerName}' is not available. Check API key configuration.`);
    }
  } else {
    provider = getDefaultProvider();
    if (!provider) {
      throw new Error("No AI providers are configured. Set at least one API key.");
    }
  }

  // Delegate to the provider's streamChat
  yield* provider.streamChat(options);
}

/**
 * Get list of all providers with availability status
 */
export function getAvailableProviders(): ProviderInfo[] {
  return getProvidersFromFactory();
}

/**
 * Get the default provider name (first available in priority order)
 * @returns Provider name or null if none available
 */
export function getDefaultProviderName(): ProviderName | null {
  const provider = getDefaultProvider();
  return provider ? (provider.name as ProviderName) : null;
}

/**
 * Check if any provider is available
 */
export function hasAvailableProvider(): boolean {
  return getDefaultProvider() !== null;
}

// Re-export types for convenience
export type { ChatOptions, ChatMessage, ChatProvider, ProviderInfo, ProviderName } from "./types";
export { PROVIDER_PRIORITY } from "./types";
