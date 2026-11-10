// Put values into form fields the way a person would, so React/Vue forms notice the change.
//
// Setting `input.value = x` directly is ignored by React: it tracks the value through the
// native setter. So the prototype's setter is called, then input/change/blur events are fired.

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

function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): FillOutcome["status"] {
  el.focus({ preventScroll: true });
  setNativeValue(el, value);
  fire(el, "input", "change");
  el.blur(); // fires blur/focusout, where many forms validate
  return el.value === value ? "filled" : "failed";
}

function fillSelect(select: HTMLSelectElement, value: string): FillOutcome["status"] {
  const option = Array.from(select.options).find((o) => same(o.text, value) || o.value === value);
  if (!option) return "failed";
  setNativeValue(select, option.value);
  fire(select, "input", "change");
  return select.value === option.value ? "filled" : "failed";
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
  return requests.map(({ id, value }) => {
    const all = elementsFor(doc, id);
    const el = all[0];
    if (!el) return { id, status: "missing" };
    if (!overwrite && hasValue(el, all)) return { id, status: "kept" };
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
