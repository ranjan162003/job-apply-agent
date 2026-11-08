import { Bot, Check, Link2, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { resumeApi } from "../../api/vaultApi";
import { useToast } from "../../context/ToastContext";
import { useAgentChoice } from "../../hooks/useAgentChoice";
import type { ImportPreview, Resume } from "../../types/vault.types";
import { ErrorAlert } from "../common/ErrorAlert";

interface ResumeImportPanelProps {
  resume: Resume;
  onClose: () => void;
}

type Mode = "ai" | "patterns";

/** Read a resume into the profile: pick how, review every suggestion, then apply the ticked ones. */
export function ResumeImportPanel({ resume, onClose }: ResumeImportPanelProps) {
  const toast = useToast();
  const { agent, isReady, isChecking, label } = useAgentChoice();
  const [mode, setMode] = useState<Mode>("ai");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replaceJobs, setReplaceJobs] = useState(true);
  const [replaceSchools, setReplaceSchools] = useState(true);
  const [isReading, setIsReading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecking && !isReady) setMode("patterns");
  }, [isChecking, isReady]);

  async function read() {
    setIsReading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await resumeApi.previewImport(
        resume.id,
        mode === "ai" ? agent : { provider_id: null, model_name: null },
      );
      setPreview(result);
      // Pre-tick changes only; a value already in the vault needs no click.
      setSelected(new Set(result.fields.filter((f) => f.is_change).map((f) => f.key)));
      setReplaceJobs(result.experiences.length > 0);
      setReplaceSchools(result.educations.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReading(false);
    }
  }

  const changes = useMemo(() => preview?.fields.filter((f) => f.is_change) ?? [], [preview]);
  const unchanged = (preview?.fields.length ?? 0) - changes.length;
  const pickedCount = selected.size + (replaceJobs ? 1 : 0) + (replaceSchools ? 1 : 0);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function apply() {
    if (!preview) return;
    setIsApplying(true);
    setError(null);
    try {
      await resumeApi.applyImport({
        values: Object.fromEntries(preview.fields.filter((f) => selected.has(f.key)).map((f) => [f.key, f.suggested_value])),
        experiences: replaceJobs ? preview.experiences : undefined,
        educations: replaceSchools ? preview.educations : undefined,
      });
      toast({ message: "Your profile was updated from the resume.", tone: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="card import-panel" aria-label={`Import ${resume.name}`}>
      <div className="card__title-row">
        <h2 className="card__title">Import “{resume.name}” into your profile</h2>
        <button type="button" className="icon-button icon-button--subtle" onClick={onClose} aria-label="Close import">
          <X size={16} />
        </button>
      </div>

      {!preview && (
        <>
          <div className="segmented" role="radiogroup" aria-label="How to read the resume">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "ai"}
              className={`segmented__option${mode === "ai" ? " segmented__option--selected" : ""}`}
              onClick={() => setMode("ai")}
              disabled={!isReady}
            >
              <Sparkles size={15} /> Read everything with {label}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "patterns"}
              className={`segmented__option${mode === "patterns" ? " segmented__option--selected" : ""}`}
              onClick={() => setMode("patterns")}
            >
              <Link2 size={15} /> Contact details and links only (no AI)
            </button>
          </div>
          <p className="muted import-panel__hint">
            {mode === "ai"
              ? "The resume text is sent to the model you chose. Salary, work authorisation and diversity answers are never read or filled."
              : "Finds your email, phone number and LinkedIn, GitHub and LeetCode links on this computer. Nothing is sent anywhere."}
            {!isReady && !isChecking && (
              <>
                {" "}
                To read names, jobs and education too, <Link to="/connectors">connect a model</Link>.
              </>
            )}
          </p>
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={() => void read()} disabled={isReading}>
              {isReading ? <><Loader2 size={16} className="spin" /> Reading… (this can take a minute)</> : <><Bot size={16} /> Read resume</>}
            </button>
          </div>
        </>
      )}

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {preview && (
        <>
          {preview.note && <p className="muted">{preview.note}</p>}

          {preview.fields.length === 0 ? (
            <p className="muted">No profile fields were found in this resume.</p>
          ) : (
            <div className="import-table" role="table" aria-label="Suggested profile values">
              <div className="import-table__row import-table__row--head" role="row">
                <span role="columnheader">
                  <span className="visually-hidden">Use</span>
                </span>
                <span role="columnheader">Field</span>
                <span role="columnheader">Now</span>
                <span role="columnheader">From resume</span>
              </div>
              {preview.fields.map((field) => (
                <label key={field.key} className={`import-table__row${field.is_change ? "" : " import-table__row--same"}`} role="row">
                  <span role="cell">
                    {field.is_change ? (
                      <input type="checkbox" checked={selected.has(field.key)} onChange={() => toggle(field.key)} />
                    ) : (
                      <Check size={15} aria-label="Already saved" className="import-table__same-icon" />
                    )}
                  </span>
                  <span role="cell" className="import-table__label">
                    {field.label}
                    <span className={`badge ${field.source === "ai" ? "badge--neutral" : "badge--good"}`}>
                      {field.source === "ai" ? "AI" : "exact match"}
                    </span>
                  </span>
                  <span role="cell" className="import-table__current">{field.current_value || <span className="muted">empty</span>}</span>
                  <span role="cell" className="import-table__suggested">{field.suggested_value}</span>
                </label>
              ))}
            </div>
          )}
          {unchanged > 0 && <p className="muted">{unchanged} already match your profile.</p>}

          {preview.experiences.length > 0 && (
            <label className="import-list-choice">
              <input type="checkbox" checked={replaceJobs} onChange={(e) => setReplaceJobs(e.target.checked)} />
              <span>
                <strong>Replace work experience</strong> with these {preview.experiences.length} job
                {preview.experiences.length === 1 ? "" : "s"}:
                <span className="muted"> {preview.experiences.map((e) => `${e.title} at ${e.company}`).join("; ")}</span>
              </span>
            </label>
          )}
          {preview.educations.length > 0 && (
            <label className="import-list-choice">
              <input type="checkbox" checked={replaceSchools} onChange={(e) => setReplaceSchools(e.target.checked)} />
              <span>
                <strong>Replace education</strong> with:
                <span className="muted"> {preview.educations.map((e) => [e.degree, e.school].filter(Boolean).join(", ")).join("; ")}</span>
              </span>
            </label>
          )}

          <div className="button-row">
            <button type="button" className="button button--primary" onClick={() => void apply()} disabled={isApplying || pickedCount === 0}>
              {isApplying ? "Saving…" : `Add ${pickedCount} item${pickedCount === 1 ? "" : "s"} to my profile`}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setPreview(null)} disabled={isApplying}>
              Read again
            </button>
          </div>
        </>
      )}
    </section>
  );
}
