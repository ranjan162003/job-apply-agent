// Put values into form fields the way a person would, so React/Vue/Workday forms notice the change.
//
// Text is typed with the browser's insertText command (trusted events). Where that can't work,
// the prototype's value setter is called (React ignores `input.value = x`), then events are fired.

import type { FillOutcome, FillRequest } from "../shared/fields";
import { ID_ATTRIBUTE } from "./extract";
import { collapse, findLabel } from "./labels";

function elementsFor(doc: Document, fieldId: string): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(`[${ID_ATTRIBUTE}]`)).filter((el) => el.getAttribute(ID_ATTRIBUTE) === fieldId);
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const view = el.ownerDocument.defaultView!;
  const proto =
    el.tagName === "TEXTAREA" ? view.HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fire(el: HTMLElement, ...types: string[]) {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
}

function same(a: string, b: string): boolean {
  return collapse(a).toLowerCase() === collapse(b).toLowerCase();
}

/**
 * Type the text with the browser's own "insert text" command. It produces real (trusted)
 * beforeinput/input events, exactly like typing, which forms such as Workday require: they
 * ignore script-made events and then report a visibly filled field as empty.
 */
function insertText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  const doc = el.ownerDocument;
  if (typeof doc.execCommand !== "function") return false;
  el.select(); // replace whatever is there
  try {
    return doc.execCommand("insertText", false, value) && el.value === value;
  } catch {
    return false;
  }
}

/**
 * When the user clicks "Fill" the side panel has keyboard focus, not the page. Chrome then
 * doesn't fire the page's focus/blur events, yet forms like Workday save a field's value
 * only when it loses focus. So those events are sent by hand when the page isn't focused.
 */
function focusField(el: HTMLElement): boolean {
  el.focus({ preventScroll: true });
  const pageHasFocus = el.ownerDocument.hasFocus();
  if (!pageHasFocus) {
    el.dispatchEvent(new FocusEvent("focus"));
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  }
  return pageHasFocus;
}

function leaveField(el: HTMLElement, pageHasFocus: boolean) {
  if (pageHasFocus) {
    el.blur(); // real blur/focusout
  } else {
    el.dispatchEvent(new FocusEvent("blur"));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    el.blur();
  }
}

function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): FillOutcome["status"] {
  const pageHasFocus = focusField(el);
  if (!insertText(el, value)) {
    // Fallback (no page focus, date inputs): the native setter, so React's value tracker sees a change.
    setNativeValue(el, value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }
  fire(el, "change");
  leaveField(el, pageHasFocus); // where Workday and many other forms save and validate
  return el.value === value ? "filled" : "failed";
}

function fillSelect(select: HTMLSelectElement, value: string): FillOutcome["status"] {
  const option = Array.from(select.options).find((o) => same(o.text, value) || o.value === value);
  if (!option) return "failed";
  const pageHasFocus = focusField(select);
  setNativeValue(select, option.value);
  fire(select, "input", "change");
  leaveField(select, pageHasFocus);
  return select.value === option.value ? "filled" : "failed";
}

/** Only "I currently work here"-style boxes get here; consent boxes are never sent to fill. */
function fillCheckbox(box: HTMLInputElement, value: string): FillOutcome["status"] {
  const wanted = value === "true";
  if (box.checked !== wanted) box.click();
  return box.checked === wanted ? "filled" : "failed";
}

function fillRadio(radios: HTMLInputElement[], value: string): FillOutcome["status"] {
  const choice = radios.find((radio) => {
    const label = findLabel(radio);
    return same(label.source === "name" || label.source === "none" ? radio.value : label.text, value) || radio.value === value;
  });
  if (!choice) return "failed";
  if (!choice.checked) choice.click(); // a real click fires every event the page listens for
  return choice.checked ? "filled" : "failed";
}

function hasValue(el: HTMLElement, all: HTMLElement[]): boolean {
  if (el instanceof el.ownerDocument.defaultView!.HTMLSelectElement) return el.selectedIndex > 0 && el.value !== "";
  const input = el as HTMLInputElement;
  if (input.type === "radio") return all.some((r) => (r as HTMLInputElement).checked);
  if (input.type === "file") return Boolean(input.files?.length);
  return Boolean(input.value?.trim());
}

export function fillFields(doc: Document, requests: FillRequest[], overwrite = false): FillOutcome[] {
  return requests.map(({ id, value: requested }) => {
    let value = requested;
    const all = elementsFor(doc, id);
    const el = all[0];
    if (!el) return { id, status: "missing" };
    const input = el as HTMLInputElement;
    if (input.type === "checkbox") return { id, status: fillCheckbox(input, value) };
    if (!overwrite && hasValue(el, all)) return { id, status: "kept" };
    // <input type=month> wants "2023-03", not the "2023-03-01" sent for date inputs.
    if (input.type === "month" && /^\d{4}-\d{2}-\d{2}$/.test(value)) value = value.slice(0, 7);
    try {
      if (el.tagName === "SELECT") return { id, status: fillSelect(el as HTMLSelectElement, value) };
      if ((el as HTMLInputElement).type === "radio") return { id, status: fillRadio(all as HTMLInputElement[], value) };
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return { id, status: fillText(el as HTMLInputElement, value) };
      return { id, status: "failed" };
    } catch {
      return { id, status: "failed" };
    }
  });
}

/** Attach a file to an `<input type=file>`, as if the user had picked it. */
export function attachFile(doc: Document, id: string, base64: string, filename: string, mimeType: string): FillOutcome {
  const input = elementsFor(doc, id)[0] as HTMLInputElement | undefined;
  if (!input || input.type !== "file") return { id, status: "missing" };
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const file = new File([bytes], filename, { type: mimeType });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  fire(input, "input", "change");
  return { id, status: input.files?.length ? "filled" : "failed" };
}
