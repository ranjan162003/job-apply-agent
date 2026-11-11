import { RefreshCw } from "lucide-react";

import { ErrorAlert } from "../components/common/ErrorAlert";
import { Skeleton } from "../components/common/Skeleton";
import { ConnectorCard } from "../components/connectors/ConnectorCard";
import { PageHeader } from "../components/layout/PageHeader";
import { useProviderConnections } from "../context/ProviderConnectionsContext";

export function AgentConnectorsPage() {
  const { providers, connectedCount } = useProviderConnections();
  const { statuses, isLoading, error, reloadAll } = providers;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Settings"
        title="Agent connectors"
        description="Connect the AI model that reads your resume and, later, drafts answers to application questions. Sign in with your browser, paste an API key, or run a model locally (private: nothing leaves your computer)."
        actions={
          <button type="button" className="button button--ghost" onClick={() => void reloadAll()} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? "spin" : undefined} /> Refresh all
          </button>
        }
      />

      {statuses.length > 0 && (
        <div className="connector-summary">
          <strong>{connectedCount}</strong> of {statuses.length} connectors ready
        </div>
      )}
      {error && <ErrorAlert message={error} />}
      <div className="connector-grid">
        {isLoading &&
          statuses.length === 0 &&
          [0, 1, 2].map((i) => (
            <div key={i} className="card connector-card" role="status" aria-label="Checking connectors">
              <div className="skeleton-row">
                <Skeleton width={44} height={44} radius={12} />
                <span className="skeleton-stack">
                  <Skeleton width={110} height={16} />
                  <Skeleton width={70} height={11} />
                </span>
              </div>
              <Skeleton height={12} />
              <Skeleton width="80%" height={12} />
              <Skeleton height={64} radius={10} />
              <Skeleton height={64} radius={10} />
            </div>
          ))}
        {statuses.map((status) => (
          <ConnectorCard key={status.provider_id} status={status} />
        ))}
      </div>
    </div>
  );
}
