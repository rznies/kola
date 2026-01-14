import express from "express";
import { createServer } from "http";
import { setupApp } from "../server/setup";

const app = express();
const server = createServer(app);

// Use top-level await for Vercel (Node 18+)
await setupApp(app, server);

export default app;
