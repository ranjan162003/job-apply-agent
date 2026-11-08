import { useEffect, useState } from "react";

/** The theme actually showing: the user's pick (html[data-theme]) or, for "System", the OS setting. */
export function useColorScheme(): "light" | "dark" {
  const read = () => {
    const picked = document.documentElement.dataset.theme;
    if (picked === "light" || picked === "dark") return picked;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const [scheme, setScheme] = useState<"light" | "dark">(read);

  useEffect(() => {
    const update = () => setScheme(read());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return scheme;
}
