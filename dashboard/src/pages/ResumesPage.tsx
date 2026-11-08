import { Download, FileText, FileUp, Pencil, Star, Trash2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";

import { resumeApi } from "../api/vaultApi";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { SkeletonList } from "../components/common/Skeleton";
import { PageHeader } from "../components/layout/PageHeader";
import { ResumeImportPanel } from "../components/resumes/ResumeImportPanel";
import { useToast } from "../context/ToastContext";
import type { Resume } from "../types/vault.types";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumesPage() {
  const toast = useToast();
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [importing, setImporting] = useState<Resume | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    resumeApi
      .list()
      .then(setResumes)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null);
    try {
      await action();
      if (success) toast({ message: success, tone: "success" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const saved = await resumeApi.upload(file);
      load();
      setImporting(saved);
      toast({ message: `Uploaded “${saved.name}”.`, tone: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    void upload(event.dataTransfer.files[0]);
  }

  function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!renaming || !renaming.name.trim()) return;
    const { id, name } = renaming;
    setRenaming(null);
    void run(() => resumeApi.rename(id, name.trim()));
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your details"
        title="Resumes"
        description="Keep one resume per kind of role. The default one is uploaded to application forms; you can switch per job."
      />

      <div
        className={`dropzone${isDragging ? " dropzone--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <FileUp size={26} aria-hidden="true" />
        <p>
          <strong>Drop a resume here</strong> <span className="muted">(PDF or Word .docx, up to 5 MB)</span>
        </p>
        <button type="button" className="button button--primary" onClick={() => fileInput.current?.click()} disabled={isUploading}>
          {isUploading ? "Uploading…" : "Choose a file"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
          aria-label="Choose a resume file"
        />
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {importing && <ResumeImportPanel key={importing.id} resume={importing} onClose={() => setImporting(null)} />}

      {resumes === null ? (
        <SkeletonList rows={2} label="Loading resumes" />
      ) : resumes.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="No resumes yet"
            description="Upload your resume. Apply Copilot can read it into your profile, then attach it to applications for you."
          />
        </div>
      ) : (
        <ul className="resume-list">
          {resumes.map((resume) => (
            <li key={resume.id} className={`card resume-card${resume.is_default ? " resume-card--default" : ""}`}>
              <span className="resume-card__icon" aria-hidden="true">
                <FileText size={20} />
              </span>
              <div className="resume-card__body">
                {renaming?.id === resume.id ? (
                  <form onSubmit={submitRename} className="resume-card__rename">
                    <input
                      className="input input--compact"
                      value={renaming.name}
                      maxLength={120}
                      autoFocus
                      onChange={(e) => setRenaming({ id: resume.id, name: e.target.value })}
                      onBlur={submitRename}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                      aria-label="Resume name"
                    />
                  </form>
                ) : (
                  <div className="resume-card__title">
                    {resume.name}
                    {resume.is_default && <span className="badge badge--good">Default</span>}
                  </div>
                )}
                <div className="muted resume-card__meta">
                  {resume.original_filename} · {formatSize(resume.size_bytes)} · added{" "}
                  {new Date(resume.created_at).toLocaleDateString()}
                  {resume.text_characters === 0 && <span className="text-warning"> · no text found (scanned?)</span>}
                </div>
              </div>
              <div className="button-row resume-card__actions">
                <button type="button" className="button button--secondary button--small" onClick={() => setImporting(resume)}>
                  <Wand2 size={14} /> Import into profile
                </button>
                {!resume.is_default && (
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => void run(() => resumeApi.makeDefault(resume.id), `“${resume.name}” is now the default.`)}
                  >
                    <Star size={14} /> Make default
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button icon-button--subtle"
                  onClick={() => setRenaming({ id: resume.id, name: resume.name })}
                  aria-label={`Rename ${resume.name}`}
                  title="Rename"
                >
                  <Pencil size={15} />
                </button>
                <a className="icon-button icon-button--subtle" href={resumeApi.fileUrl(resume.id)} aria-label={`Download ${resume.name}`} title="Download">
                  <Download size={15} />
                </a>
                <button
                  type="button"
                  className="icon-button icon-button--subtle"
                  onClick={() => {
                    if (window.confirm(`Delete “${resume.name}”? The file is removed from this computer.`)) {
                      if (importing?.id === resume.id) setImporting(null);
                      void run(() => resumeApi.remove(resume.id), "Resume deleted.");
                    }
                  }}
                  aria-label={`Delete ${resume.name}`}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
