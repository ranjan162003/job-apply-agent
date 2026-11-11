import { describe, expect, it } from "vitest";

import type { ExtractedField, PageFrameScan } from "../src/shared/fields";
import { allFields, applyFilter, bestJob, groupBySection, summarize } from "../src/sidepanel/fieldGroups";

function field(id: string, overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    id,
    kind: "text",
    label: id,
    labelSource: "label",
    required: false,
    options: [],
    hasValue: false,
    section: null,
    name: null,
    htmlId: null,
    autocomplete: null,
    placeholder: null,
    maxLength: null,
    accept: null,
    ...overrides,
  };
}

const frames: PageFrameScan[] = [
  {
    frameId: 7,
    url: "https://boards.greenhouse.io/embed/job_app",
    site: "greenhouse",
    job: { pageTitle: "Apply", heading: "Backend Engineer", company: "Acme" },
    fields: [
      field("a", { section: "Personal", required: true }),
      field("b", { section: "Personal", hasValue: true }),
      field("c", { section: "Questions", required: true }),
    ],
  },
  {
    frameId: 0,
    url: "https://acme.com/careers/123",
    site: "generic",
    job: { pageTitle: "Careers at Acme", heading: "Join us", company: null },
    fields: [field("newsletter", { labelSource: "none", label: "" })],
  },
];

describe("side panel field grouping", () => {
  it("lists the top page first, then frames, keeping frame ids", () => {
    const fields = allFields(frames);
    expect(fields.map((f) => `${f.frameId}:${f.id}`)).toEqual(["0:newsletter", "7:a", "7:b", "7:c"]);
  });

  it("filters and counts", () => {
    const fields = allFields(frames);
    expect(applyFilter(fields, "required").map((f) => f.id)).toEqual(["a", "c"]);
    expect(applyFilter(fields, "empty").map((f) => f.id)).toEqual(["newsletter", "a", "c"]);
    expect(summarize(fields)).toEqual({ total: 4, required: 2, filled: 1, unlabelled: 1 });
  });

  it("groups consecutive fields by section", () => {
    const sections = groupBySection(allFields(frames));
    expect(sections.map((s) => [s.title, s.fields.length])).toEqual([
      ["Form", 1],
      ["Personal", 2],
      ["Questions", 1],
    ]);
  });

  it("takes the job from the frame that holds the form", () => {
    expect(bestJob(frames)).toEqual({ site: "greenhouse", heading: "Backend Engineer", company: "Acme", pageTitle: "Careers at Acme" });
  });
});

describe("search terms for type-to-search boxes", () => {
  it("tries the start of the name, then each part of a long name", async () => {
    const { searchTermsFor } = await import("../src/sidepanel/autofill");
    expect(searchTermsFor("COLLEGE OF ENGINEERING GUINDY, ANNA UNIVERSITY, CHENNAI")).toEqual([
      "COLLEGE OF ENGINEERING",
      "COLLEGE OF ENGINEERING GUINDY",
      "ANNA UNIVERSITY",
      "CHENNAI",
    ]);
    expect(searchTermsFor("Information Technology")).toEqual(["Information Technology", "Information"]);
  });
});
