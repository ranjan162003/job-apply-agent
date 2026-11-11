import { useCallback, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

// Keep in sync with the pre-paint script in index.html.
const THEME_STORAGE_KEY = "apply-copilot:theme";

/** Light, dark, or follow the OS. Applied as `<html data-theme>`, which global.css reads. */
export function useThemePreference(): [ThemePreference, (theme: ThemePreference) => void] {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const current = document.documentElement.dataset.theme;
    return current === "light" || current === "dark" ? current : "system";
  });

  const setTheme = useCallback((next: ThemePreference) => {
    applyTheme(next);
    setThemeState(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the tab closes.
    }
  }, []);

  return [theme, setTheme];
}

export function applyTheme(theme: ThemePreference): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
