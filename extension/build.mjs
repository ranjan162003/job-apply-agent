// Builds the extension into dist/ (load it in chrome://extensions → "Load unpacked").
//   node build.mjs           one-off production build
//   node build.mjs --watch   rebuild on every change (used by `npm run dev` in scripts/)
//
// esbuild instead of Vite: content scripts must be classic scripts (no ES-module chunks), and
// three small entry points don't need a dev server.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(root, "dist");
const isWatch = process.argv.includes("--watch");

// OneDrive or a loaded extension can briefly lock dist/; overwriting it is fine, so don't crash
// (a crash here would also stop the dashboard, because `npm run dev` stops everything together).
try {
  rmSync(outdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
} catch (error) {
  console.warn(`[extension] couldn't clear dist/ (${error.code ?? error.message}); building over it.`);
}
mkdirSync(outdir, { recursive: true });

const copyStatic = {
  name: "copy-static",
  setup(build) {
    build.onEnd((result) => {
      cpSync(path.join(root, "public"), outdir, { recursive: true });
      const status = result.errors.length ? `✖ ${result.errors.length} error(s)` : "✔ built";
      console.log(`[extension] ${status} → ${path.relative(process.cwd(), outdir) || "dist"}`);
    });
  },
};

const options = {
  entryPoints: {
    content: path.join(root, "src/content/index.ts"),
    "service-worker": path.join(root, "src/background/service-worker.ts"),
    sidepanel: path.join(root, "src/sidepanel/main.tsx"),
  },
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome114",
  jsx: "automatic",
  minify: !isWatch,
  sourcemap: isWatch ? "inline" : false,
  logLevel: "warning",
  define: { "process.env.NODE_ENV": JSON.stringify(isWatch ? "development" : "production") },
  plugins: [copyStatic],
};

if (isWatch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("[extension] watching for changes… reload the extension in chrome://extensions after edits to the service worker.");
} else {
  await esbuild.build(options);
}
