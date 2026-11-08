import { useCallback, useEffect, useRef, useState } from "react";

import { providerApi } from "../api/providerApi";
import type { ProviderId, ProviderStatus } from "../types/provider.types";

const LOGIN_POLL_INTERVAL_MS = 4000;
const LOGIN_POLL_TIMEOUT_MS = 3 * 60 * 1000;

/** Loads every provider's connection status and keeps it fresh after auth changes. */
export function useProviderStatuses() {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingProviderId, setPollingProviderId] = useState<ProviderId | null>(null);
  const pollTimer = useRef<number | null>(null);

  const replaceStatus = useCallback((updated: ProviderStatus) => {
    setStatuses((current) => current.map((s) => (s.provider_id === updated.provider_id ? updated : s)));
  }, []);

  const reloadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setStatuses(await providerApi.listStatuses());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshOne = useCallback(
    async (providerId: ProviderId) => {
      const updated = await providerApi.getStatus(providerId);
      replaceStatus(updated);
      return updated;
    },
    [replaceStatus],
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) window.clearInterval(pollTimer.current);
    pollTimer.current = null;
    setPollingProviderId(null);
  }, []);

  /** After a browser login starts, re-check status until it connects (or we give up). */
  const pollUntilReady = useCallback(
    (providerId: ProviderId) => {
      stopPolling();
      setPollingProviderId(providerId);
      const startedAt = Date.now();
      pollTimer.current = window.setInterval(async () => {
        try {
          const updated = await refreshOne(providerId);
          if (updated.is_ready || Date.now() - startedAt > LOGIN_POLL_TIMEOUT_MS) stopPolling();
        } catch {
          stopPolling();
        }
      }, LOGIN_POLL_INTERVAL_MS);
    },
    [refreshOne, stopPolling],
  );

  useEffect(() => {
    void reloadAll();
    return stopPolling;
  }, [reloadAll, stopPolling]);

  return { statuses, isLoading, error, reloadAll, refreshOne, replaceStatus, pollUntilReady, pollingProviderId };
}
