import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useProviderStatuses } from "../hooks/useProviderStatuses";
import type { ProviderId, ProviderStatus } from "../types/provider.types";

const ACTIVE_PROVIDER_STORAGE_KEY = "apply-copilot:active-provider";
const ACTIVE_MODEL_STORAGE_KEY = "apply-copilot:active-model";

interface ProviderConnectionsValue {
  providers: ReturnType<typeof useProviderStatuses>;
  activeProviderId: ProviderId;
  activeModel: string;
  activeStatus: ProviderStatus | undefined;
  connectedCount: number;
  setActiveProvider: (providerId: ProviderId) => void;
  setActiveModel: (model: string) => void;
}

const ProviderConnectionsContext = createContext<ProviderConnectionsValue | null>(null);

/** App-wide connector state: every provider's status + which one the agents use. */
export function ProviderConnectionsProvider({ children }: { children: ReactNode }) {
  const providers = useProviderStatuses();
  const [activeProviderId, setActiveProviderId] = useState<ProviderId>(readStoredProvider);
  const [activeModel, setActiveModelState] = useState<string>(() => readStorage(ACTIVE_MODEL_STORAGE_KEY) ?? "");

  const setActiveProvider = useCallback((providerId: ProviderId) => {
    setActiveProviderId(providerId);
    setActiveModelState("");
    writeStorage(ACTIVE_PROVIDER_STORAGE_KEY, providerId);
    writeStorage(ACTIVE_MODEL_STORAGE_KEY, "");
  }, []);

  const setActiveModel = useCallback((model: string) => {
    setActiveModelState(model);
    writeStorage(ACTIVE_MODEL_STORAGE_KEY, model);
  }, []);

  // When statuses first arrive: if the remembered provider isn't connected, fall back to one that is.
  const statusCount = providers.statuses.length;
  useEffect(() => {
    const current = providers.statuses.find((s) => s.provider_id === activeProviderId);
    if (current && !current.is_ready) {
      const firstReady = providers.statuses.find((s) => s.is_ready);
      if (firstReady) setActiveProvider(firstReady.provider_id);
    }
    // Only on first load — never fight a choice the user makes afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusCount]);

  const value = useMemo<ProviderConnectionsValue>(() => {
    const activeStatus = providers.statuses.find((s) => s.provider_id === activeProviderId);
    // A remembered model that this provider no longer offers falls back to its default.
    const validModel =
      activeStatus && activeModel && activeStatus.available_models.includes(activeModel) ? activeModel : "";
    return {
      providers,
      activeProviderId,
      activeModel: validModel,
      activeStatus,
      connectedCount: providers.statuses.filter((s) => s.is_ready).length,
      setActiveProvider,
      setActiveModel,
    };
  }, [providers, activeProviderId, activeModel, setActiveProvider, setActiveModel]);

  return <ProviderConnectionsContext.Provider value={value}>{children}</ProviderConnectionsContext.Provider>;
}

export function useProviderConnections(): ProviderConnectionsValue {
  const value = useContext(ProviderConnectionsContext);
  if (!value) throw new Error("useProviderConnections must be used inside <ProviderConnectionsProvider>");
  return value;
}

function readStoredProvider(): ProviderId {
  const stored = readStorage(ACTIVE_PROVIDER_STORAGE_KEY);
  return stored === "claude" || stored === "gemini" || stored === "ollama" ? stored : "claude";
}

// Storage can be unavailable (private mode, blocked site data) — the choice just isn't remembered then.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
