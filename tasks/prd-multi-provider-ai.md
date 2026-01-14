# PRD: Multi-Provider AI Integration (Groq + Gemini + OpenAI)

## Introduction

Add support for multiple AI providers (Groq, Gemini, OpenAI) to the Saved Knowledge Chat application. Users can select which AI provider to use for chat conversations, with the ability to configure API keys via environment variables or through a UI settings panel. This gives users flexibility to choose based on speed, cost, or preference.

## Goals

- Allow users to select their preferred AI provider (Groq, Gemini, or OpenAI) from the UI
- Support Groq (llama-3.3-70b-versatile), Gemini (gemini-1.5-flash), and OpenAI (gpt-4o) models
- Enable API key configuration via environment variables AND UI settings
- Maintain existing chat functionality (streaming, citations, grounded responses)
- Track which provider was used for each conversation thread

## User Stories

### US-001: Create AI provider abstraction layer
**Description:** As a developer, I need a unified interface for AI providers so the chat endpoint can work with any provider without code changes.

**Acceptance Criteria:**
- [ ] Create `server/ai/types.ts` with `ChatProvider` interface
- [ ] Interface includes `streamChat()`, `name`, and `models` properties
- [ ] Interface supports streaming responses via AsyncGenerator
- [ ] Typecheck passes

### US-002: Implement OpenAI provider wrapper
**Description:** As a developer, I need to extract existing OpenAI logic into a provider class that implements the ChatProvider interface.

**Acceptance Criteria:**
- [ ] Create `server/ai/providers/openai.ts`
- [ ] Wraps existing OpenAI SDK usage
- [ ] Implements ChatProvider interface
- [ ] Uses `gpt-4o` model (upgrade from gpt-4o-mini)
- [ ] Handles streaming responses correctly
- [ ] Typecheck passes

### US-003: Implement Groq provider wrapper
**Description:** As a developer, I need a Groq provider that uses the Groq SDK for fast inference.

**Acceptance Criteria:**
- [ ] Install `groq-sdk` package
- [ ] Create `server/ai/providers/groq.ts`
- [ ] Implements ChatProvider interface
- [ ] Uses `llama-3.3-70b-versatile` model
- [ ] Reads API key from `GROQ_API_KEY` environment variable
- [ ] Handles streaming responses correctly
- [ ] Typecheck passes

### US-004: Implement Gemini provider wrapper
**Description:** As a developer, I need a Gemini provider that uses Google's Generative AI SDK.

**Acceptance Criteria:**
- [ ] Install `@google/generative-ai` package
- [ ] Create `server/ai/providers/gemini.ts`
- [ ] Implements ChatProvider interface
- [ ] Uses `gemini-1.5-flash` model
- [ ] Reads API key from `GEMINI_API_KEY` environment variable
- [ ] Handles Gemini's different message format (no system role - prepend to first user message)
- [ ] Handles streaming responses correctly
- [ ] Typecheck passes

### US-005: Create provider factory and client
**Description:** As a developer, I need a factory to instantiate providers based on available API keys and user selection.

**Acceptance Criteria:**
- [ ] Create `server/ai/providers/factory.ts` with provider registration
- [ ] Create `server/ai/client.ts` as main entry point
- [ ] Factory returns null for providers without API keys configured
- [ ] `getAvailableProviders()` function returns list of configured providers
- [ ] `getProvider(name)` function returns specific provider instance
- [ ] Typecheck passes

### US-006: Add provider endpoints to API
**Description:** As a developer, I need API endpoints to list available providers and get/update user preferences.

**Acceptance Criteria:**
- [ ] Add `GET /api/ai/providers` endpoint returning available providers and their models
- [ ] Add `GET /api/user/preferences` endpoint returning current AI provider preference
- [ ] Add `PATCH /api/user/preferences` endpoint to update AI provider preference
- [ ] Endpoints return proper error responses for invalid requests
- [ ] Typecheck passes

### US-007: Update chat endpoint to support provider selection
**Description:** As a user, I want to specify which AI provider to use when sending a chat message.

**Acceptance Criteria:**
- [ ] Update `POST /api/chat` to accept optional `provider` parameter
- [ ] If no provider specified, use user's default preference
- [ ] If no preference set, use first available provider (priority: gemini > groq > openai)
- [ ] Chat streaming works correctly with all three providers
- [ ] Citations still work correctly regardless of provider
- [ ] Error returned if requested provider not available
- [ ] Typecheck passes

### US-008: Update schema for provider tracking
**Description:** As a developer, I need to track which provider was used for each thread and store user preferences.

**Acceptance Criteria:**
- [ ] Add `aiProvider` field to threads table (nullable, stores provider used)
- [ ] Add `userPreferences` to storage interface with `aiProvider` field
- [ ] Update storage implementation with preference methods
- [ ] Typecheck passes

### US-009: Create provider selector component
**Description:** As a user, I want to select which AI provider to use from a dropdown in the chat interface.

