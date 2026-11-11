import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Hash,
  Link,
  ListChecks,
  Mail,
  Paperclip,
  Phone,
  Search,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { FieldKind } from "../../shared/fields";
import type { RowStatus } from "../autofill";
import { KIND_LABELS, type FieldSection, type ListedField } from "../fieldGroups";

const KIND_ICONS: Record<FieldKind, LucideIcon> = {
  text: Type,
  email: Mail,
  tel: Phone,
  url: Link,
  number: Hash,
  date: Calendar,
  textarea: AlignLeft,
  select: ChevronDown,
  "custom-select": ChevronDown,
  combobox: Search,
  radio: CircleDot,
  checkbox: CheckSquare,
  "checkbox-group": ListChecks,
  file: Paperclip,
};

const GUESSED_SOURCES = new Set(["nearby", "name", "placeholder"]);

interface FieldListProps {
  sections: FieldSection[];
  /** `${frameId}-${fieldId}` of the field shown on the page. */
  activeKey: string | null;
  onSelect: (field: ListedField) => void;
  /** After "Fill from profile": what happened to each field. */
  rowStatus?: Map<string, RowStatus>;
}

function optionsPreview(options: string[]): string {
  const shown = options.slice(0, 4).join(" · ");
  return options.length > 4 ? `${shown} · +${options.length - 4} more` : shown;
}

function StatusLine({ status }: { status: RowStatus }) {
  if (status.kind === "filled") return <span className="field-row__status field-row__status--filled">✓ {status.value}</span>;
  if (status.kind === "kept") return <span className="field-row__status">Kept what was already there</span>;
  return (
    <span className={`field-row__status${status.kind === "needs-you" ? " field-row__status--needs-you" : ""}`}>
      {status.kind === "needs-you" ? "Needs you: " : ""}
      {status.reason}
    </span>
  );
}

export function FieldList({ sections, activeKey, onSelect, rowStatus }: FieldListProps) {
  return (
    <div className="field-list">
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="field-list__section" aria-label={section.title}>
          <h3 className="field-list__section-title">{section.title}</h3>
          <ul>
            {section.fields.map((field) => {
              const Icon = KIND_ICONS[field.kind];
              const status = rowStatus?.get(`${field.frameId}-${field.id}`);
              return (
                <li key={`${field.frameId}-${field.id}`}>
                  <button
                    type="button"
                    className={`field-row${activeKey === `${field.frameId}-${field.id}` ? " field-row--active" : ""}`}
                    onClick={() => onSelect(field)}
                    title="Show this field on the page"
                  >
                    <span className="field-row__icon" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span className="field-row__body">
                      <span className="field-row__label">
                        {field.label || <em className="muted">No label found</em>}
                        {field.required && (
                          <span className="field-row__required" aria-label="required">
                            *
                          </span>
                        )}
                      </span>
                      <span className="field-row__meta">
                        {KIND_LABELS[field.kind]}
                        {field.options.length > 0 && ` · ${optionsPreview(field.options)}`}
                        {field.maxLength && ` · max ${field.maxLength} chars`}
                      </span>
                      {status && <StatusLine status={status} />}
                    </span>
                    <span className="field-row__tags">
                      {field.hasValue && <span className="tag tag--good">filled</span>}
                      {GUESSED_SOURCES.has(field.labelSource) && (
                        <span className="tag" title={`Label read from the field's ${field.labelSource === "nearby" ? "nearby text" : field.labelSource}`}>
                          guessed
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
