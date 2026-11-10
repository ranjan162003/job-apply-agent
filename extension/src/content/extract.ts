// List every fillable control on a page: its label, kind, options and whether it's required.
// Read-only: nothing on the page is changed except a `data-apply-copilot-id` marker.

import type { ExtractedField, FieldKind } from "../shared/fields";
import { cleanLabel, collapse, findLabel, labelFromAria, labelFromNearbyText, readableText, type FoundLabel } from "./labels";

export const ID_ATTRIBUTE = "data-apply-copilot-id";

const SKIPPED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "search", "password"]);
const INPUT_KINDS: Record<string, FieldKind> = {
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
  month: "date",
  file: "file",
  radio: "radio",
  checkbox: "checkbox",
};
// Custom inputs are often visually hidden behind a styled button or label; keep them anyway.
const KEEP_WHEN_HIDDEN = new Set(["file", "radio", "checkbox"]);
const CUSTOM_SELECT_SELECTOR = "button[aria-haspopup='listbox'], [role='combobox']:not(input), [role='listbox'][aria-label]";

// Hidden "trap" fields for bots. Filling one gets an application flagged as spam.
const HONEYPOT_LABEL = /\b(robots?|bots?|spam)\b.*\bonly\b|for robots|leave (this|it) (field )?(blank|empty)|do not (fill|enter|complete)|if you('|’)re (a )?human/i;
const HONEYPOT_NAME = /honey ?pot|^hp_|bot_?trap|winnie/i;

let nextId = 1;

function fieldId(el: Element): string {
  let id = el.getAttribute(ID_ATTRIBUTE);
  if (!id) {
    // Unique across rescans and iframes of the same page.
    id = `ac${Date.now().toString(36)}${(nextId++).toString(36)}`;
    el.setAttribute(ID_ATTRIBUTE, id);
  }
  return id;
}

/** Rendered and not hidden by CSS. Uses `checkVisibility` in Chrome; a computed-style walk elsewhere (tests). */
export function isRendered(el: Element): boolean {
  const checkable = el as Element & { checkVisibility?: (options?: object) => boolean };
  if (typeof checkable.checkVisibility === "function") {
    return checkable.checkVisibility({ visibilityProperty: true });
  }
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as HTMLElement).hidden || node.getAttribute("aria-hidden") === "true") return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  }
  return true;
}

function isRequired(el: Element, label: FoundLabel): boolean {
  return (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true" || label.markedRequired;
}

function inputKind(el: Element): FieldKind | null {
  if (el.tagName === "TEXTAREA") return "textarea";
  if (el.tagName === "SELECT") return "select";
  const input = el as HTMLInputElement;
  const type = (input.getAttribute("type") ?? "text").toLowerCase();
  if (SKIPPED_INPUT_TYPES.has(type)) return null;
  if (input.getAttribute("role") === "combobox" || input.getAttribute("aria-autocomplete") === "list") return "combobox";
  return INPUT_KINDS[type] ?? "text";
}

/** The nearest fieldset legend or heading above the control. A legend that is the field's own question doesn't count. */
function sectionFor(el: Element, headings: Element[], label: string): string | null {
  const legend = el.closest("fieldset")?.querySelector(":scope > legend");
  if (legend) {
    const text = cleanLabel(readableText(legend)).text;
    if (text && text !== label) return text;
  }
  let section: string | null = null;
  for (const heading of headings) {
    // DOCUMENT_POSITION_FOLLOWING: `el` comes after this heading.
    if (heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) section = readableText(heading) || section;
    else break;
  }
  return section;
}

function selectOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .filter((option) => option.value !== "" && !/^(select|choose|please select|--)/i.test(collapse(option.text)))
    .map((option) => collapse(option.text))
    .filter(Boolean);
}

function choiceLabel(input: HTMLInputElement): string {
  const own = findLabel(input);
  return own.source === "name" || own.source === "none" ? input.value : own.text;
}

/** The question a radio/checkbox group asks: legend, ARIA group label, or the text before the group. */
function groupLabel(members: HTMLInputElement[]): FoundLabel {
  const first = members[0];
  const fieldset = first.closest("fieldset");
  const legend = fieldset?.querySelector(":scope > legend");
  if (legend && members.every((m) => fieldset!.contains(m))) {
    const { text, markedRequired } = cleanLabel(readableText(legend));
    if (text) return { text, source: "legend", markedRequired };
  }
  const group = first.closest("[role='radiogroup'], [role='group']");
  if (group) {
    const aria = labelFromAria(group);
    if (aria) return aria;
  }
  // Text before the smallest element that wraps the whole group.
  let container: Element | null = first.parentElement;
  while (container && !members.every((m) => container!.contains(m))) container = container.parentElement;
  return (container && labelFromNearbyText(container)) ?? { text: "", source: "none", markedRequired: false };
}

