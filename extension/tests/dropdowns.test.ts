import { beforeEach, describe, expect, it } from "vitest";

import { countBlocks, ensureBlocks } from "../src/content/blocks";
import { chooseOption, openAndListOptions } from "../src/content/dropdowns";
import { extractFields } from "../src/content/extract";

// A small Workday-like page: an "Add" button per section and a "Select One" pop-up dropdown.
function buildPage() {
  document.body.innerHTML = `
    <h3>Work Experience</h3><div id="jobs"></div><button type="button" id="addJob">Add</button>
    <h3>Education</h3><div id="schools"></div><button type="button" id="addSchool">Add</button>
    <h3>Languages</h3><button type="button">Add</button>
    <label id="degreeLabel">Degree</label>
    <button type="button" id="degree" aria-haspopup="listbox" aria-labelledby="degreeLabel">Select One</button>
    <div id="popup" role="listbox"></div>`;
  const add = (button: string, list: string, title: string) =>
    document.getElementById(button)!.addEventListener("click", () => {
      const holder = document.getElementById(list)!;
      const block = document.createElement("div");
      block.innerHTML = `<h4>${title} ${holder.children.length + 1}</h4><label>Title <input></label>`;
      holder.append(block);
    });
  add("addJob", "jobs", "Work Experience");
  add("addSchool", "schools", "Education");
  const degree = document.getElementById("degree")!;
  degree.addEventListener("click", () => {
    document.getElementById("popup")!.innerHTML = ["Bachelor of Arts", "Bachelor of Engineering"]
      .map((d) => `<div role="option">${d}</div>`)
      .join("");
    document.querySelectorAll("[role=option]").forEach((o) =>
      o.addEventListener("click", () => {
        degree.textContent = o.textContent;
        document.getElementById("popup")!.innerHTML = "";
      }),
    );
  });
}

describe("repeated blocks", () => {
  beforeEach(buildPage);

  it("clicks each section's own Add button until there is one block per entry", async () => {
    expect(await ensureBlocks(document, "job", 2)).toBe(2);
    expect(await ensureBlocks(document, "school", 1)).toBe(1);
    expect(countBlocks(document, "job")).toBe(2);
    expect(countBlocks(document, "school")).toBe(1);
    expect(await ensureBlocks(document, "job", 2)).toBe(0); // already enough
  });
});

describe("custom dropdowns", () => {
  beforeEach(buildPage);

  it("opens the list, reads the choices and clicks the chosen one", async () => {
    const degree = extractFields(document).find((f) => f.label === "Degree")!;
    expect(degree.kind).toBe("custom-select");
    expect(await openAndListOptions(document, degree.id, null)).toEqual(["Bachelor of Arts", "Bachelor of Engineering"]);
    expect(await chooseOption(document, degree.id, "Bachelor of Engineering")).toBe(true);
    expect(document.getElementById("degree")!.textContent).toBe("Bachelor of Engineering");
  });

  it("closes the list without choosing when nothing matched", async () => {
    const degree = extractFields(document).find((f) => f.label === "Degree")!;
    await openAndListOptions(document, degree.id, null);
    expect(await chooseOption(document, degree.id, null)).toBe(false);
    expect(document.getElementById("degree")!.textContent).toBe("Select One");
  });
});
