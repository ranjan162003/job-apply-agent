import { Lock } from "lucide-react";

import type { ProfileField } from "../../types/vault.types";

interface ProfileFieldInputProps {
  field: ProfileField;
  value: string;
  isDirty: boolean;
  onChange: (value: string) => void;
}

const INPUT_TYPE: Partial<Record<ProfileField["type"], string>> = {
  email: "email",
  tel: "tel",
  url: "url",
  number: "text", // "15,00,000" is fine; the backend strips the commas
  date: "date",
};

/** One vault field, rendered by its catalog type. */
export function ProfileFieldInput({ field, value, isDirty, onChange }: ProfileFieldInputProps) {
  const id = `profile-${field.key}`;
  const isWide = field.type === "textarea";

  return (
    <div className={`field profile-field${isWide ? " profile-field--wide" : ""}${isDirty ? " profile-field--dirty" : ""}`}>
      <label className="field__label profile-field__label" htmlFor={id}>
        {field.label}
        {field.never_ai && (
          <span className="profile-field__lock" title="Only you fill this. The AI never writes or guesses it.">
            <Lock size={12} aria-hidden="true" />
            <span className="visually-hidden">(only you fill this)</span>
          </span>
        )}
      </label>

      {field.type === "textarea" ? (
        <textarea id={id} className="input input--textarea" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "select" || field.type === "yes_no" ? (
        <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not set</option>
          {(field.type === "yes_no" ? ["Yes", "No"] : field.options).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="input"
          type={INPUT_TYPE[field.type] ?? "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      )}

      {field.help && <span className="field__hint">{field.help}</span>}
    </div>
  );
}
