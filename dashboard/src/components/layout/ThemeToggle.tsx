import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { useThemePreference, type ThemePreference } from "../../hooks/useThemePreference";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Three-way Light / Dark / System switch for the sidebar footer. */
export function ThemeToggle() {
  const [theme, setTheme] = useThemePreference();

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          className={`theme-toggle__option${theme === value ? " theme-toggle__option--selected" : ""}`}
          onClick={() => setTheme(value)}
          title={value === "system" ? "Follow your device setting" : `${label} theme`}
        >
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
