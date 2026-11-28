"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "veytrix.preferences";

export type ThemePreference = "light" | "dark" | "system";

export interface UserPreferences {
  theme: ThemePreference;
  defaultTimeframe: "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1";
  chartBackground: string;
  bullishColor: string;
  bearishColor: string;
  accentColor: string;
  defaultInstrument: string;
  showSma: boolean;
  showEma: boolean;
  showVolume: boolean;
}

const defaults: UserPreferences = {
  theme: "system",
  defaultTimeframe: "H1",
  chartBackground: "#ffffff",
  bullishColor: "#8bd878",
  bearishColor: "#ed7777",
  accentColor: "#c6f36b",
  defaultInstrument: "",
  showSma: false,
  showEma: false,
  showVolume: false,
};

interface ThemeContextValue {
  preferences: UserPreferences;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback;
}

function parsePreferences(stored: string | null): UserPreferences {
  if (!stored) return defaults;
  try {
    const value = JSON.parse(stored) as unknown;
    if (typeof value !== "object" || value === null) return defaults;
    const candidate = value as Partial<UserPreferences>;
    return {
      theme: isThemePreference(candidate.theme)
        ? candidate.theme
        : defaults.theme,
      defaultTimeframe:
        candidate.defaultTimeframe &&
        ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"].includes(
          candidate.defaultTimeframe,
        )
          ? candidate.defaultTimeframe
          : defaults.defaultTimeframe,
      chartBackground: color(candidate.chartBackground, defaults.chartBackground),
      bullishColor: color(candidate.bullishColor, defaults.bullishColor),
      bearishColor: color(candidate.bearishColor, defaults.bearishColor),
      accentColor: color(candidate.accentColor, defaults.accentColor),
      defaultInstrument:
        typeof candidate.defaultInstrument === "string"
          ? candidate.defaultInstrument
          : defaults.defaultInstrument,
      showSma: Boolean(candidate.showSma),
      showEma: Boolean(candidate.showEma),
      showVolume: Boolean(candidate.showVolume),
    };
  } catch {
    return defaults;
  }
}

function readPreferences(): UserPreferences {
  if (typeof window === "undefined") return defaults;
  try {
    return parsePreferences(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaults;
  }
}

function writePreferences(preferences: UserPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* ignore */
  }
}

function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export const themeBootstrapScript = `
(function(){
  try {
    var raw = localStorage.getItem("${STORAGE_KEY}");
    var theme = "system";
    if (raw) {
      var p = JSON.parse(raw);
      if (p && (p.theme === "light" || p.theme === "dark" || p.theme === "system")) theme = p.theme;
    }
    var resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.dataset.theme = resolved;
  } catch (e) {}
})();
`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setPreferences(readPreferences());
    setReady(true);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    writePreferences(preferences);
    const applyTheme = () => {
      document.documentElement.dataset.theme = resolveTheme(preferences.theme);
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferences, ready]);

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo(
    () => ({ preferences, updatePreferences }),
    [preferences, updatePreferences],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function usePreferences(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("usePreferences must be used within ThemeProvider.");
  }
  return context;
}

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
