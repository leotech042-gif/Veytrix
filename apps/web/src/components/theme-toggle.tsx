"use client";

import { usePreferences } from "./theme-provider";

export function ThemeToggle() {
  const { updatePreferences } = usePreferences();

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label="Toggle light and dark themes"
      title="Toggle light and dark themes"
      onClick={() =>
        updatePreferences({
          theme:
            document.documentElement.dataset.theme === "dark" ? "light" : "dark",
        })
      }
    >
      <span aria-hidden="true">◐</span>
    </button>
  );
}
