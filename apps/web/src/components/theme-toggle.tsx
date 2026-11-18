"use client";

import { usePreferences } from "./theme-provider";

export function ThemeToggle() {
  const { preferences, updatePreferences } = usePreferences();

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label="Toggle theme"
      title="Toggle theme"
      onClick={() => {
        const current =
          preferences.theme === "system"
            ? document.documentElement.dataset.theme === "dark"
              ? "dark"
              : "light"
            : preferences.theme;
        updatePreferences({ theme: current === "dark" ? "light" : "dark" });
      }}
    >
      <span aria-hidden="true">◐</span>
    </button>
  );
}