function baseField(el: HTMLElement, kind: FieldKind, label: FoundLabel, headings: Element[]): ExtractedField {
  const input = el as HTMLInputElement;
  const maxLength = input.maxLength;
  return {
    id: fieldId(el),
    kind,
    label: label.text,
    labelSource: label.source,
    required: isRequired(el, label),
    options: [],
    hasValue: false,
    section: sectionFor(el, headings, label.text),
    name: el.getAttribute("name"),
    htmlId: el.id || null,
    autocomplete: el.getAttribute("autocomplete"),
    placeholder: el.getAttribute("placeholder"),
    maxLength: typeof maxLength === "number" && maxLength > 0 ? maxLength : null,
    accept: kind === "file" ? el.getAttribute("accept") : null,
  };
}

export function extractFields(doc: Document): ExtractedField[] {
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, [role='heading']"));
  const fields: ExtractedField[] = [];
  const groups = new Map<string, HTMLInputElement[]>();
  const groupOrder: { key: string; position: number }[] = [];

  const controls = doc.querySelectorAll<HTMLElement>(`input, select, textarea, ${CUSTOM_SELECT_SELECTOR}`);
  controls.forEach((el) => {
    if (el.closest("[role='search'], form[role='search']") || (el as HTMLInputElement).disabled) return;

    const isCustomSelect = el.matches(CUSTOM_SELECT_SELECTOR);
    const kind: FieldKind | null = isCustomSelect ? "custom-select" : inputKind(el);
    if (!kind) return;
    if (!KEEP_WHEN_HIDDEN.has(kind) && !isRendered(el)) return;
    if (KEEP_WHEN_HIDDEN.has(kind) && el.closest("[hidden], [aria-hidden='true']")) return;

    if (kind === "radio" || kind === "checkbox") {
      const input = el as HTMLInputElement;
      const scope = input.form?.id ?? (input.form ? "form" : "page");
      const key = input.name ? `${kind}:${scope}:${input.name}` : `${kind}:solo:${fieldId(input)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        groupOrder.push({ key, position: fields.length });
        fields.push(null as unknown as ExtractedField); // placeholder, filled once the group is complete
      }
      groups.get(key)!.push(input);
      return;
    }

    const label = findLabel(el);
    if (HONEYPOT_LABEL.test(label.text) || HONEYPOT_NAME.test(el.getAttribute("name") ?? "")) return;
    // A dropdown with no question near it is page chrome (language or region pickers), not the form.
    if (kind === "custom-select" && label.source === "none") return;
    const field = baseField(el, kind, label, headings);
    if (kind === "select") {
      const select = el as HTMLSelectElement;
      field.options = selectOptions(select);
      field.hasValue = select.value !== "" && select.selectedIndex > 0;
    } else if (kind === "custom-select") {
      field.hasValue = Boolean(collapse(el.textContent ?? "")) && !/^(select|choose)/i.test(collapse(el.textContent ?? ""));
    } else if (kind === "file") {
      field.hasValue = Boolean((el as HTMLInputElement).files?.length);
    } else {
      field.hasValue = Boolean((el as HTMLInputElement).value?.trim());
    }
    fields.push(field);
  });

  for (const { key, position } of groupOrder) {
    const members = groups.get(key)!;
    const first = members[0];
    const isSoloCheckbox = first.type === "checkbox" && members.length === 1;
    const label = isSoloCheckbox ? findLabel(first) : groupLabel(members);
    const kind: FieldKind = first.type === "radio" ? "radio" : isSoloCheckbox ? "checkbox" : "checkbox-group";
    const field = baseField(first, kind, label, headings);
    field.required = members.some((m) => m.required) || label.markedRequired || first.closest("[aria-required='true']") !== null;
    field.options = isSoloCheckbox ? [] : members.map(choiceLabel);
    field.hasValue = members.some((m) => m.checked);
    members.slice(1).forEach((m) => m.setAttribute(ID_ATTRIBUTE, field.id));
    fields[position] = field;
  }

  return fields;
}
