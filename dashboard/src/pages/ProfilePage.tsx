import { FileUp, Lock, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { profileApi } from "../api/vaultApi";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { SkeletonResults } from "../components/common/Skeleton";
import { PageHeader } from "../components/layout/PageHeader";
import { CompletenessMeter } from "../components/profile/CompletenessMeter";
import { EntryListEditor, type EntryColumn } from "../components/profile/EntryListEditor";
import { ProfileFieldInput } from "../components/profile/ProfileFieldInput";
import { useToast } from "../context/ToastContext";
import type { Education, Experience, Profile } from "../types/vault.types";

const EXPERIENCE_COLUMNS: EntryColumn<Experience>[] = [
  { key: "title", label: "Job title", required: true },
  { key: "company", label: "Company", required: true },
  { key: "location", label: "Location" },
  { key: "start_date", label: "Start", type: "month" },
  { key: "end_date", label: "End", type: "month", hiddenWhen: (e) => e.is_current },
  { key: "is_current", label: "I work here now", type: "checkbox" },
  { key: "description", label: "What you did", type: "textarea" },
];

const EDUCATION_COLUMNS: EntryColumn<Education>[] = [
  { key: "school", label: "College / school", required: true },
  { key: "degree", label: "Degree", placeholder: "B.Tech" },
  { key: "field_of_study", label: "Field of study" },
  { key: "start_year", label: "Start year", type: "year", placeholder: "2017" },
  { key: "end_year", label: "End year", type: "year", placeholder: "2021" },
  { key: "grade", label: "CGPA / %" },
];

const BLANK_EXPERIENCE = (): Experience => ({
  title: "",
  company: "",
  location: "",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
});

const BLANK_EDUCATION = (): Education => ({
  school: "",
  degree: "",
  field_of_study: "",
  start_year: "",
  end_year: "",
  grade: "",
});

export function ProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    profileApi
      .get()
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(load, [load]);

  const savedValues = useMemo(() => {
    const values: Record<string, string> = {};
    profile?.sections.forEach((s) => s.fields.forEach((f) => (values[f.key] = f.value ?? "")));
    return values;
  }, [profile]);

  const dirtyKeys = Object.keys(edits).filter((key) => edits[key] !== savedValues[key]);

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await profileApi.update(Object.fromEntries(dirtyKeys.map((key) => [key, edits[key]])));
      setProfile(updated);
      setEdits({});
      toast({ message: `Saved ${dirtyKeys.length} field${dirtyKeys.length === 1 ? "" : "s"}.`, tone: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="page">
        <PageHeader eyebrow="Your details" title="Profile" />
        {error ? <ErrorAlert message={error} /> : <SkeletonResults label="Loading your profile" />}
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <PageHeader
        eyebrow="Your details"
        title="Profile"
        description="Fill this in once. The extension uses it to fill application forms. Everything stays on this computer."
        actions={
          <Link to="/resumes" className="button button--secondary">
            <FileUp size={16} /> Import from a resume
          </Link>
        }
      />

      <CompletenessMeter percent={profile.completeness.percent} missing={profile.completeness.missing} />

      <p className="profile-page__legend muted">
        <Lock size={13} aria-hidden="true" /> Only you fill these fields: salary, work authorisation and diversity
        questions. The AI never writes or guesses them.
      </p>

      {profile.sections.map((section) => (
        <section key={section.id} className="card profile-section" aria-labelledby={`section-${section.id}`}>
          <h2 className="card__title" id={`section-${section.id}`}>
            {section.title}
          </h2>
          {section.description && <p className="muted profile-section__description">{section.description}</p>}
          <div className="profile-section__grid">
            {section.fields.map((field) => {
              const value = edits[field.key] ?? savedValues[field.key];
              return (
                <ProfileFieldInput
                  key={field.key}
                  field={field}
                  value={value}
                  isDirty={dirtyKeys.includes(field.key)}
                  onChange={(next) => setEdits((current) => ({ ...current, [field.key]: next }))}
                />
              );
            })}
          </div>
        </section>
      ))}

      <EntryListEditor
        title="Work experience"
        description="Newest first. Workday-style forms ask for each job separately."
        itemLabel="Job"
        entries={profile.experiences}
        columns={EXPERIENCE_COLUMNS}
        blank={BLANK_EXPERIENCE}
        summarize={(e) => [e.title, e.company].filter(Boolean).join(" · ")}
        onSave={async (entries) => {
          await profileApi.saveExperiences(entries);
          load();
          toast({ message: "Work experience saved.", tone: "success" });
        }}
      />

      <EntryListEditor
        title="Education"
        description="Highest first."
        itemLabel="School"
        entries={profile.educations}
        columns={EDUCATION_COLUMNS}
        blank={BLANK_EDUCATION}
        summarize={(e) => [e.degree, e.school].filter(Boolean).join(" · ")}
        onSave={async (entries) => {
          await profileApi.saveEducations(entries);
          load();
          toast({ message: "Education saved.", tone: "success" });
        }}
      />

      {(dirtyKeys.length > 0 || error) && (
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          {error ? (
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          ) : (
            <span>
              {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? "" : "s"}
            </span>
          )}
          <div className="button-row">
            <button type="button" className="button button--ghost" onClick={() => setEdits({})} disabled={isSaving || dirtyKeys.length === 0}>
              <RotateCcw size={16} /> Discard
            </button>
            <button type="button" className="button button--primary" onClick={() => void save()} disabled={isSaving || dirtyKeys.length === 0}>
              <Save size={16} /> {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
