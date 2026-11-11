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

export type MatchStatus = "fill" | "empty_in_profile" | "no_option" | "unknown" | "skipped";

export interface FieldMatch {
  id: string;
  status: MatchStatus;
  profile_key: string | null;
  profile_label: string | null;
  value: string | null;
  resume_id: number | null;
  resume_filename: string | null;
  pick_from_list: boolean;
  note: string | null;
}

function authedHeaders(settings: PanelSettings): Record<string, string> {
  return { "X-Apply-Copilot-Token": settings.token, "X-Apply-Copilot-Client": "extension" };
}

async function failure(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { detail?: string } | null;
  return new Error(body?.detail ?? `The app answered with an error (${response.status}).`);
}

export interface MatchField {
  id: string;
  kind: string;
  label: string;
  options: string[];
  name: string | null;
  html_id: string | null;
  autocomplete: string | null;
  placeholder: string | null;
  max_length: number | null;
  section: string | null;
}

/** Ask the backend what goes in each field. Only labels and field metadata are sent, never page text. */
export async function matchFields(settings: PanelSettings, site: string, fields: MatchField[]): Promise<FieldMatch[]> {
  const response = await fetch(`${settings.backendUrl.replace(/\/+$/, "")}/api/ext/match`, {
    method: "POST",
    headers: { ...authedHeaders(settings), "Content-Type": "application/json" },
    body: JSON.stringify({ site, fields }),
  });
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as { matches: FieldMatch[] }).matches;
}

/** The resume file as base64, ready to hand to the content script. */
export async function downloadResume(settings: PanelSettings, resumeId: number): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(`${settings.backendUrl.replace(/\/+$/, "")}/api/ext/resumes/${resumeId}/file`, {
    headers: authedHeaders(settings),
  });
  if (!response.ok) throw await failure(response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), mimeType: response.headers.get("Content-Type") ?? "application/octet-stream" };
}

/** Which of an opened dropdown's choices matches the answer; null when none clearly does. */
export async function pickOption(settings: PanelSettings, value: string, options: string[]): Promise<string | null> {
  const response = await fetch(`${settings.backendUrl.replace(/\/+$/, "")}/api/ext/pick`, {
    method: "POST",
    headers: { ...authedHeaders(settings), "Content-Type": "application/json" },
    body: JSON.stringify({ value, options }),
  });
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as { option: string | null }).option;
}

/** How many jobs and schools the profile has, so the page can show one block for each. */
export async function fetchEntryCounts(settings: PanelSettings): Promise<{ jobs: number; schools: number }> {
  const response = await fetch(`${settings.backendUrl.replace(/\/+$/, "")}/api/ext/profile`, { headers: authedHeaders(settings) });
  if (!response.ok) throw await failure(response);
  const profile = (await response.json()) as { experiences: unknown[]; educations: unknown[] };
  return { jobs: profile.experiences.length, schools: profile.educations.length };
}