**Acceptance Criteria:**
- [ ] Create `client/src/components/provider-selector.tsx`
- [ ] Dropdown shows available providers with their model names
- [ ] Current selection is highlighted
- [ ] Selection persists across page reloads (stored in preferences)
- [ ] Disabled state when only one provider available
- [ ] Typecheck passes
- [ ] Verify in browser that dropdown appears and functions

### US-010: Create settings dialog for API keys
**Description:** As a user, I want to configure my own API keys through a settings panel so I don't need server environment variables.

**Acceptance Criteria:**
- [ ] Create `client/src/components/settings-dialog.tsx`
- [ ] Dialog accessible from header/menu
- [ ] Input fields for Groq, Gemini, and OpenAI API keys
- [ ] Keys are masked by default with show/hide toggle
- [ ] Save button stores keys (localStorage for MVP)
- [ ] Clear button to remove stored keys
- [ ] Validation feedback (key format check)
- [ ] Typecheck passes
- [ ] Verify in browser that settings dialog opens and saves

### US-011: Integrate provider selector into chat interface
**Description:** As a user, I want to see and change the AI provider from within the chat interface.

**Acceptance Criteria:**
- [ ] Provider selector appears above or beside chat input
- [ ] Shows current provider with icon/badge
- [ ] Can switch providers mid-conversation
- [ ] New messages use newly selected provider
- [ ] Typecheck passes
- [ ] Verify in browser that provider switching works in chat

### US-012: Add model badge to chat messages
**Description:** As a user, I want to see which AI model generated each response so I can compare quality.

**Acceptance Criteria:**
- [ ] Create `client/src/components/model-badge.tsx`
- [ ] Badge shows provider name and model (e.g., "Groq - llama-3.3-70b")
- [ ] Badge appears on assistant messages only
- [ ] Compact design that doesn't distract from content
- [ ] Typecheck passes
- [ ] Verify in browser that badges appear on AI responses

### US-013: Update Chrome extension sidepanel
**Description:** As a user, I want to select AI provider in the Chrome extension sidepanel.

**Acceptance Criteria:**
- [ ] Add provider selector to sidepanel chat tab
- [ ] Store preference in `chrome.storage.local`
- [ ] Sync preference when sidepanel opens
- [ ] Provider selection persists across browser sessions
- [ ] Typecheck passes

### US-014: Add API key validation endpoint
**Description:** As a user, I want to verify my API keys are valid before saving them.

**Acceptance Criteria:**
- [ ] Add `POST /api/ai/validate-key` endpoint
- [ ] Accepts `provider` and `apiKey` parameters
- [ ] Makes minimal API call to validate key works
- [ ] Returns success/failure with error message if invalid
- [ ] Rate limited to prevent abuse
- [ ] Typecheck passes

### US-015: Create environment example file
**Description:** As a developer, I need documentation for required environment variables.

**Acceptance Criteria:**
- [ ] Create `.env.example` file in project root
- [ ] Document all AI-related environment variables
- [ ] Include comments explaining each variable
- [ ] Update README with setup instructions

## Functional Requirements

- FR-1: System must support three AI providers: Groq, Gemini, and OpenAI
- FR-2: Each provider must implement a common ChatProvider interface with streaming support
- FR-3: Providers are only available if their API key is configured (env var or user setting)
- FR-4: User can select provider via UI dropdown in chat interface
- FR-5: User can configure custom API keys via settings dialog
- FR-6: Chat endpoint accepts optional provider parameter to override default
- FR-7: Default provider priority when none specified: Gemini > Groq > OpenAI
- FR-8: Each thread tracks which provider was used for its messages
- FR-9: Assistant messages display badge showing which model generated them
- FR-10: Chrome extension supports provider selection with persistent preference

## Non-Goals

- No automatic provider fallback if one fails (user explicitly chose provider)
- No cost tracking or usage metering
- No provider-specific prompt optimization
- No support for additional providers beyond Groq, Gemini, OpenAI
- No server-side storage of user API keys (localStorage only for MVP)
- No multi-model support within same provider (one model per provider)

## Technical Considerations

- Groq SDK is OpenAI-compatible, making wrapper implementation straightforward
- Gemini uses different message format (no `system` role) - must prepend system prompt to first user message
- Streaming implementation differs between providers but can be normalized to AsyncGenerator
- Custom API keys in localStorage are not encrypted (acceptable for MVP, user's own keys)
- Provider availability is determined at runtime based on configured keys

## Design Considerations

- Provider selector should be compact and not dominate the chat UI
- Use recognizable icons/colors for each provider (optional)
- Settings dialog follows existing shadcn/ui patterns
- Model badge should be subtle (small text, muted color)

## Success Metrics

- User can switch providers in under 2 clicks
- All three providers produce correctly grounded responses with citations
- No regression in chat latency (excluding provider differences)
- Settings persist correctly across sessions

## Open Questions

- Should we show provider response time/latency to help users choose?
- Should conversation history be provider-agnostic (can switch mid-thread)?
- How to handle if user's custom API key becomes invalid after saving?
