import { useState, type FormEvent } from "react";

interface ApiKeyFormProps {
  providerId: string;
  providerName: string;
  apiKeyUrl?: string;
  isSaving: boolean;
  onSave: (apiKey: string) => Promise<void>;
  onCancel: () => void;
}

export function ApiKeyForm({ providerId, providerName, apiKeyUrl, isSaving, onSave, onCancel }: ApiKeyFormProps) {
  const [apiKey, setApiKey] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (apiKey.trim()) await onSave(apiKey.trim());
  };

  return (
    <form className="api-key-form" onSubmit={handleSubmit}>
      <label className="field__label" htmlFor={`${providerId}-api-key`}>
        {providerName} API key
      </label>
      <div className="inline-form">
        <input
          id={`${providerId}-api-key`}
          className="input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoFocus
        />
        <button type="submit" className="button button--primary" disabled={isSaving || !apiKey.trim()}>
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="field__hint">
        Only ever sent to {providerName}.{" "}
        {apiKeyUrl && (
          <a href={apiKeyUrl} target="_blank" rel="noreferrer">
            Get a key ↗
          </a>
        )}
      </p>
    </form>
  );
}
