import { Client, Databases } from "node-appwrite";

// Ensure environment variables are set
if (!process.env.VITE_APPWRITE_ENDPOINT || !process.env.VITE_APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY) {
  // Only warn in development, throw in production?
  // For now, let's log a warning to allow build to pass even if envs are missing in some contexts
  console.warn("Appwrite environment variables are missing. Appwrite integration will fail.");
}

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || "")
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

export const db = new Databases(client);
export { client };
