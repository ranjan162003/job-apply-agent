import type { ProviderStatus } from "../../types/provider.types";

const AUTH_METHOD_LABELS: Record<string, string> = {
  cli_login: "Account login",
  api_key: "API key",
  local_server: "Local server",
};

interface ConnectorStatusBadgeProps {
  status: ProviderStatus;
  isWaitingForLogin?: boolean;
}

export function ConnectorStatusBadge({ status, isWaitingForLogin = false }: ConnectorStatusBadgeProps) {
  if (status.is_ready) {
    return (
      <span className="badge badge--good">
        <span className="badge__dot" aria-hidden="true" />
        Connected · {AUTH_METHOD_LABELS[status.active_auth_method ?? ""] ?? ""}
      </span>
    );
  }
  if (isWaitingForLogin) {
    return (
      <span className="badge badge--pending">
        <span className="badge__dot" aria-hidden="true" />
        Waiting for sign-in…
      </span>
    );
  }
  return (
    <span className="badge badge--neutral">
      <span className="badge__dot" aria-hidden="true" />
      Not connected
    </span>
  );
}
