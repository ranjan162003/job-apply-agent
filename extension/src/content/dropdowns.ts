// Custom dropdowns and type-to-search boxes: their choices only exist once opened.
//
// openAndListOptions() opens the dropdown (or types the search text) and returns the visible
// choices; the side panel asks the backend which one matches; chooseOption() clicks it.

import { ID_ATTRIBUTE } from "./extract";
import { collapse } from "./labels";

const OPTION_SELECTOR = "[role='option'], [data-automation-id='promptOption'], [data-automation-id='menuItem']";
const WAIT_MS = 3000;

function elementFor(doc: Document, fieldId: string): HTMLElement | null {
  return Array.from(doc.querySelectorAll<HTMLElement>(`[${ID_ATTRIBUTE}]`)).find((el) => el.getAttribute(ID_ATTRIBUTE) === fieldId) ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isShown(el: Element): boolean {
  const box = (el as HTMLElement).getBoundingClientRect?.();
  const checkable = el as Element & { checkVisibility?: () => boolean };
  if (typeof checkable.checkVisibility === "function") return checkable.checkVisibility();
  return !box || box.width > 0 || box.height > 0 || !(el as HTMLElement).closest("[hidden]");
}

function visibleOptions(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).filter(
    (el) => isShown(el) && collapse(el.textContent ?? "") !== "" && el.getAttribute("aria-disabled") !== "true",
  );
}

/** Mouse events in the order a real click produces them; some menus act on mousedown. */
function press(el: HTMLElement) {
  const view = el.ownerDocument.defaultView!;
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    const Ctor = type.startsWith("pointer") && "PointerEvent" in view ? view.PointerEvent : view.MouseEvent;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
  }
  el.click();
}

function typeSearch(input: HTMLInputElement, text: string) {
  input.focus({ preventScroll: true });
  input.select();
  const typed = typeof input.ownerDocument.execCommand === "function" && input.ownerDocument.execCommand("insertText", false, text);
  if (!typed || input.value !== text) {
    const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView!.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, text);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
  // Workday-style search boxes search on Enter. Never inside a <form>: Enter could submit it.
  if (!input.form) {
    for (const type of ["keydown", "keyup"]) {
      input.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
    }
  }
}

async function waitForOptions(doc: Document, before: Set<HTMLElement>): Promise<HTMLElement[]> {
  const deadline = Date.now() + WAIT_MS;
  let last: HTMLElement[] = [];
  while (Date.now() < deadline) {
    await sleep(150);
    const options = visibleOptions(doc);
    const fresh = options.some((o) => !before.has(o));
    // Wait until the list stops changing (search results load in steps).
    if (options.length > 0 && (fresh || before.size === 0) && options.length === last.length) return options;
    last = options;
  }
  return last;
}

/** Open the dropdown (typing `searchText` for search boxes) and return the choices it shows. */
export async function openAndListOptions(doc: Document, fieldId: string, searchText: string | null): Promise<string[]> {
  const el = elementFor(doc, fieldId);
  if (!el) return [];
  el.scrollIntoView?.({ block: "center" });
  const before = new Set(visibleOptions(doc));
  if (el.tagName === "INPUT") {
    typeSearch(el as HTMLInputElement, searchText ?? "");
  } else {
    press(el);
  }
  const options = await waitForOptions(doc, before);
  return [...new Set(options.map((o) => collapse(o.textContent ?? "")))].slice(0, 400);
}

/** Click the choice with this text in the open list. Without one, the list is closed again. */
export async function chooseOption(doc: Document, fieldId: string, optionText: string | null): Promise<boolean> {
  const el = elementFor(doc, fieldId);
  const target = optionText ? visibleOptions(doc).find((o) => collapse(o.textContent ?? "") === optionText) : undefined;
  if (!target) {
    (doc.activeElement ?? doc.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    return false;
  }
  target.scrollIntoView?.({ block: "nearest" });
  press(target);
  await sleep(250);
  el?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  return true;
}
