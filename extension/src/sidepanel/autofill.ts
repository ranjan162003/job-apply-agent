// "Fill from profile": ask the backend for values, then fill each frame of the page.

import type { FillOutcome, FillRequest } from "../shared/fields";
import { downloadResume, matchFields, type FieldMatch } from "./backend";
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
}

const rowKey = (field: { frameId: number; id: string }) => `${field.frameId}-${field.id}`;

function reasonFor(match: FieldMatch): string {
  if (match.note) return match.note;
  if (match.status === "unknown") return "Apply Copilot doesn't know this question yet. Answer it yourself.";
  return "Fill this yourself.";
}

async function fillInFrame(tabId: number, frameId: number, requests: FillRequest[]): Promise<FillOutcome[]> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (items: FillRequest[]) => window.__applyCopilot?.fill(items) ?? [],
    args: [requests],
  });
  return (result?.result as FillOutcome[] | undefined) ?? [];
}

async function attachInFrame(tabId: number, frameId: number, id: string, base64: string, filename: string, mimeType: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (fieldId: string, data: string, name: string, type: string): FillOutcome =>
      window.__applyCopilot?.attachFile(fieldId, data, name, type) ?? { id: fieldId, status: "missing" },
    args: [id, base64, filename, mimeType],
  });
  return result?.result as FillOutcome | undefined;
}

export async function autofill(settings: PanelSettings, tabId: number, site: string, fields: ListedField[]): Promise<AutofillResult> {
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
    })),
  );
  const byKey = new Map(matches.map((m) => [m.id, m]));
  const rows = new Map<string, RowStatus>();

  // Text, selects and radios: one call per frame.
  const frames = new Map<number, { field: ListedField; value: string }[]>();
  for (const field of fields) {
    const match = byKey.get(rowKey(field));
    if (!match) continue;
    if (match.status !== "fill" || match.value === null) {
      rows.set(rowKey(field), match.status === "skipped" ? { kind: "left", reason: reasonFor(match) } : { kind: "needs-you", reason: reasonFor(match) });
      continue;
    }
    if (field.kind === "file") continue;
    if (!frames.has(field.frameId)) frames.set(field.frameId, []);
    frames.get(field.frameId)!.push({ field, value: match.value });
  }

  for (const [frameId, items] of frames) {
    const outcomes = await fillInFrame(
      tabId,
      frameId,
      items.map(({ field, value }) => ({ id: field.id, value })),
    ).catch((): FillOutcome[] => []);
    for (const { field, value } of items) {
      const outcome = outcomes.find((o) => o.id === field.id);
      rows.set(
        rowKey(field),
        outcome?.status === "filled"
          ? { kind: "filled", value }
          : outcome?.status === "kept"
            ? { kind: "kept" }
            : { kind: "needs-you", reason: `Couldn't fill this automatically. Your answer: ${value}` },
      );
    }
  }

  // Resume uploads.
  for (const field of fields.filter((f) => f.kind === "file")) {
    const match = byKey.get(rowKey(field));
    if (match?.status !== "fill" || match.resume_id === null) continue;
    if (field.hasValue) {
      rows.set(rowKey(field), { kind: "kept" });
      continue;
    }
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
  };
}
