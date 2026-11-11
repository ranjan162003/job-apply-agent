import { Plug } from "lucide-react";
import { Link } from "react-router-dom";

import { useProviderConnections } from "../../context/ProviderConnectionsContext";
import type { ProviderId } from "../../types/provider.types";
import { Skeleton } from "../common/Skeleton";
import { ProviderLogo } from "../connectors/ProviderLogo";

/** Compact model chooser for practice pages; full setup lives on the Connectors page. */
export function ActiveModelSelector() {
  const { providers, activeProviderId, activeModel, activeStatus, setActiveProvider, setActiveModel } =
    useProviderConnections();
  const connected = providers.statuses.filter((s) => s.is_ready);

  if (providers.isLoading && providers.statuses.length === 0) {
    return (
      <div className="active-model" role="status" aria-label="Checking connected models">
        <div className="active-model__providers">
          <Skeleton height={44} radius={10} />
          <Skeleton height={44} radius={10} />
        </div>
        <Skeleton height={40} radius={10} />
      </div>
    );
  }

  if (connected.length === 0) {
    return (
      <div className="empty-connector">
        <p>No AI model is connected yet.</p>
        <Link to="/connectors" className="button button--primary button--small">
          <Plug size={14} /> Connect a model
        </Link>
      </div>
    );
  }

  return (
    <div className="active-model">
      <div className="active-model__providers" role="radiogroup" aria-label="AI provider">
        {connected.map((status) => (
          <button
            key={status.provider_id}
            type="button"
            role="radio"
            aria-checked={status.provider_id === activeProviderId}
            className={`provider-option${status.provider_id === activeProviderId ? " provider-option--selected" : ""}`}
            onClick={() => setActiveProvider(status.provider_id as ProviderId)}
          >
            <ProviderLogo providerId={status.provider_id} size={28} />
            <span>{status.display_name}</span>
          </button>
        ))}
      </div>

      {activeStatus?.is_ready ? (
        <label className="field">
          <span className="field__label">Model</span>
          <select
            className="input"
            value={activeModel || activeStatus.default_model}
            onChange={(event) => setActiveModel(event.target.value)}
          >
            {activeStatus.available_models.map((model) => (
              <option key={model} value={model}>
                {model}
                {model === activeStatus.default_model ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="field__hint field__hint--warning">
          {activeStatus?.display_name ?? "This model"} isn't connected — pick another or{" "}
          <Link to="/connectors">connect it</Link>.
        </p>
      )}

      <Link to="/connectors" className="field__hint">
        Manage connectors →
      </Link>
    </div>
  );
}
