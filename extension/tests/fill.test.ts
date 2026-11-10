import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { extractFields } from "../src/content/extract";
import { attachFile, fillFields } from "../src/content/fill";
import type { ExtractedField } from "../src/shared/fields";

function load(fixture: string) {
  document.open();
  document.write(readFileSync(path.join(__dirname, "fixtures", fixture), "utf8"));
  document.close();
}

const idOf = (fields: ExtractedField[], label: string) => {
  const field = fields.find((f) => f.label === label);
  if (!field) throw new Error(`No field "${label}" in ${fields.map((f) => f.label).join(" | ")}`);
  return field.id;
};

describe("Workday-style account page", () => {
  let fields: ExtractedField[];
  beforeEach(() => {
    load("workday-account.html");
    fields = extractFields(document);
  });

  it("skips the honeypot, the passwords and the unlabelled language picker", () => {
    expect(fields.map((f) => f.label)).toEqual([
      "Email Address",
      "Phone Number",
      "Phone Device Type",
      "Have you previously worked for Citi?",
      "Upload resume",
    ]);
  });

  it("fills text, selects and radios and fires the events frameworks listen to", () => {
    const email = document.getElementById("input-4") as HTMLInputElement;
    const seen: string[] = [];
    for (const type of ["input", "change", "blur"]) email.addEventListener(type, () => seen.push(type));

    const outcomes = fillFields(document, [
      { id: idOf(fields, "Email Address"), value: "asha@example.com" },
      { id: idOf(fields, "Phone Device Type"), value: "Mobile" },
      { id: idOf(fields, "Have you previously worked for Citi?"), value: "No" },
      { id: "nope", value: "x" },
    ]);

    expect(outcomes.map((o) => o.status)).toEqual(["filled", "filled", "filled", "missing"]);
    expect(email.value).toBe("asha@example.com");
    expect(seen).toEqual(["input", "change", "blur"]);
    expect((document.getElementById("type") as HTMLSelectElement).value).toBe("m");
    expect((document.querySelector("input[value=false]") as HTMLInputElement).checked).toBe(true);
  });

  it("keeps what the user already typed, and fails cleanly on an unknown choice", () => {
    const phone = document.getElementById("phone") as HTMLInputElement;
    phone.value = "12345";
    const outcomes = fillFields(document, [
      { id: idOf(fields, "Phone Number"), value: "98765 43210" },
      { id: idOf(fields, "Phone Device Type"), value: "Pager" },
    ]);
    expect(outcomes.map((o) => o.status)).toEqual(["kept", "failed"]);
    expect(phone.value).toBe("12345");
  });

  it("attaches a resume file to a file input", () => {
    const input = document.getElementById("cv") as HTMLInputElement;
    let changed = false;
    input.addEventListener("change", () => (changed = true));
    // jsdom has no DataTransfer; a minimal stand-in that yields a FileList-like object.
    (globalThis as Record<string, unknown>).DataTransfer ??= class {
      private list: File[] = [];
      items = { add: (file: File) => this.list.push(file) };
      get files() {
        const files = this.list;
        return Object.assign([...files], { item: (i: number) => files[i] }) as unknown as FileList;
      }
    };
    Object.defineProperty(input, "files", { writable: true, value: null });

    const outcome = attachFile(document, idOf(fields, "Upload resume"), btoa("%PDF-1.4 test"), "Asha_CV.pdf", "application/pdf");
    expect(outcome.status).toBe("filled");
    expect(input.files?.[0].name).toBe("Asha_CV.pdf");
    expect(changed).toBe(true);
  });
});
