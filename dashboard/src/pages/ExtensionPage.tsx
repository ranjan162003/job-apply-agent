import { Check, Copy, KeyRound, Link2Off, Puzzle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { pairingApi } from "../api/vaultApi";
import { CopyableCommand } from "../components/common/CopyableCommand";
import { ErrorAlert } from "../components/common/ErrorAlert";
import { PageHeader } from "../components/layout/PageHeader";
import { useToast } from "../context/ToastContext";
import type { PairingStatus } from "../types/vault.types";

export function ExtensionPage() {
  const toast = useToast();
  const [status, setStatus] = useState<PairingStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pairingApi
      .status()
      .then(setStatus)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function createCode() {
    if (status?.is_paired && !window.confirm("Make a new code? The extension stops working until you paste the new one.")) return;
    setError(null);
    try {
      const code = await pairingApi.create();
      setToken(code.token);
      setStatus({ is_paired: true, paired_at: code.paired_at });
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function unpair() {
    if (!window.confirm("Unpair the extension? It won't be able to read your profile until you pair it again.")) return;
    try {
      await pairingApi.revoke();
      setStatus({ is_paired: false, paired_at: null });
      setToken(null);
      toast({ message: "Extension unpaired.", tone: "info" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  }

  return (
    <div className="page page--narrow">
      <PageHeader
        eyebrow="Settings"
        title="Browser extension"
        description="The extension reads application forms and fills them from your profile. It only talks to this app on your computer."
      />

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      <section className="card">
        <h2 className="card__title">1. Install it in Chrome or Edge</h2>
        <ol className="steps">
          <li>
            From the project folder, build the extension (<code>npm run dev</code> in <code>scripts</code> also rebuilds it on every change):
            <CopyableCommand command="npm --prefix scripts run build:extension" />
          </li>
          <li>
            Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) and switch on <strong>Developer mode</strong>.
          </li>
          <li>
            Click <strong>Load unpacked</strong> and choose the <code>extension/dist</code> folder of this project.
          </li>
          <li>
            Pin <strong>Apply Copilot</strong> to the toolbar. Clicking it opens the side panel.
          </li>
        </ol>
      </section>

      <section className="card">
        <div className="card__title-row">
          <h2 className="card__title">2. Pair it with this app</h2>
          {status?.is_paired ? (
            <span className="badge badge--good">
              <ShieldCheck size={14} aria-hidden="true" /> Paired
            </span>
          ) : (
            <span className="badge badge--neutral">Not paired</span>
          )}
        </div>
        <p className="muted">
          The extension needs a pairing code before it can read your profile, so no other program or website can.
          Only a fingerprint of the code is saved here.
        </p>

        {token ? (
          <div className="pairing-code">
            <p>
              Paste this into the extension (side panel → <strong>Settings</strong>). It is shown only once.
            </p>
            <div className="pairing-code__value">
              <code>{token}</code>
              <button type="button" className="button button--primary button--small" onClick={() => void copyToken()}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          status?.is_paired &&
          status.paired_at && <p>Paired on {new Date(status.paired_at).toLocaleString()}.</p>
        )}

        <div className="button-row">
          <button type="button" className="button button--primary" onClick={() => void createCode()}>
            <KeyRound size={16} /> {status?.is_paired ? "Make a new code" : "Create pairing code"}
          </button>
          {status?.is_paired && (
            <button type="button" className="button button--ghost" onClick={() => void unpair()}>
              <Link2Off size={16} /> Unpair
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">
          <Puzzle size={18} aria-hidden="true" /> 3. Open an application form
        </h2>
        <p>
          Open a job application (Greenhouse, Lever, Ashby, Workday, Naukri or any careers page) and click the Apply
          Copilot icon. The side panel lists every field it finds on the page. Click a field to jump to it.
        </p>
        <p className="muted">
          Filling the fields from your profile comes in the next version. Apply Copilot never presses Submit: you
          always review and send the application yourself.
        </p>
      </section>
    </div>
  );
}
