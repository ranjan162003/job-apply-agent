import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { checkBackend, type BackendState } from "../backend";
import { DEFAULT_SETTINGS, saveSettings, type PanelSettings } from "../settings";

interface SettingsViewProps {
  settings: PanelSettings;
  onSaved: (settings: PanelSettings, state: BackendState) => void;
  onBack?: () => void;
}

/** Paste the pairing code from the dashboard; it's checked against the backend before saving. */
export function SettingsView({ settings, onSaved, onBack }: SettingsViewProps) {
  const [token, setToken] = useState(settings.token);
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsChecking(true);
    setMessage(null);
    const next = { backendUrl: backendUrl.trim() || DEFAULT_SETTINGS.backendUrl, token: token.trim() };
    const state = await checkBackend(next);
    setIsChecking(false);
    if (state.status === "connected") {
      await saveSettings(next);
      onSaved(next, state);
    } else {
      setMessage(state.status === "checking" ? null : state.message);
    }
  }

  return (
    <form className="panel-card settings" onSubmit={submit}>
      <div className="panel-card__title-row">
        {onBack && (
          <button type="button" className="icon-button" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
        )}
        <h2 className="panel-card__title">Pair with the Apply Copilot app</h2>
      </div>
      <ol className="settings__steps">
        <li>Start the app on this computer (cd scripts, then npm run dev).</li>
        <li>
          Open the dashboard at{" "}
          <a href="http://localhost:5174/extension" target="_blank" rel="noreferrer">
            localhost:5174/extension
          </a>{" "}
          and click <strong>Create pairing code</strong>.
        </li>
        <li>Paste the code here.</li>
      </ol>

      <label className="settings__field">
        <span>Pairing code</span>
        <input
          className="panel-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ac_…"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>

      <details className="settings__advanced">
        <summary>Advanced</summary>
        <label className="settings__field">
          <span>App address</span>
          <input className="panel-input" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} spellCheck={false} />
        </label>
      </details>

      {message && (
        <p className="panel-alert" role="alert">
          {message}
        </p>
      )}

      <button type="submit" className="panel-button panel-button--primary" disabled={isChecking || !token.trim()}>
        {isChecking ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />} {isChecking ? "Checking…" : "Pair"}
      </button>
    </form>
  );
}
