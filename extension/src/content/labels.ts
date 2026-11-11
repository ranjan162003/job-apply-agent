// Find the human-readable question for a form control.
//
// Order (best first): <label>, aria-labelledby / aria-label, placeholder, nearby text,
// then the name attribute. Each step is a fallback for forms that skip the one before.

import type { LabelSource } from "../shared/fields";

const MAX_LABEL_LENGTH = 300;
const REQUIRED_MARK = /\s*(\*|\(required\))\s*$/i;

export interface FoundLabel {
  text: string;
  source: LabelSource;
  /** The label itself said it's required ("Email *"). */
  markedRequired: boolean;
}

/** Visible text of a node, without the text of controls inside it (option lists, typed values). */
export function readableText(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  clone.querySelectorAll("select, option, textarea, input, script, style, svg, [aria-hidden='true']").forEach((n) => n.remove());
  return collapse(clone.textContent ?? "");
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function cleanLabel(raw: string): { text: string; markedRequired: boolean } {
  let text = collapse(raw).replace(/[:：]\s*$/, "");
  const markedRequired = REQUIRED_MARK.test(text) || text.startsWith("*");
  text = text.replace(REQUIRED_MARK, "").replace(/^\*\s*/, "").replace(/[:：]\s*$/, "").trim();
  if (text.length > MAX_LABEL_LENGTH) text = `${text.slice(0, MAX_LABEL_LENGTH - 1)}…`;
  return { text, markedRequired };
}

function byIds(doc: Document, ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id))
    .filter((el): el is HTMLElement => el !== null)
    .map(readableText)
    .join(" ");
}

function result(raw: string, source: LabelSource): FoundLabel | null {
  const { text, markedRequired } = cleanLabel(raw);
  return text ? { text, source, markedRequired } : null;
}

export function labelFromLabelElement(el: HTMLElement): FoundLabel | null {
  const doc = el.ownerDocument;
  if (el.id) {
    // Compared directly rather than with a selector, so odd ids ("q[1].text") need no escaping.
    const forLabel = Array.from(doc.querySelectorAll("label[for]")).find((label) => label.getAttribute("for") === el.id);
    if (forLabel) {
      const found = result(readableText(forLabel), "label");
      if (found) return found;
    }
  }
  const wrapping = el.closest("label");
  return wrapping ? result(readableText(wrapping), "label") : null;
}

export function labelFromAria(el: Element): FoundLabel | null {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const found = result(byIds(el.ownerDocument, labelledBy), "aria");
    if (found) return found;
  }
  const ariaLabel = el.getAttribute("aria-label");
  return ariaLabel ? result(ariaLabel, "aria") : null;
}

/**
 * The closest text before the control: a sibling's text, walking up a few levels.
 * Catches `<div>Notice period</div><div><input></div>` layouts with no <label>.
 */
export function labelFromNearbyText(el: Element, maxLevels = 4): FoundLabel | null {
  let node: Element | null = el;
  for (let level = 0; node && level < maxLevels; level++) {
    let sibling = node.previousElementSibling;
    for (let hops = 0; sibling && hops < 3; hops++, sibling = sibling.previousElementSibling) {
      if (sibling.matches("input, select, textarea") || sibling.querySelector("input, select, textarea")) break;
      if (sibling.matches("button, [role='button']")) continue; // "Attach" / "Upload" buttons next to file inputs
      const text = readableText(sibling);
      if (text && text.length <= MAX_LABEL_LENGTH) return result(text, "nearby");
    }
    node = node.parentElement;
    if (node?.matches("form, body")) break;
  }
  return null;
}

/** "first_name" or "job_application[answers][0][text]" → "first name" / "text". Last resort. */
export function labelFromName(name: string | null): FoundLabel | null {
  if (!name) return null;
  const parts = name.split(/[[\]]+/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : name;
  if (/^\d+$/.test(last)) return null;
  return result(last.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), "name");
}

export function findLabel(el: HTMLElement): FoundLabel {
  const placeholder = el.getAttribute("placeholder");
  return (
    labelFromLabelElement(el) ??
    labelFromAria(el) ??
    (placeholder ? result(placeholder, "placeholder") : null) ??
    labelFromNearbyText(el) ??
    labelFromName(el.getAttribute("name")) ?? { text: "", source: "none", markedRequired: false }
  );
}
