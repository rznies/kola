# Appwrite Backend Migration Plan

This plan outlines the steps to migrate the "Saved Knowledge Chat" app to a production-ready architecture using Appwrite (BaaS) and Vercel.

## 1. Pre-requisites & Setup

### 1.1 Appwrite Project Setup
1.  Create a new Appwrite Project (Cloud or Self-Hosted).
2.  **Enable Services**: Database, Auth, Storage (optional).
3.  **Create API Key**: Scope: `documents.read`, `documents.write`, `users.read`, `databases.read`, `databases.write`.
4.  **Environment Variables**:
    - `VITE_APPWRITE_ENDPOINT`: e.g., `https://cloud.appwrite.io/v1`
    - `VITE_APPWRITE_PROJECT_ID`: Your Project ID
    - `APPWRITE_API_KEY`: Server-side API Key
    - `APPWRITE_DATABASE_ID`: e.g., `knowledge_vault`

### 1.2 Dependencies
- **Client**: `npm install appwrite`
- **Server**: `npm install node-appwrite`

## 2. Database Schema (Appwrite)

Create a Database named `knowledge_vault`.

### Collection: `snippets`
- **Permissions**: Document Security (User can read/write own docs).
- **Attributes**:
    - `text` (String, Size: 10000, Required)
    - `sourceUrl` (Url, Required)
    - `sourceDomain` (String, Size: 255, Required)
    - `domPosition` (String, Size: 1000, Optional)
    - `savedAt` (Datetime, Required)
    - `autoTags` (String, Array, Optional)
    - `embedding` (Float, Array, Size: 1536) - **Index this!**
- **Indexes**:
    - `idx_embedding`: Type: Vector, Attribute: `embedding`, Algorithm: HNSW, Metric: Cosine.

### Collection: `threads`
- **Permissions**: Document Security.
- **Attributes**:
    - `title` (String, Size: 255, Required)
    - `aiProvider` (String, Size: 50, Optional)
    - `createdAt` (Datetime, Required)
    - `updatedAt` (Datetime, Required)

### Collection: `messages`
- **Permissions**: Document Security.
- **Attributes**:
    - `threadId` (String, Size: 255, Required)
    - `role` (String, Size: 20, Required)
    - `content` (String, Size: 65535, Required)
    - `citations` (String, Array, Optional)
    - `createdAt` (Datetime, Required)
- **Indexes**:
    - `idx_thread`: Type: Key, Attribute: `threadId` (ASC).

## 3. Backend Implementation (Express/Vercel)

### 3.1 Appwrite Storage Adapter
Create `server/storage/appwrite.ts` implementing `IStorage`.

```typescript
import { Client, Databases, Query, ID } from 'node-appwrite';
import { IStorage } from '../storage';

export class AppwriteStorage implements IStorage {
  private client: Client;
  private db: Databases;
  private dbId = process.env.APPWRITE_DATABASE_ID!;

  constructor() {
    this.client = new Client()
      .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT!)
      .setProject(process.env.VITE_APPWRITE_PROJECT_ID!)
      .setKey(process.env.APPWRITE_API_KEY!);
    this.db = new Databases(this.client);
  }

  // Example: Search Snippets with Vector Search
  async searchSnippets(queryEmbedding: number[], userId: string, limit = 5) {
    // Note: Appwrite requires the embedding to be passed in the query
    // This is a pseudo-implementation; refer to Appwrite Docs for specific Vector Syntax
    // Usually: Query.search('embedding', embeddingVector) is not standard, 
    // Appwrite uses a specific method or native finding.
    
    // For Appwrite Cloud, it's often better to just use standard search or
    // if using 1.5+, find logic for vector search.
    // Assuming standard keyword search fallback if vector not ready:
    return await this.db.listDocuments(
      this.dbId,
      'snippets',
      [
        Query.search('text', queryText), // Keyword fallback
        Query.equal('$permissions', `read("user:${userId}")`), // Security
        Query.limit(limit)
      ]
    );
  }
}
```

### 3.2 Authentication Middleware
Update `server/routes.ts` to verify the Appwrite Session.
- The client sends the JWT (created via `account.createJWT()`) in the Authorization header.
- Server verifies it using `client.setJWT(token)`.

## 4. Frontend Implementation

### 4.1 Auth Context
Create `client/src/contexts/AuthContext.tsx`.
- Wraps `App`.
- Provides `user`, `login`, `logout`, `register`.
- Uses `Account` service from `appwrite`.

### 4.2 Protected Routes
- Wrap the main Layout in a `ProtectedRoute` component.
- Redirect to `/login` if no user.

### 4.3 Data Fetching
- Refactor `use-snippets.ts`, `use-threads.ts` to call the API (which now uses Appwrite backend).
- *Alternative*: Client *could* call Appwrite directly for `GET` requests to save server load, but keeping it through the API simplifies the architecture (Server is the "Brain").

## 5. Vercel Deployment Configuration

### 5.1 `vercel.json`
```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.ts" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 5.2 Server Entrypoint (`api/index.ts`)
Create a new entry point that adapts Express for Vercel Serverless.
```typescript
import app from '../server/app'; // Refactored export
export default app;
```

## 6. Execution Steps (Checklist)

1. [ ] **Setup**: Install dependencies (`appwrite`, `node-appwrite`).
2. [ ] **Env**: Configure `.env` and `.env.example`.
3. [ ] **Services**: Create `server/services/appwrite.ts`.
4. [ ] **Storage**: Implement `AppwriteStorage` class in `server/storage.ts`.
5. [ ] **Auth API**: Add `/api/auth/me` or reliance on Appwrite Client SDK.
6. [ ] **Frontend**: Add Login/Register pages + Auth Context.
7. [ ] **Vercel**: Add `vercel.json` and refactor `server/index.ts` to export `app`.

