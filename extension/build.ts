// Build script for Chrome extension
// Bundles TypeScript files into JavaScript for the extension

import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const extensionDir = path.resolve(import.meta.dirname, ".");
const distDir = path.resolve(extensionDir, "dist");

async function build() {
  console.log("Building Chrome extension...");
  
  // Clean dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
  
  // Create subdirectories
  fs.mkdirSync(path.join(distDir, "background"), { recursive: true });
  fs.mkdirSync(path.join(distDir, "content"), { recursive: true });
  fs.mkdirSync(path.join(distDir, "popup"), { recursive: true });
  fs.mkdirSync(path.join(distDir, "assets", "icons"), { recursive: true });
  
  // Bundle background service worker
  await esbuild.build({
    entryPoints: [path.join(extensionDir, "background/service-worker.ts")],
    outfile: path.join(distDir, "background/service-worker.js"),
    bundle: true,
    format: "esm",
    target: "chrome120",
    minify: false,
    sourcemap: true,
  });
  console.log("  Built background/service-worker.js");
  
  // Bundle content script
  await esbuild.build({
    entryPoints: [path.join(extensionDir, "content/selection-listener.ts")],
    outfile: path.join(distDir, "content/selection-listener.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: false,
    sourcemap: true,
  });
  console.log("  Built content/selection-listener.js");
  
  // Bundle popup script
  await esbuild.build({
    entryPoints: [path.join(extensionDir, "popup/popup.ts")],
    outfile: path.join(distDir, "popup/popup.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: false,
    sourcemap: true,
  });
  console.log("  Built popup/popup.js");
  
  // Copy static files
  fs.copyFileSync(
    path.join(extensionDir, "manifest.json"),
    path.join(distDir, "manifest.json")
  );
  console.log("  Copied manifest.json");
  
  fs.copyFileSync(
    path.join(extensionDir, "popup/popup.html"),
    path.join(distDir, "popup/popup.html")
  );
  console.log("  Copied popup/popup.html");
  
  // Create placeholder icons if they don't exist
  const iconSizes = [16, 48, 128];
  for (const size of iconSizes) {
    const iconPath = path.join(distDir, `assets/icons/icon${size}.png`);
    const sourcePath = path.join(extensionDir, `assets/icons/icon${size}.png`);
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, iconPath);
    } else {
      // Create a simple placeholder SVG converted to PNG
      // For now, we'll note that icons are needed
      console.log(`  Warning: Missing icon${size}.png - extension will need icons`);
    }
  }
  
  console.log("\nBuild complete! Extension ready in extension/dist/");
  console.log("\nTo install:");
  console.log("1. Open Chrome and go to chrome://extensions/");
  console.log("2. Enable 'Developer mode'");
  console.log("3. Click 'Load unpacked' and select the extension/dist folder");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
