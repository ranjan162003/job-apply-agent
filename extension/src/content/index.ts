// Injected into the page (and its frames) by the side panel when the user scans.
// It only reads the page, plus a marker attribute per field and a highlight on request.

import type { ApplyCopilotPageApi, FrameScan } from "../shared/fields";
import { extractFields, ID_ATTRIBUTE } from "./extract";
import { detectSite, jobContext } from "./sites";

const VERSION = "0.1.0";
const HIGHLIGHT_CLASS = "apply-copilot-highlight";

function ensureHighlightStyle(doc: Document) {
  if (doc.getElementById("apply-copilot-style")) return;
  const style = doc.createElement("style");
  style.id = "apply-copilot-style";
  style.textContent = `.${HIGHLIGHT_CLASS} {
    outline: 3px solid #6366f1 !important;
    outline-offset: 3px !important;
    border-radius: 4px;
    transition: outline-color 0.3s ease;
  }`;
  doc.head.appendChild(style);
}

function scan(): FrameScan {
  const site = detectSite(location.hostname);
  return {
    url: location.href,
    site,
    job: jobContext(document, site, location.hostname),
    fields: extractFields(document),
  };
}

function highlight(fieldId: string): boolean {
  const target = document.querySelector<HTMLElement>(`[${ID_ATTRIBUTE}="${CSS.escape(fieldId)}"]`);
  if (!target) return false;
  // Hidden inputs (custom radios, file pickers): point at the visible wrapper instead.
  const visible = target.closest("label") ?? (target.offsetParent ? target : target.parentElement) ?? target;
  ensureHighlightStyle(document);
  visible.scrollIntoView({ block: "center", behavior: "smooth" });
  visible.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => visible.classList.remove(HIGHLIGHT_CLASS), 2200);
  return true;
}

// Injecting twice (a rescan) must not redefine anything.
if (!window.__applyCopilot || window.__applyCopilot.version !== VERSION) {
  const api: ApplyCopilotPageApi = { version: VERSION, scan, highlight };
  window.__applyCopilot = api;
}
