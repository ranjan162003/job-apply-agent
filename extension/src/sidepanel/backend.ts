// Calls to the local Apply Copilot backend. Every request carries the pairing token.

import type { PanelSettings } from "./settings";

export interface BackendHello {
  app_name: string;
  version: string;
  profile_completeness: number;
}

export type BackendState =
  | { status: "checking" }
  | { status: "connected"; hello: BackendHello }
  | { status: "unpaired"; message: string }
  | { status: "offline"; message: string };

export async function checkBackend(settings: PanelSettings): Promise<BackendState> {
  const base = settings.backendUrl.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/api/ext/hello`, {
      headers: { "X-Apply-Copilot-Token": settings.token, "X-Apply-Copilot-Client": "extension" },
    });
  } catch {
    return {
      status: "offline",
      message: `Can't reach the app at ${base}. Start it with: cd scripts, then npm run dev.`,
    };
  }
  if (response.status === 401) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    return { status: "unpaired", message: body?.detail ?? "Paste the pairing code from the dashboard." };
  }
  if (!response.ok) return { status: "offline", message: `The app answered with an error (${response.status}).` };
  return { status: "connected", hello: (await response.json()) as BackendHello };
}
