import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorAlert } from "../common/ErrorAlert";

export interface EntryColumn<T> {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  type?: "text" | "month" | "year" | "textarea" | "checkbox";
  required?: boolean;
  /** Hide this input when the predicate is true (e.g. end date while "current job" is ticked). */
  hiddenWhen?: (entry: T) => boolean;
}

interface EntryListEditorProps<T> {
  title: string;
  description: string;
  itemLabel: string;
  entries: T[];
  columns: EntryColumn<T>[];
  blank: () => T;
  summarize: (entry: T) => string;
  onSave: (entries: T[]) => Promise<void>;
}

/** An editable, reorderable list (jobs or education) saved as a whole. */
export function EntryListEditor<T extends object>({
  title,
  description,
  itemLabel,
  entries,
  columns,
  blank,
  summarize,
  onSave,
}: EntryListEditorProps<T>) {
  const [draft, setDraft] = useState<T[]>(entries);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(entries), [entries]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(entries);

  function patch(index: number, key: keyof T, value: unknown) {
    setDraft((current) => current.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));
  }

  function move(index: number, by: -1 | 1) {
    setDraft((current) => {
      const next = [...current];
      const [entry] = next.splice(index, 1);
      next.splice(index + by, 0, entry);
      return next;
    });
  }

  async function save() {
    const incomplete = draft.findIndex((entry) =>
      columns.some((c) => c.required && !String(entry[c.key] ?? "").trim()),
    );
    if (incomplete >= 0) {
      setError(`${itemLabel} ${incomplete + 1} is missing a required field.`);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card entry-list" aria-label={title}>
      <div className="card__title-row">
        <div>
          <h2 className="card__title">{title}</h2>
          <p className="muted entry-list__description">{description}</p>
        </div>
        <div className="button-row">
          <button type="button" className="button button--secondary button--small" onClick={() => setDraft((c) => [...c, blank()])}>
            <Plus size={14} /> Add {itemLabel.toLowerCase()}
          </button>
          <button type="button" className="button button--primary button--small" onClick={() => void save()} disabled={!isDirty || isSaving}>
            <Save size={14} /> {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {draft.length === 0 ? (
        <p className="muted entry-list__empty">None yet. Add one, or import them from a resume.</p>
      ) : (
        <ol className="entry-list__items">
          {draft.map((entry, index) => (
            <li key={index} className="entry">
              <div className="entry__header">
                <span className="entry__summary">{summarize(entry) || `${itemLabel} ${index + 1}`}</span>
                <span className="entry__actions">
                  <button type="button" className="icon-button icon-button--subtle" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--subtle"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--subtle"
                    onClick={() => setDraft((c) => c.filter((_, i) => i !== index))}
                    aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              <div className="entry__grid">
                {columns.map((column) => {
                  if (column.hiddenWhen?.(entry)) return null;
                  const id = `${title}-${index}-${column.key}`;
                  const value = entry[column.key];
                  if (column.type === "checkbox") {
                    return (
                      <label key={column.key} className="entry__checkbox" htmlFor={id}>
                        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => patch(index, column.key, e.target.checked)} />
                        {column.label}
                      </label>
                    );
                  }
                  return (
                    <div key={column.key} className={`field${column.type === "textarea" ? " entry__wide" : ""}`}>
                      <label className="field__label" htmlFor={id}>
                        {column.label}
                        {column.required && <span aria-hidden="true"> *</span>}
                      </label>
                      {column.type === "textarea" ? (
                        <textarea
                          id={id}
                          className="input input--textarea"
                          rows={3}
                          value={String(value ?? "")}
                          onChange={(e) => patch(index, column.key, e.target.value)}
                        />
                      ) : (
                        <input
                          id={id}
                          className="input"
                          type={column.type === "month" ? "month" : "text"}
                          inputMode={column.type === "year" ? "numeric" : undefined}
                          maxLength={column.type === "year" ? 4 : undefined}
                          placeholder={column.placeholder}
                          value={String(value ?? "")}
                          onChange={(e) => patch(index, column.key, e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
