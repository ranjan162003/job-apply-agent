import { Braces, Check, Loader2, RefreshCw, Settings, ShieldAlert, Unplug, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SITE_NAMES } from "../content/sites";
import { autofill, type AutofillResult } from "./autofill";
import { checkBackend, type BackendState } from "./backend";
import { FieldList } from "./components/FieldList";
import { SettingsView } from "./components/SettingsView";
import { allFields, applyFilter, bestJob, groupBySection, summarize, type FieldFilter, type ListedField } from "./fieldGroups";
import { highlightField, requestSiteAccess, scanActiveTab, type ScanOutcome } from "./pageScanner";
import { loadSettings, type PanelSettings } from "./settings";

const FILTERS: { id: FieldFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "required", label: "Required" },
  { id: "empty", label: "Empty" },
];

export function App() {
  const [settings, setSettings] = useState<PanelSettings | null>(null);
  const [backend, setBackend] = useState<BackendState>({ status: "checking" });
  const [showSettings, setShowSettings] = useState(false);
  const [scan, setScan] = useState<ScanOutcome | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [filter, setFilter] = useState<FieldFilter>("all");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fillResult, setFillResult] = useState<AutofillResult | null>(null);
  const [isFilling, setIsFilling] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [fillProgress, setFillProgress] = useState<string | null>(null);
  const scanRequest = useRef(0);

  useEffect(() => {
    void loadSettings().then(async (loaded) => {
      setSettings(loaded);
      setBackend(await checkBackend(loaded));
    });
  }, []);

  /** `keepFill`: a rescan right after filling keeps the per-field results on screen. */
  const rescan = useCallback(async (keepFill = false) => {
    const request = ++scanRequest.current;
    setIsScanning(true);
    if (!keepFill) {
      setFillResult(null);
      setFillError(null);
    }
    const outcome = await scanActiveTab();
    if (request !== scanRequest.current) return; // a newer scan started (tab switched)
    setScan(outcome);
    setActiveKey(null);
    setIsScanning(false);
  }, []);

  // Scan on open, when switching tabs, and when the page finishes loading.
  useEffect(() => {
    void rescan();
    const onActivated = () => void rescan();
    const onUpdated = (_tabId: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && info.status === "complete") void rescan(); // next page of a multi-step form
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [rescan]);

  const fields = useMemo(() => (scan?.status === "ok" ? allFields(scan.frames) : []), [scan]);
  const visible = useMemo(() => groupBySection(applyFilter(fields, filter)), [fields, filter]);
  const counts = summarize(fields);
  const job = scan?.status === "ok" ? bestJob(scan.frames) : null;

  async function select(field: ListedField) {
    if (scan?.status !== "ok") return;
    setActiveKey(`${field.frameId}-${field.id}`);
    const found = await highlightField(scan.tabId, field.frameId, field.id).catch(() => false);
    if (!found) void rescan(); // the page changed under us
  }

  async function fillFromProfile() {
    if (scan?.status !== "ok" || !settings || !job) return;
    setIsFilling(true);
    setFillError(null);
    try {
      const rescanFields = async () => {
        const outcome = await scanActiveTab();
        if (outcome.status !== "ok") return fields;
        setScan(outcome);
        return allFields(outcome.frames);
      };
      const result = await autofill(settings, scan.tabId, job.site, fields, scan.frames.map((f) => f.frameId), rescanFields, setFillProgress);
      setFillResult(result);
      await rescan(true); // refresh the "filled" tags from the page itself
      setFilter("all");
    } catch (err) {
      setFillError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFilling(false);
      setFillProgress(null);
    }
  }

  async function allow(origin: string) {
    if (await requestSiteAccess(origin)) void rescan();
  }

  async function copyJson() {
    if (scan?.status !== "ok") return;
    await navigator.clipboard.writeText(JSON.stringify(scan.frames, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!settings) return null;

  const needsPairing = backend.status === "unpaired";

  return (
    <div className="panel">
      <header className="panel-header">
        <span className="panel-header__logo" aria-hidden="true">
          A
        </span>
        <div className="panel-header__text">
          <span className="panel-header__name">Apply Copilot</span>
          <span className={`connection connection--${backend.status}`} role="status">
            <span className="connection__dot" aria-hidden="true" />
            {backend.status === "checking" && "Connecting…"}
            {backend.status === "connected" && `Connected · profile ${backend.hello.profile_completeness}% complete`}
            {backend.status === "unpaired" && "Not paired"}
            {backend.status === "offline" && "App not running"}
          </span>
        </div>
        <button type="button" className="icon-button" onClick={() => setShowSettings((s) => !s)} aria-label="Settings" aria-pressed={showSettings}>
          <Settings size={17} />
        </button>
      </header>

      {(showSettings || needsPairing) && (
        <SettingsView
          settings={settings}
          onBack={needsPairing ? undefined : () => setShowSettings(false)}
          onSaved={(next, state) => {
            setSettings(next);
            setBackend(state);
            setShowSettings(false);
          }}
        />
      )}

      {backend.status === "offline" && !showSettings && (
        <div className="panel-card panel-card--warning">
          <Unplug size={16} aria-hidden="true" />
          <p>{backend.message}</p>
          <button type="button" className="panel-button" onClick={() => void checkBackend(settings).then(setBackend)}>
            Try again
          </button>
        </div>
      )}

      <section className="panel-card page-card" aria-label="This page">
        <div className="page-card__top">
          <div className="page-card__job">
            {job && <span className="site-badge">{SITE_NAMES[job.site]}</span>}
            <span className="page-card__heading">{job?.heading || job?.pageTitle || "This page"}</span>
            {job?.company && <span className="muted page-card__company">{job.company}</span>}
          </div>
          <button type="button" className="icon-button" onClick={() => void rescan()} aria-label="Scan the page again" title="Scan again">
            {isScanning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
        </div>

        {scan?.status === "restricted" && <p className="muted">Browser pages and the extension store can't be read. Open a job application.</p>}
        {scan?.status === "error" && <p className="panel-alert">{scan.message}</p>}
        {scan?.status === "needs-permission" && (
          <div className="permission">
            <ShieldAlert size={16} aria-hidden="true" />
            <p>
              Apply Copilot can read known job sites only. Allow it on <strong>{new URL(scan.url).hostname}</strong> to list this
              form's fields.
            </p>
            <button type="button" className="panel-button panel-button--primary" onClick={() => void allow(scan.origin)}>
              Allow on this site
            </button>
          </div>
        )}

        {scan?.status === "ok" && backend.status === "connected" && (
          <button type="button" className="panel-button panel-button--primary panel-button--block" onClick={() => void fillFromProfile()} disabled={isFilling}>
            {isFilling ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />} {isFilling ? "Filling…" : fillResult ? "Fill again" : "Fill from profile"}
          </button>
        )}
        {isFilling && fillProgress && (
          <p className="fill-summary" role="status">
            {fillProgress}
          </p>
        )}
        {fillResult && !isFilling && (
          <p className="fill-summary" role="status">
            <strong>{fillResult.filled}</strong> filled · <strong>{fillResult.needsYou}</strong> need you
            {fillResult.blocksAdded > 0 && ` · added ${fillResult.blocksAdded} job/education block${fillResult.blocksAdded === 1 ? "" : "s"}`}.
            Check every answer on the page, then save or submit it yourself.
          </p>
        )}
        {fillError && <p className="panel-alert">{fillError}</p>}

        {scan?.status === "ok" && (
          <p className="page-card__summary">
            <strong>{counts.total}</strong> field{counts.total === 1 ? "" : "s"} · {counts.required} required · {counts.filled} already filled
            {scan.frames.length > 1 && ` · ${scan.frames.length} frames`}
          </p>
        )}
      </section>

      {scan?.status === "ok" && counts.total === 0 && (
        <p className="panel-empty muted">
          No form fields here yet. If the page only has "Add" buttons (work experience, education), Fill from profile adds
          one block per entry in your profile. If the form opens after a click ("Apply"), click it, then scan again.
        </p>
      )}

      {counts.total > 0 && (
        <>
          <div className="filters" role="radiogroup" aria-label="Show fields">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={filter === option.id}
                className={`filter${filter === option.id ? " filter--active" : ""}`}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <FieldList
            sections={visible}
            activeKey={activeKey}
            rowStatus={fillResult?.rows}
            onSelect={(field) => void select(field)}
          />
        </>
      )}

      <footer className="panel-footer">
        <p className="muted">
          Apply Copilot fills what it's sure of and never ticks consent boxes or presses Submit. You check the answers and submit.
        </p>
        {counts.total > 0 && (
          <button type="button" className="panel-button" onClick={() => void copyJson()}>
            {copied ? <Check size={14} /> : <Braces size={14} />} {copied ? "Copied" : "Copy fields as JSON"}
          </button>
        )}
      </footer>
    </div>
  );
}
