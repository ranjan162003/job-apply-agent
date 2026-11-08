import type { ProviderId } from "../../types/provider.types";

interface ProviderLogoProps {
  providerId: ProviderId;
  size?: number;
}

/** Simple vector marks for each AI provider, drawn on a rounded tile. */
export function ProviderLogo({ providerId, size = 40 }: ProviderLogoProps) {
  return (
    <span
      className={`provider-logo provider-logo--${providerId}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>
        {providerId === "claude" && <ClaudeMark />}
        {providerId === "gemini" && <GeminiMark />}
        {providerId === "ollama" && <OllamaMark />}
      </svg>
    </span>
  );
}

function ClaudeMark() {
  // Radiating starburst.
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <g fill="#ffffff">
      {rays.map((angle, i) => (
        <rect
          key={angle}
          x="11"
          y={i % 2 === 0 ? 1.5 : 3.5}
          width="2"
          height={i % 2 === 0 ? 9.5 : 7.5}
          rx="1"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
    </g>
  );
}

function GeminiMark() {
  return (
    <>
      <defs>
        <linearGradient id="gemini-mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f8df7" />
          <stop offset="55%" stopColor="#9b72f2" />
          <stop offset="100%" stopColor="#d96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5C12 7.3 16.7 12 22.5 12 16.7 12 12 16.7 12 22.5 12 16.7 7.3 12 1.5 12 7.3 12 12 7.3 12 1.5Z"
        fill="url(#gemini-mark-gradient)"
      />
    </>
  );
}

function OllamaMark() {
  // Minimal llama head: two ears, rounded face, eyes and snout.
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 9.5V4.5a1.5 1.5 0 0 1 3 0V8" />
      <path d="M16 9.5V4.5a1.5 1.5 0 0 0-3 0V8" />
      <path d="M6.5 14.5c0-3.2 2.4-6 5.5-6s5.5 2.8 5.5 6v3.5a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3z" />
      <ellipse cx="12" cy="17" rx="2.6" ry="1.9" />
      <circle cx="9.6" cy="13" r="0.5" fill="currentColor" />
      <circle cx="14.4" cy="13" r="0.5" fill="currentColor" />
    </g>
  );
}
