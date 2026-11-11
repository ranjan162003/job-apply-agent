import type { ProviderId } from "../../types/provider.types";

/** Frontend-only presentation details for each connector. */
export interface ConnectorMetadata {
  vendor: string;
  browserLoginLabel: string;
  browserLoginDescription: string;
  installCommand: string;
  apiKeyUrl?: string;
}

export const CONNECTOR_METADATA: Record<ProviderId, ConnectorMetadata> = {
  claude: {
    vendor: "Anthropic",
    browserLoginLabel: "Sign in with Claude",
    browserLoginDescription: "Opens a sign-in window that launches your browser — log in with your Claude.ai account. Uses your plan, no API billing.",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
  },
  gemini: {
    vendor: "Google",
    browserLoginLabel: "Sign in with Google",
    browserLoginDescription: "Opens a sign-in window that launches Google sign-in in your browser. Free-tier quota on your Google account.",
    installCommand: "npm install -g @google/gemini-cli",
    apiKeyUrl: "https://aistudio.google.com/apikey",
  },
  ollama: {
    vendor: "Runs on this computer",
    browserLoginLabel: "",
    browserLoginDescription: "",
    installCommand: "ollama pull llama3.1",
  },
};
