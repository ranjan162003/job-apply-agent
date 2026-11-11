import { CheckCircle2, Globe, KeyRound, Loader2, RefreshCw, Server, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { providerApi } from "../../api/providerApi";
import { useProviderConnections } from "../../context/ProviderConnectionsContext";
import type { ProviderStatus } from "../../types/provider.types";
import { CopyableCommand } from "../common/CopyableCommand";
import { ApiKeyForm } from "./ApiKeyForm";
import { CONNECTOR_METADATA } from "./connectorMetadata";
import { ConnectorStatusBadge } from "./ConnectorStatusBadge";
import { ProviderLogo } from "./ProviderLogo";

interface ConnectorCardProps {
  status: ProviderStatus;
}

/** One AI provider: its connection methods (browser login / API key / local server) and model choice. */
export function ConnectorCard({ status }: ConnectorCardProps) {
  const { providers, activeProviderId, activeModel, setActiveProvider, setActiveModel } = useProviderConnections();
  const meta = CONNECTOR_METADATA[status.provider_id];
  const isActive = activeProviderId === status.provider_id;
  const isWaitingForLogin = providers.pollingProviderId === status.provider_id;

  const [showKeyForm, setShowKeyForm] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const run = async (actionName: string, action: () => Promise<string | void>) => {
    setBusyAction(actionName);
    setNotice(null);
    try {
      const message = await action();
      if (message) setNotice({ tone: "info", text: message });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyAction(null);
    }
  };

  const startBrowserLogin = () =>
    run("login", async () => {
      const result = await providerApi.startBrowserLogin(status.provider_id);
      if (result.started) providers.pollUntilReady(status.provider_id);
      return result.message;
    });

  return (
    <article className={`connector-card${isActive ? " connector-card--active" : ""}`}>
      <header className="connector-card__header">
        <ProviderLogo providerId={status.provider_id} size={44} />
        <div className="connector-card__identity">
          <h2 className="connector-card__name">{status.display_name}</h2>
          <span className="connector-card__vendor">{meta.vendor}</span>
        </div>
        <ConnectorStatusBadge status={status} isWaitingForLogin={isWaitingForLogin} />
      </header>

      <p className="connector-card__description">{status.description}</p>

      <div className="connection-methods">
        {status.supports_cli_login && (
          <ConnectionMethodRow
            icon={<Globe size={18} />}
            title={meta.browserLoginLabel}
            description={meta.browserLoginDescription}
            isConnected={status.cli_logged_in}
            connectedLabel="Signed in"
          >
            {!status.cli_installed ? (
              <div className="connection-method__setup">
                <span className="field__hint">Needs the {status.display_name} CLI installed once:</span>
                <CopyableCommand command={meta.installCommand} />
              </div>
            ) : (
              !status.cli_logged_in && (
                <button
                  type="button"
                  className="button button--primary button--small"
                  disabled={busyAction !== null || isWaitingForLogin}
                  onClick={startBrowserLogin}
                >
                  {busyAction === "login" || isWaitingForLogin ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Globe size={14} />
                  )}
                  {isWaitingForLogin ? "Waiting…" : "Connect with browser"}
                </button>
              )
            )}
          </ConnectionMethodRow>
        )}

        {status.supports_api_key && (
          <ConnectionMethodRow
            icon={<KeyRound size={18} />}
            title="API key"
            description="Paste a key instead. Stored in your OS credential vault, never in a file."
            isConnected={status.api_key_saved}
            connectedLabel="Key saved"
          >
            {status.api_key_saved ? (
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={busyAction !== null}
                onClick={() =>
                  run("remove-key", async () => {
                    providers.replaceStatus(await providerApi.removeApiKey(status.provider_id));
                    return "API key removed.";
                  })
                }
              >
                <Trash2 size={14} /> Remove
              </button>
            ) : (
              !showKeyForm && (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => setShowKeyForm(true)}
                >
                  <KeyRound size={14} /> Add key
                </button>
              )
            )}
          </ConnectionMethodRow>
        )}

        {showKeyForm && !status.api_key_saved && (
          <ApiKeyForm
            providerId={status.provider_id}
            providerName={status.display_name}
            apiKeyUrl={meta.apiKeyUrl}
            isSaving={busyAction === "save-key"}
            onCancel={() => setShowKeyForm(false)}
            onSave={(key) =>
              run("save-key", async () => {
                providers.replaceStatus(await providerApi.saveApiKey(status.provider_id, key));
                setShowKeyForm(false);
                return "API key saved.";
              })
            }
          />
        )}

        {status.provider_id === "ollama" && (
          <ConnectionMethodRow
            icon={<Server size={18} />}
            title="Local server"
            description={status.status_message}
            isConnected={status.is_ready}
            connectedLabel="Running"
          >
            {!status.is_ready && (
              <div className="connection-method__setup">
                <span className="field__hint">Install from ollama.com, then pull a model:</span>
                <CopyableCommand command={meta.installCommand} />
              </div>
            )}
          </ConnectionMethodRow>
        )}
      </div>

      {isWaitingForLogin && (
        <p className="connector-card__notice connector-card__notice--info">
          <Loader2 size={14} className="spin" /> Finish signing in in the window that opened. This card updates
          automatically once you're connected.
        </p>
      )}
      {notice && !isWaitingForLogin && (
        <p className={`connector-card__notice connector-card__notice--${notice.tone}`}>{notice.text}</p>
      )}

      <footer className="connector-card__footer">
        {status.is_ready && status.available_models.length > 0 ? (
          <label className="connector-card__model">
            <span className="field__label">Model</span>
            <select
              className="input input--compact"
              value={(isActive && activeModel) || status.default_model}
              onChange={(event) => {
                if (!isActive) setActiveProvider(status.provider_id);
                setActiveModel(event.target.value);
              }}
            >
              {status.available_models.map((model) => (
                <option key={model} value={model}>
                  {model}
                  {model === status.default_model ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="field__hint">Connect to choose a model.</span>
        )}

        <div className="connector-card__footer-actions">
          <button
            type="button"
            className="icon-button icon-button--subtle"
            aria-label={`Re-check ${status.display_name} status`}
            title="Re-check status"
            disabled={busyAction !== null}
            onClick={() => run("refresh", async () => void (await providers.refreshOne(status.provider_id)))}
          >
            <RefreshCw size={16} className={busyAction === "refresh" ? "spin" : undefined} />
          </button>
          {isActive ? (
            <span className="pill pill--active">
              <CheckCircle2 size={14} /> In use
            </span>
          ) : (
            <button
              type="button"
              className="button button--secondary button--small"
              disabled={!status.is_ready}
              onClick={() => setActiveProvider(status.provider_id)}
            >
              Use for advice
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

interface ConnectionMethodRowProps {
  icon: ReactNode;
  title: string;
  description: string;
  isConnected: boolean;
  connectedLabel: string;
  children?: ReactNode;
}

function ConnectionMethodRow({ icon, title, description, isConnected, connectedLabel, children }: ConnectionMethodRowProps) {
  return (
    <div className="connection-method">
      <span className="connection-method__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="connection-method__body">
        <div className="connection-method__title">{title}</div>
        <p className="connection-method__description">{description}</p>
      </div>
      <div className="connection-method__action">
        {isConnected ? (
          <span className="connection-method__connected">
            <CheckCircle2 size={16} /> {connectedLabel}
          </span>
        ) : null}
        {children}
      </div>
    </div>
  );
}
