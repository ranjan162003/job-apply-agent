// One-time (and after-pull) setup: checks tools, then installs backend + frontend + runner deps.
//   node setup.mjs   (or: npm run setup)
// Uses only Node built-ins, so it works before anything is installed.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { backendDir, getBackendEnvironment, projectRoot } from "./backend-environment.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";

function run(label, command, args, cwd, env = process.env) {
  console.log(`\n▶ ${label}\n  (${path.relative(projectRoot, cwd) || "."}) ${command} ${args.join(" ")}`);
  // npm is a .cmd shim on Windows, which needs a shell to launch.
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: isWindows && command === npmCommand });
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed.`);
    if (command === "uv") {
      console.error(
        "  If it says 'Access is denied', the backend is probably still running (it locks its package files).\n" +
          "  Stop it with Ctrl+C, then run setup again.",
      );
    }
    process.exit(result.status ?? 1);
  }
}

function requireTool(name, args, installHint) {
  const result = spawnSync(name, args, { encoding: "utf8", shell: isWindows && name === npmCommand });
  if (result.status !== 0) {
    console.error(`✖ ${name} isn't installed or isn't on PATH.\n  ${installHint}`);
    process.exit(1);
  }
  return result.stdout.trim();
}

console.log("Checking tools…");
const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  console.error(`✖ Node ${process.versions.node} is too old — install Node 20 or newer from https://nodejs.org`);
  process.exit(1);
}
console.log(`  ✔ node ${process.versions.node}`);
console.log(`  ✔ npm ${requireTool(npmCommand, ["--version"], "It ships with Node: https://nodejs.org")}`);
console.log(
  `  ✔ ${requireTool(
    "uv",
    ["--version"],
    isWindows
      ? 'Install: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
      : "Install: curl -LsSf https://astral.sh/uv/install.sh | sh",
  )}`,
);

const backendEnvironment = getBackendEnvironment();
console.log(`\nPython environment: ${backendEnvironment.description}`);
run("Backend: install Python + packages from uv.lock", "uv", ["sync"], backendDir, backendEnvironment.env);
run("Dashboard: install npm packages", npmCommand, ["install", "--no-audit", "--no-fund"], path.join(projectRoot, "dashboard"));
run("Extension: install npm packages", npmCommand, ["install", "--no-audit", "--no-fund"], path.join(projectRoot, "extension"));
run("Runner: install npm packages", npmCommand, ["install", "--no-audit", "--no-fund"], scriptsDir);

console.log("\n✔ Setup complete. Start the app with:  npm run dev   (from the scripts folder)");
