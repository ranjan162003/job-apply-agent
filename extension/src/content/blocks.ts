// Repeated sections: make the page show one block per job / school in the profile by clicking
// its "Add" / "Add Another" button. Only those buttons are ever clicked here.

import { collapse } from "./labels";

export type BlockKind = "job" | "school";

const ADD_BUTTON = /^\+?\s*add( another)?$/i;
const SECTION_PATTERNS: Record<BlockKind, RegExp> = {
  job: /(work|employment|professional)\s*(experience|history)|^experience$/i,
  school: /education|academic/i,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function headings(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, [role='heading'], legend"));
}

/** Headings of existing blocks: "Work Experience 1", "Education 2"… */
export function countBlocks(doc: Document, kind: BlockKind): number {
  return headings(doc).filter((h) => {
    const text = collapse(h.textContent ?? "");
    return /\d+\s*$/.test(text) && SECTION_PATTERNS[kind].test(text.replace(/\d+\s*$/, ""));
  }).length;
}

/** The section's Add button: the last "Add"/"Add Another" after the section heading and before the next section. */
function addButtonFor(doc: Document, kind: BlockKind): HTMLElement | null {
  const all = headings(doc);
  const sectionHeading = all.find((h) => {
    const text = collapse(h.textContent ?? "");
    return SECTION_PATTERNS[kind].test(text) && !/\d+\s*$/.test(text);
  });
  if (!sectionHeading) return null;
  const nextSection = all.find(
    (h) =>
      h !== sectionHeading &&
      sectionHeading.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING &&
      !/\d+\s*$/.test(collapse(h.textContent ?? "")) &&
      h.tagName === sectionHeading.tagName,
  );
  const buttons = Array.from(doc.querySelectorAll<HTMLElement>("button, [role='button']")).filter((b) => {
    if (!ADD_BUTTON.test(collapse(b.textContent ?? b.getAttribute("aria-label") ?? ""))) return false;
    const afterHeading = sectionHeading.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    const beforeNext = !nextSection || b.compareDocumentPosition(nextSection) & Node.DOCUMENT_POSITION_FOLLOWING;
    return afterHeading && beforeNext;
  });
  return buttons[buttons.length - 1] ?? null;
}

/** Click "Add" until the page has `wanted` blocks (at most 10). Returns how many were added. */
export async function ensureBlocks(doc: Document, kind: BlockKind, wanted: number): Promise<number> {
  let added = 0;
  for (let i = 0; i < 10 && countBlocks(doc, kind) < Math.min(wanted, 10); i++) {
    const button = addButtonFor(doc, kind);
    if (!button) break;
    const before = countBlocks(doc, kind);
    button.click();
    for (let wait = 0; wait < 20 && countBlocks(doc, kind) === before; wait++) await sleep(100);
    if (countBlocks(doc, kind) === before) break; // the button didn't add a block
    added++;
  }
  return added;
}
