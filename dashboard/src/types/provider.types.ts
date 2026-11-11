// Mirrors backend/app/schemas/provider_schemas.py

export type ProviderId = "claude" | "gemini" | "ollama";

export type AuthMethod = "cli_login" | "api_key" | "local_server";

export interface ProviderStatus {
  provider_id: ProviderId;
  display_name: string;
  description: string;
  supports_cli_login: boolean;
  supports_api_key: boolean;
  cli_installed: boolean;
  cli_logged_in: boolean;
  api_key_saved: boolean;
  local_server_running: boolean;
  is_ready: boolean;
  active_auth_method: AuthMethod | null;
  available_models: string[];
  default_model: string;
  status_message: string;
  setup_hint: string | null;
}

export interface LoginStartResponse {
  started: boolean;
  message: string;
}

/** The model to use for a request, as the API expects it. */
export interface AgentChoice {
  provider_id: ProviderId;
  model_name: string | null;
}
