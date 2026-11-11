import type { LoginStartResponse, ProviderId, ProviderStatus } from "../types/provider.types";
import { requestJson } from "./httpClient";

export const providerApi = {
  listStatuses: () => requestJson<ProviderStatus[]>("/api/providers"),

  getStatus: (providerId: ProviderId) => requestJson<ProviderStatus>(`/api/providers/${providerId}`),

  startBrowserLogin: (providerId: ProviderId) =>
    requestJson<LoginStartResponse>(`/api/providers/${providerId}/login`, { method: "POST" }),

  saveApiKey: (providerId: ProviderId, apiKey: string) =>
    requestJson<ProviderStatus>(`/api/providers/${providerId}/api-key`, {
      method: "PUT",
      body: JSON.stringify({ api_key: apiKey }),
    }),

  removeApiKey: (providerId: ProviderId) =>
    requestJson<ProviderStatus>(`/api/providers/${providerId}/api-key`, { method: "DELETE" }),
};
