// "Fill from profile":
//   1. make the page show one block per job / school (clicks "Add" / "Add Another"),
//   2. ask the backend what goes in each field,
//   3. fill text, selects, radios and "I currently work here" boxes,
//   4. open each custom dropdown / search box, ask the backend which choice matches, click it,
//   5. attach the resume.

import type { FillOutcome, FillRequest } from "../shared/fields";
import { downloadResume, fetchEntryCounts, matchFields, pickOption, type FieldMatch } from "./backend";
import type { ListedField } from "./fieldGroups";
import type { PanelSettings } from "./settings";

export type RowStatus =
  | { kind: "filled"; value: string }
  | { kind: "kept" } // the page already had something there
  | { kind: "needs-you"; reason: string }
  | { kind: "left"; reason: string }; // deliberately not filled (consent boxes…)

export interface AutofillResult {
  rows: Map<string, RowStatus>; // key: `${frameId}-${fieldId}`
  filled: number;
  needsYou: number;
  blocksAdded: number;
}

export type Progress = (message: string) => void;

const rowKey = (field: { frameId: number; id: string }) => `${field.frameId}-${field.id}`;

function reasonFor(match: FieldMatch): string {
  if (match.note) return match.note;
  if (match.status === "unknown") return "Apply Copilot doesn't know this question yet. Answer it yourself.";
  return "Fill this yourself.";
}

async function inFrame<T>(tabId: number, frameId: number, func: (...args: never[]) => T | Promise<T>, args: unknown[]): Promise<T | undefined> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: func as () => T,
    args: args as [],
  });
  return result?.result as T | undefined;
}

const fillInFrame = (tabId: number, frameId: number, requests: FillRequest[]) =>
  inFrame<FillOutcome[]>(tabId, frameId, ((items: FillRequest[]) => window.__applyCopilot?.fill(items) ?? []) as never, [requests]);

const listInFrame = (tabId: number, frameId: number, id: string, search: string | null) =>
  inFrame<string[]>(tabId, frameId, ((fieldId: string, text: string | null) => window.__applyCopilot?.listOptions(fieldId, text) ?? []) as never, [id, search]);

const chooseInFrame = (tabId: number, frameId: number, id: string, option: string | null) =>
  inFrame<boolean>(tabId, frameId, ((fieldId: string, text: string | null) => window.__applyCopilot?.chooseOption(fieldId, text) ?? false) as never, [id, option]);

const blocksInFrame = (tabId: number, frameId: number, kind: "job" | "school", wanted: number) =>
  inFrame<number>(tabId, frameId, ((k: "job" | "school", n: number) => window.__applyCopilot?.ensureBlocks(k, n) ?? 0) as never, [kind, wanted]);

const attachInFrame = (tabId: number, frameId: number, id: string, base64: string, filename: string, mimeType: string) =>
  inFrame<FillOutcome>(
    tabId,
    frameId,
    ((fieldId: string, data: string, name: string, type: string) =>
      window.__applyCopilot?.attachFile(fieldId, data, name, type) ?? { id: fieldId, status: "missing" }) as never,
    [id, base64, filename, mimeType],
  );

/**
 * What to type into a search box, best first. Long names are tried in parts:
 * "College of Engineering Guindy, Anna University, Chennai" → the whole name's first words,
 * then "College of Engineering Guindy", then "Anna University".
 */
export function searchTermsFor(value: string): string[] {
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
  const parts = value
    .split(/[,;|/]| - /)
    .map((part) => words(part).slice(0, 4).join(" "))
    .filter((part) => part.length >= 3);
  const terms = [words(value).slice(0, 3).join(" "), ...parts, words(value)[0] ?? ""];
  return [...new Set(terms.filter(Boolean))].slice(0, 4);
}

