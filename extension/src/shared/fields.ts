// What the content script reports about a page, shared with the side panel.

export type FieldKind =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "custom-select" // a button or div that opens a listbox (Workday, react-select)
  | "combobox" // a typeahead input
  | "radio"
  | "checkbox"
  | "checkbox-group"
  | "file";

/** Where the label text came from, best first. Lower-quality sources get less trust later. */
export type LabelSource = "label" | "aria" | "legend" | "placeholder" | "nearby" | "name" | "none";

export interface ExtractedField {
  /** Stable for the page's lifetime: stored on the element as `data-apply-copilot-id`. */
  id: string;
  kind: FieldKind;
  label: string;
  labelSource: LabelSource;
  required: boolean;
  /** Choices for select, radio and checkbox groups. */
  options: string[];
  /** The page already has a value here (pre-filled or typed by the user). */
  hasValue: boolean;
  /** Nearest heading or fieldset legend, for grouping ("Personal information", "Education"). */
  section: string | null;
  name: string | null;
  htmlId: string | null;
  autocomplete: string | null;
  placeholder: string | null;
  maxLength: number | null;
  /** File inputs: what the input accepts, e.g. ".pdf,.docx". */
  accept: string | null;
}

export type SiteId =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "naukri"
  | "smartrecruiters"
  | "workable"
  | "icims"
  | "generic";

export interface JobContext {
  pageTitle: string;
  heading: string | null;
  company: string | null;
}

export interface FrameScan {
  url: string;
  site: SiteId;
  job: JobContext;
  fields: ExtractedField[];
}

/** One frame's scan plus the frame id Chrome gave it (0 = the top page). */
export interface PageFrameScan extends FrameScan {
  frameId: number;
}

export interface ApplyCopilotPageApi {
  version: string;
  scan: () => FrameScan;
  highlight: (fieldId: string) => boolean;
}

declare global {
  interface Window {
    __applyCopilot?: ApplyCopilotPageApi;
  }
}
