import { useProviderConnections } from "../context/ProviderConnectionsContext";
import type { AgentChoice } from "../types/provider.types";

/** The model picked in the sidebar/connectors, as the `{provider_id, model_name}` the API expects. */
export function useAgentChoice(): { agent: AgentChoice; isReady: boolean; isChecking: boolean; label: string } {
  const { activeProviderId, activeModel, activeStatus, providers } = useProviderConnections();
  return {
    agent: { provider_id: activeProviderId, model_name: activeModel || null },
    isReady: Boolean(activeStatus?.is_ready),
    // Statuses haven't arrived yet: don't tell the user to connect a model that may already be connected.
    isChecking: providers.isLoading && providers.statuses.length === 0,
    label: activeStatus ? activeStatus.display_name : "the model",
  };
}
