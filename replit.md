# Saved Knowledge Chat

## Overview

A Chrome extension that enables users to save highlighted text from any webpage into a personal knowledge vault, then chat with their saved content using AI-grounded responses. The system prioritizes trust, precision, and citation-backed answers—never inventing information outside what the user has saved.

**Target Users:** Entrepreneurs, working professionals, content creators, indie hackers  
**Core Promise:** Every AI answer is grounded exclusively in your saved snippets with explicit citations

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight client-side routing)
- **State Management:** TanStack React Query for server state, local React state for UI
- **Styling:** Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool:** Vite with path aliases (@/, @shared/, @assets/)

The frontend is designed to work both as a web application (for development/preview) and as the basis for Chrome extension popup UI. Fixed 400x600px popup constraints inform the dense, information-focused design.

### Backend Architecture
- **Framework:** Express.js with TypeScript
- **API Pattern:** RESTful JSON API at `/api/*` endpoints
- **AI Integration:** OpenAI SDK configured for Replit AI Integrations (custom base URL)
- **Build:** esbuild for production bundling with selective dependency inclusion

Key API endpoints:
- `GET/POST/DELETE /api/snippets` - CRUD for saved text snippets
- `GET/POST/DELETE /api/threads` - Chat conversation management
- `POST /api/chat` - AI chat with retrieval from saved snippets

### Chrome Extension Architecture
- **Manifest V3** with service worker background script
- **Content Script:** Listens for text selection, enables right-click "Save to Knowledge Vault"
- **Background Service Worker:** Handles API calls, queue management, message routing
- **Popup:** Displays saved snippets and sync status
- **Storage:** Chrome session storage for save queue with retry logic

Extension components communicate via Chrome messaging API. The extension builds separately using esbuild into `/extension/dist/`.

### Data Layer
- **ORM:** Drizzle ORM with PostgreSQL dialect
- **Schema Location:** `/shared/schema.ts` (shared between client and server)
- **Migrations:** Drizzle Kit with `db:push` for schema sync

Core entities:
- **Snippets:** Saved text with source URL, domain, timestamp, auto-tags
- **Threads:** Chat conversation containers
- **Messages:** Individual chat messages with role and content
- **PendingDeletion:** Soft-delete support for undo functionality

### Retrieval Strategy
Text similarity using TF-IDF-like tokenization (no vector embeddings in MVP). The AI is strictly constrained to only answer using retrieved snippets—if no relevant data exists, it explicitly says so rather than using pretrained knowledge.

## External Dependencies

### AI Services
- **OpenAI API** via Replit AI Integrations
  - Environment: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
  - Used for: Chat completions grounded in retrieved snippets, image generation

### Database
- **PostgreSQL** (provisioned via Replit)
  - Environment: `DATABASE_URL`
  - Connection: Direct via Drizzle ORM

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `openai` - AI API client
- `express` / `express-session` - HTTP server
- `@tanstack/react-query` - Async state management
- `@radix-ui/*` - Accessible UI primitives (via shadcn/ui)
- `p-limit` / `p-retry` - Rate limiting and retry logic for batch operations

### Chrome Extension APIs
- `chrome.storage.session` - Queue persistence
- `chrome.contextMenus` - Right-click save action
- `chrome.runtime.sendMessage` - Component communication