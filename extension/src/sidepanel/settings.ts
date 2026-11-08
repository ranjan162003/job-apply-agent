// Side panel settings, kept in chrome.storage.local (this browser profile only).

export interface PanelSettings {
  backendUrl: string;
  token: string;
}

export const DEFAULT_SETTINGS: PanelSettings = {
  backendUrl: "http://127.0.0.1:8010",
  token: "",
};

const STORAGE_KEY = "applyCopilotSettings";

export async function loadSettings(): Promise<PanelSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] as Partial<PanelSettings> | undefined) };
}

export async function saveSettings(settings: PanelSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}
