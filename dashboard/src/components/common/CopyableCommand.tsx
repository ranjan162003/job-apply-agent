import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyableCommandProps {
  command: string;
}

/** A terminal command with a one-click copy button. */
export function CopyableCommand({ command }: CopyableCommandProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the command is still visible to select manually.
    }
  };

  return (
    <div className="copyable-command">
      <code>{command}</code>
      <button type="button" className="icon-button icon-button--subtle" onClick={copy} aria-label="Copy command">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
