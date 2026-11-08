import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { extractFields, ID_ATTRIBUTE } from "../src/content/extract";
import { cleanLabel, labelFromName } from "../src/content/labels";
import { detectSite, jobContext } from "../src/content/sites";
import type { ExtractedField } from "../src/shared/fields";

function load(fixture: string) {
  const html = readFileSync(path.join(__dirname, "fixtures", fixture), "utf8");
  document.open();
  document.write(html);
  document.close();
}

function byLabel(fields: ExtractedField[], label: string): ExtractedField {
  const field = fields.find((f) => f.label === label);
  if (!field) throw new Error(`No field labelled "${label}". Found: ${fields.map((f) => f.label).join(" | ")}`);
  return field;
}

describe("Greenhouse-style form", () => {
  let fields: ExtractedField[];
  beforeEach(() => {
    load("greenhouse-form.html");
    fields = extractFields(document);
  });

  it("lists every fillable control in page order, skipping hidden and submit inputs", () => {
    expect(fields.map((f) => f.label)).toEqual([
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Resume/CV",
      "LinkedIn Profile",
      "Will you now or in the future require sponsorship?",
      "Why do you want to work at Acme?",
      "Gender",
      "I agree to the privacy policy",
    ]);
  });

  it("reads kinds, required marks, values and limits", () => {
    expect(byLabel(fields, "First Name")).toMatchObject({ kind: "text", required: true, labelSource: "label", hasValue: false });
    expect(byLabel(fields, "Email")).toMatchObject({ kind: "email", hasValue: true });
    expect(byLabel(fields, "Phone")).toMatchObject({ kind: "tel", required: false });
    expect(byLabel(fields, "Why do you want to work at Acme?")).toMatchObject({ kind: "textarea", maxLength: 1000 });
    expect(byLabel(fields, "I agree to the privacy policy")).toMatchObject({ kind: "checkbox", required: true });
  });

  it("keeps the hidden file input and finds its label from nearby text", () => {
    expect(byLabel(fields, "Resume/CV")).toMatchObject({ kind: "file", required: true, accept: ".pdf,.doc,.docx,.txt,.rtf", labelSource: "nearby" });
  });

  it("drops placeholder options from selects and groups radios under their legend", () => {
    const sponsor = byLabel(fields, "Will you now or in the future require sponsorship?");
    expect(sponsor).toMatchObject({ kind: "select", options: ["Yes", "No"], required: true, hasValue: false });

    const gender = byLabel(fields, "Gender");
    expect(gender).toMatchObject({ kind: "radio", labelSource: "legend", hasValue: true });
    expect(gender.options).toEqual(["Female", "Male", "Decline to self-identify"]);
  });

  it("assigns sections from headings and legends", () => {
    expect(byLabel(fields, "First Name").section).toBe("Submit your application");
    expect(byLabel(fields, "LinkedIn Profile").section).toBe("Additional questions");
    expect(byLabel(fields, "Gender").section).toBe("Voluntary Self-Identification"); // its legend is its question
  });

  it("marks elements with stable ids that survive a rescan", () => {
    const again = extractFields(document);
    expect(again.map((f) => f.id)).toEqual(fields.map((f) => f.id));
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
    const radios = document.querySelectorAll(`input[name="gender"]`);
    radios.forEach((radio) => expect(radio.getAttribute(ID_ATTRIBUTE)).toBe(byLabel(fields, "Gender").id));
  });

  it("detects the site and the job", () => {
    expect(detectSite("boards.greenhouse.io")).toBe("greenhouse");
    expect(jobContext(document, "greenhouse", "boards.greenhouse.io")).toEqual({
      pageTitle: "Job Application for Backend Engineer at Acme",
      heading: "Backend Engineer",
      company: "Acme",
    });
  });
});

describe("generic form without <label> elements", () => {
  let fields: ExtractedField[];
  beforeEach(() => {
    load("generic-form.html");
    fields = extractFields(document);
  });

  it("falls back through aria, placeholder, nearby text and the name attribute", () => {
    expect(byLabel(fields, "Current city").labelSource).toBe("aria");
    expect(byLabel(fields, "Years of experience").labelSource).toBe("aria");
    expect(byLabel(fields, "Notice period (days)").labelSource).toBe("placeholder");
    expect(byLabel(fields, "Expected CTC (LPA)").labelSource).toBe("nearby");
    expect(byLabel(fields, "current company name").labelSource).toBe("name");
  });

  it("skips search boxes, hidden, disabled and password fields", () => {
    const labels = fields.map((f) => f.label);
    for (const skipped of ["Search jobs", "Honeypot", "Hidden by style", "Create a password", "Disabled field"]) {
      expect(labels).not.toContain(skipped);
    }
  });

  it("reads ARIA radio groups, checkbox groups, custom dropdowns and comboboxes", () => {
    expect(byLabel(fields, "Willing to relocate?")).toMatchObject({ kind: "radio", options: ["Yes", "No"], required: true });
    expect(byLabel(fields, "Which areas interest you?")).toMatchObject({
      kind: "checkbox-group",
      options: ["SOC", "AppSec", "GRC"],
      hasValue: true,
    });
    expect(byLabel(fields, "Country")).toMatchObject({ kind: "custom-select", hasValue: false });
    expect(byLabel(fields, "College")).toMatchObject({ kind: "combobox" });
  });

  it("uses og:site_name for the company on unknown sites", () => {
    expect(detectSite("careers.betalabs.io")).toBe("generic");
    expect(jobContext(document, "generic", "careers.betalabs.io").company).toBe("Beta Labs");
  });
});

describe("label helpers", () => {
  it("cleans required marks and trailing colons", () => {
    expect(cleanLabel("  Email *  ")).toEqual({ text: "Email", markedRequired: true });
    expect(cleanLabel("Phone (required):")).toEqual({ text: "Phone", markedRequired: true });
    expect(cleanLabel("Is a degree required for this role")).toEqual({ text: "Is a degree required for this role", markedRequired: false });
  });

  it("turns name attributes into words, but not array indexes", () => {
    expect(labelFromName("job_application[first_name]")?.text).toBe("first name");
    expect(labelFromName("answers[3]")).toBeNull();
  });

  it("recognises the main applicant tracking systems", () => {
    expect(detectSite("jobs.lever.co")).toBe("lever");
    expect(detectSite("acme.wd5.myworkdayjobs.com")).toBe("workday");
    expect(detectSite("jobs.ashbyhq.com")).toBe("ashby");
    expect(detectSite("www.naukri.com")).toBe("naukri");
    expect(detectSite("notgreenhouse.io.example.com")).toBe("generic");
  });
});
