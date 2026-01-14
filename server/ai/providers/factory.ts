/**
 * Provider Factory
 * Manages provider instances and availability based on configured API keys
 */

import type { ChatProvider, ProviderInfo, ProviderName } from "../types";
import { PROVIDER_PRIORITY } from "../types";
import { openaiProvider } from "./openai";
import { groqProvider } from "./groq";
import { geminiProvider } from "./gemini";

/**
 * Registry of all available providers
 */
const providers: Record<ProviderName, ChatProvider> = {
  openai: openaiProvider,
  groq: groqProvider,
  gemini: geminiProvider,
};

/**
 * Get a specific provider by name
 * @returns The provider instance or null if not found
 */
export function getProvider(name: ProviderName): ChatProvider | null {
  return providers[name] || null;
}

/**
 * Get list of all providers with their availability status
 * @returns Array of provider info objects
 */
export function getAvailableProviders(): ProviderInfo[] {
  return Object.values(providers).map((provider) => ({
    name: provider.name,
    displayName: provider.displayName,
    models: provider.models,
    available: provider.isAvailable(),
  }));
}

/**
 * Get only the providers that are currently available (have API keys configured)
 * @returns Array of available provider instances
 */
export function getConfiguredProviders(): ChatProvider[] {
  return Object.values(providers).filter((provider) => provider.isAvailable());
}

/**
 * Get the default provider based on priority order
 * Returns the first available provider from the priority list
 * @returns The default provider or null if none available
 */
export function getDefaultProvider(): ChatProvider | null {
  for (const name of PROVIDER_PRIORITY) {
    const provider = providers[name];
    if (provider && provider.isAvailable()) {
      return provider;
    }
  }
  return null;
}

/**
 * Check if a provider name is valid
 */
export function isValidProviderName(name: string): name is ProviderName {
  return name in providers;
}
