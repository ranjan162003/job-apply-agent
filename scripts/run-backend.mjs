// Starts the FastAPI backend through uv (which keeps the virtualenv in sync with uv.lock).
//   node run-backend.mjs          -> uvicorn dev server on 127.0.0.1:8010
//   node run-backend.mjs --tests  -> pytest
import { spawn, spawnSync } from "node:child_process";

import { backendDir, getBackendEnvironment } from "./backend-environment.mjs";

if (spawnSync("uv", ["--version"], { stdio: "ignore" }).status !== 0) {
  console.error(
    "uv isn't installed or isn't on PATH.\n" +
      "Install it: https://docs.astral.sh/uv/getting-started/installation/  (or: pip install uv)",
  );
  process.exit(1);
}

const { env, description } = getBackendEnvironment();
console.log(`Python environment: ${description}`);

const args = process.argv.includes("--tests")
  ? ["run", "pytest", "-q"]
  : ["run", "uvicorn", "app.main:app", "--reload", "--reload-dir", "app", "--host", "127.0.0.1", "--port", "8010"];

const child = spawn("uv", args, { cwd: backendDir, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
