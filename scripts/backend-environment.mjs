// Where the backend's Python virtualenv lives, shared by setup.mjs and run-backend.mjs.
//
// Normally uv uses backend/.venv. But when the project sits inside a OneDrive folder,
// OneDrive marks the thousands of package files as synced, read-only items and uv can't
// replace them ("Access is denied"). In that case we keep the virtualenv in local app
// data instead (via uv's UV_PROJECT_ENVIRONMENT) — the source code stays where it is.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const backendDir = path.join(projectRoot, "backend");

function isInsideOneDrive(dir) {
  const oneDriveRoots = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]
    .filter(Boolean)
    .map((root) => path.resolve(root).toLowerCase());
  const target = path.resolve(dir).toLowerCase();
  return oneDriveRoots.some((root) => target.startsWith(root + path.sep)) || /[\\/]onedrive[\\/]/i.test(target);
}

/** Env vars to pass to every `uv` command, plus a human-readable description. */
export function getBackendEnvironment() {
  if (process.env.UV_PROJECT_ENVIRONMENT) {
    return { env: process.env, description: `UV_PROJECT_ENVIRONMENT=${process.env.UV_PROJECT_ENVIRONMENT}` };
  }
  if (!isInsideOneDrive(backendDir)) {
    return { env: process.env, description: "backend/.venv" };
  }
  const localData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share");
  const venvPath = path.join(localData, "job-apply-agent", "backend-venv");
  return {
    env: { ...process.env, UV_PROJECT_ENVIRONMENT: venvPath, UV_LINK_MODE: "copy" },
    description: `${venvPath} (outside OneDrive, so syncing can't lock it)`,
  };
}
