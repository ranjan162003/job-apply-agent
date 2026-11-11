// Inject the content script into the active tab (all frames it may access) and collect each
// frame's scan. Application forms are often in an iframe (embedded Greenhouse boards).

import type { PageFrameScan } from "../shared/fields";

export type ScanOutcome =
  | { status: "ok"; tabId: number; url: string; frames: PageFrameScan[] }
  | { status: "restricted"; url: string } // chrome://, the Web Store, PDFs…
  | { status: "needs-permission"; tabId: number; url: string; origin: string }
  | { status: "error"; message: string };

const RESTRICTED = /^(chrome|edge|about|chrome-extension|devtools|view-source):|^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/;

export async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function scanActiveTab(): Promise<ScanOutcome> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) return { status: "error", message: "No page is open in this window." };
  if (RESTRICTED.test(tab.url) || !/^https?:/.test(tab.url)) return { status: "restricted", url: tab.url };

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.__applyCopilot?.scan() ?? null,
    });
    const frames = results
      .filter((r) => r.result)
      .map((r) => ({ ...(r.result as Omit<PageFrameScan, "frameId">), frameId: r.frameId }));
    return { status: "ok", tabId: tab.id, url: tab.url, frames };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cannot access|permission|host/i.test(message)) {
      return { status: "needs-permission", tabId: tab.id, url: tab.url, origin: new URL(tab.url).origin };
    }
    return { status: "error", message };
  }
}

/** Must run inside a click handler: Chrome only shows the permission prompt for a user gesture. */
export async function requestSiteAccess(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

export async function highlightField(tabId: number, frameId: number, fieldId: string): Promise<boolean> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (id: string) => window.__applyCopilot?.highlight(id) ?? false,
    args: [fieldId],
  });
  return Boolean(result?.result);
}
