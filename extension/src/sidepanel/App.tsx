import { Braces, Check, Loader2, RefreshCw, Settings, ShieldAlert, Unplug } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SITE_NAMES } from "../content/sites";
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
  const scanRequest = useRef(0);

  useEffect(() => {
    void loadSettings().then(async (loaded) => {
      setSettings(loaded);
      setBackend(await checkBackend(loaded));
    });
  }, []);

  const rescan = useCallback(async () => {
    const request = ++scanRequest.current;
    setIsScanning(true);
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
      if (tab.active && info.status === "complete") void rescan();
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

        {scan?.status === "ok" && (
          <p className="page-card__summary">
            <strong>{counts.total}</strong> field{counts.total === 1 ? "" : "s"} · {counts.required} required · {counts.filled} already filled
            {scan.frames.length > 1 && ` · ${scan.frames.length} frames`}
          </p>
        )}
      </section>

      {scan?.status === "ok" && counts.total === 0 && (
        <p className="panel-empty muted">
          No form fields here yet. If the form opens after a click ("Apply"), click it, then scan again.
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
            onSelect={(field) => void select(field)}
          />
        </>
      )}

      <footer className="panel-footer">
        <p className="muted">
          This version lists the fields. Filling them from your profile comes next. Apply Copilot never presses Submit.
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