export async function autofill(
  settings: PanelSettings,
  tabId: number,
  site: string,
  initialFields: ListedField[],
  frameIds: number[],
  rescan: () => Promise<ListedField[]>,
  progress: Progress,
): Promise<AutofillResult> {
  // 1. One block per job / school in the profile.
  let fields = initialFields;
  let blocksAdded = 0;
  const counts = await fetchEntryCounts(settings).catch(() => null);
  if (counts) {
    for (const frameId of frameIds) {
      for (const [kind, wanted] of [["job", counts.jobs], ["school", counts.schools]] as const) {
        if (wanted > 0) blocksAdded += (await inFrameSafe(() => blocksInFrame(tabId, frameId, kind, wanted))) ?? 0;
      }
    }
    if (blocksAdded > 0) {
      progress(`Added ${blocksAdded} block${blocksAdded === 1 ? "" : "s"} for your jobs and education…`);
      fields = await rescan();
    }
  }

  // 2. What goes where.
  progress("Matching fields to your profile…");
  const matches = await matchFields(
    settings,
    site,
    fields.map((f) => ({
      id: rowKey(f), // frame-qualified, so ids from different frames can't collide
      kind: f.kind,
      label: f.label,
      options: f.options,
      name: f.name,
      html_id: f.htmlId,
      autocomplete: f.autocomplete,
      placeholder: f.placeholder,
      max_length: f.maxLength,
      section: f.section,
    })),
  );
  const byKey = new Map(matches.map((m) => [m.id, m]));
  const rows = new Map<string, RowStatus>();

  // 3. Plain fields, one call per frame.
  const direct = new Map<number, { field: ListedField; value: string }[]>();
  const fromList: { field: ListedField; match: FieldMatch }[] = [];
  for (const field of fields) {
    const match = byKey.get(rowKey(field));
    if (!match) continue;
    if (match.status !== "fill" || match.value === null) {
      rows.set(rowKey(field), match.status === "skipped" ? { kind: "left", reason: reasonFor(match) } : { kind: "needs-you", reason: reasonFor(match) });
    } else if (field.kind === "file") {
      continue;
    } else if (match.pick_from_list) {
      fromList.push({ field, match });
    } else {
      if (!direct.has(field.frameId)) direct.set(field.frameId, []);
      direct.get(field.frameId)!.push({ field, value: match.value });
    }
  }

  progress("Filling fields…");
  for (const [frameId, items] of direct) {
    const outcomes = (await inFrameSafe(() => fillInFrame(tabId, frameId, items.map(({ field, value }) => ({ id: field.id, value }))))) ?? [];
    for (const { field, value } of items) {
      const outcome = outcomes.find((o) => o.id === field.id);
      const shown = field.kind === "checkbox" ? (value === "true" ? "ticked" : "left unticked") : value;
      rows.set(
        rowKey(field),
        outcome?.status === "filled"
          ? { kind: "filled", value: shown }
          : outcome?.status === "kept"
            ? { kind: "kept" }
            : { kind: "needs-you", reason: `Couldn't fill this automatically. Your answer: ${shown}` },
      );
    }
  }

  // 4. Custom dropdowns and search boxes, one at a time (each opens a pop-up list).
  for (const [index, { field, match }] of fromList.entries()) {
    progress(`Choosing from dropdowns (${index + 1} of ${fromList.length})…`);
    const value = match.value!;
    if (field.hasValue && field.kind === "custom-select") {
      rows.set(rowKey(field), { kind: "kept" });
      continue;
    }
    // Dropdowns open once; search boxes try each search term until the results hold a clear match.
    const terms = field.kind === "combobox" ? searchTermsFor(value) : [null];
    let options: string[] = [];
    let option: string | null = null;
    for (const term of terms) {
      options = (await inFrameSafe(() => listInFrame(tabId, field.frameId, field.id, term))) ?? [];
      option = options.length ? await pickOption(settings, value, options).catch(() => null) : null;
      if (option) break;
    }
    const chosen = (await inFrameSafe(() => chooseInFrame(tabId, field.frameId, field.id, option))) ?? false;
    rows.set(
      rowKey(field),
      chosen && option
        ? { kind: "filled", value: option }
        : {
            kind: "needs-you",
            reason: options.length
              ? `None of the ${options.length} choices clearly matches “${value}”. Pick it yourself.`
              : `The list didn't open or had no choices. Your answer: ${value}`,
          },
    );
  }

  // 5. Resume uploads.
  for (const field of fields.filter((f) => f.kind === "file")) {
    const match = byKey.get(rowKey(field));
    if (match?.status !== "fill" || match.resume_id === null) continue;
    if (field.hasValue) {
      rows.set(rowKey(field), { kind: "kept" });
      continue;
    }
    progress("Attaching your resume…");
    try {
      const { base64, mimeType } = await downloadResume(settings, match.resume_id);
      const outcome = await attachInFrame(tabId, field.frameId, field.id, base64, match.resume_filename ?? "resume.pdf", mimeType);
      rows.set(
        rowKey(field),
        outcome?.status === "filled"
          ? { kind: "filled", value: match.resume_filename ?? "resume" }
          : { kind: "needs-you", reason: "Couldn't attach the resume here. Upload it yourself." },
      );
    } catch (err) {
      rows.set(rowKey(field), { kind: "needs-you", reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const statuses = [...rows.values()];
  return {
    rows,
    filled: statuses.filter((s) => s.kind === "filled").length,
    needsYou: statuses.filter((s) => s.kind === "needs-you").length,
    blocksAdded,
  };
}

/** A frame that navigated away or was removed shouldn't stop the rest of the fill. */
async function inFrameSafe<T>(call: () => Promise<T | undefined>): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    return undefined;
  }
}
