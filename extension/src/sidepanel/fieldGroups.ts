// Turn per-frame scans into what the side panel lists: grouped by section, with filters and counts.

import type { ExtractedField, FieldKind, PageFrameScan } from "../shared/fields";

export interface ListedField extends ExtractedField {
  frameId: number;
}

export interface FieldSection {
  title: string;
  fields: ListedField[];
}

export type FieldFilter = "all" | "required" | "empty";

export const KIND_LABELS: Record<FieldKind, string> = {
  text: "Text",
  email: "Email",
  tel: "Phone",
  url: "Link",
  number: "Number",
  date: "Date",
  textarea: "Long answer",
  select: "Dropdown",
  "custom-select": "Dropdown",
  combobox: "Search box",
  radio: "Choice",
  checkbox: "Checkbox",
  "checkbox-group": "Multi-choice",
  file: "File upload",
};

export function allFields(frames: PageFrameScan[]): ListedField[] {
  // The top page first, then iframes, in page order.
  return [...frames]
    .sort((a, b) => a.frameId - b.frameId)
    .flatMap((frame) => frame.fields.map((field) => ({ ...field, frameId: frame.frameId })));
}

export function applyFilter(fields: ListedField[], filter: FieldFilter): ListedField[] {
  if (filter === "required") return fields.filter((f) => f.required);
  if (filter === "empty") return fields.filter((f) => !f.hasValue);
  return fields;
}

/** Consecutive fields with the same section stay together; untitled ones go under "Form". */
export function groupBySection(fields: ListedField[]): FieldSection[] {
  const sections: FieldSection[] = [];
  for (const field of fields) {
    const title = field.section ?? "Form";
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.fields.push(field);
    else sections.push({ title, fields: [field] });
  }
  return sections;
}

export function summarize(fields: ListedField[]) {
  return {
    total: fields.length,
    required: fields.filter((f) => f.required).length,
    filled: fields.filter((f) => f.hasValue).length,
    unlabelled: fields.filter((f) => f.labelSource === "none").length,
  };
}

/** The job the page is for, from whichever frame knows best (the form's frame usually). */
export function bestJob(frames: PageFrameScan[]) {
  const withFields = [...frames].sort((a, b) => b.fields.length - a.fields.length);
  const top = frames.find((f) => f.frameId === 0) ?? withFields[0];
  const formFrame = withFields[0] ?? top;
  return {
    site: formFrame?.site ?? top?.site ?? "generic",
    heading: formFrame?.job.heading ?? top?.job.heading ?? null,
    company: formFrame?.job.company ?? top?.job.company ?? null,
    pageTitle: top?.job.pageTitle ?? "",
  };
}
