// Which applicant tracking system a page belongs to, and what job it's for.
// Site-specific fill rules (adapters) build on this in the next step.

import type { JobContext, SiteId } from "../shared/fields";
import { collapse } from "./labels";

const SITE_HOSTS: [SiteId, RegExp][] = [
  ["greenhouse", /(^|\.)greenhouse\.io$/],
  ["lever", /(^|\.)lever\.co$/],
  ["ashby", /(^|\.)ashbyhq\.com$/],
  ["workday", /(^|\.)(myworkdayjobs|myworkday|workday)\.com$/],
  ["naukri", /(^|\.)naukri\.com$/],
  ["smartrecruiters", /(^|\.)smartrecruiters\.com$/],
  ["workable", /(^|\.)workable\.com$/],
  ["icims", /(^|\.)icims\.com$/],
];

export const SITE_NAMES: Record<SiteId, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  naukri: "Naukri",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  icims: "iCIMS",
  generic: "Careers page",
};

export function detectSite(hostname: string): SiteId {
  const host = hostname.toLowerCase();
  return SITE_HOSTS.find(([, pattern]) => pattern.test(host))?.[0] ?? "generic";
}

function meta(doc: Document, property: string): string | null {
  const content = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.getAttribute("content");
  return content ? collapse(content) : null;
}

/** Best guess at the company from the page; null when unsure. */
function companyFor(doc: Document, site: SiteId, hostname: string): string | null {
  const title = collapse(doc.title);
  if (site === "greenhouse") {
    const match = title.match(/ at (.+)$/); // "Job Application for Backend Engineer at Acme"
    if (match) return match[1];
  }
  if (site === "lever") {
    const match = title.match(/^(.+?) - /); // "Acme - Backend Engineer"
    if (match) return match[1];
  }
  const siteName = meta(doc, "og:site_name");
  if (siteName) return siteName;
  if (site === "workday") return hostname.split(".")[0] || null; // acme.wd5.myworkdayjobs.com
  return null;
}

export function jobContext(doc: Document, site: SiteId, hostname: string): JobContext {
  const heading = doc.querySelector("h1");
  return {
    pageTitle: collapse(doc.title),
    heading: heading ? collapse(heading.textContent ?? "") || null : null,
    company: companyFor(doc, site, hostname),
  };
}
