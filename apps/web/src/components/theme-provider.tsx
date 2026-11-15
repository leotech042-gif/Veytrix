"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

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

const STORAGE_KEY = "veytrix.preferences.v1";

const defaults: UserPreferences = {
  theme: "system",
  defaultTimeframe: "H1",
  chartBackground: "#0e141d",
  bullishColor: "#8bd878",
  bearishColor: "#ed7777",
  accentColor: "#72d6ce",
  defaultInstrument: "EURUSD",
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

function parsePreferences(stored: string | null): UserPreferences {
  if (!stored) return defaults;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null) return defaults;

    const candidate = value as Partial<UserPreferences>;
    const color = (value: string | undefined, fallback: string) =>
      typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
        ? value
        : fallback;
    return {
      theme: isThemePreference(candidate.theme)
        ? candidate.theme
        : defaults.theme,
      defaultTimeframe:
        candidate.defaultTimeframe && [
          "M1",
          "M5",
          "M15",
          "M30",
          "H1",
          "H4",
          "D1",
          "W1",
        ].includes(candidate.defaultTimeframe)
          ? candidate.defaultTimeframe
          : defaults.defaultTimeframe,
      chartBackground: color(
        candidate.chartBackground,
        defaults.chartBackground,
      ),
      bullishColor: color(candidate.bullishColor, defaults.bullishColor),
      bearishColor: color(candidate.bearishColor, defaults.bearishColor),
      accentColor: color(candidate.accentColor === "#c6f36b" ? undefined : candidate.accentColor, defaults.accentColor),
      defaultInstrument:
        typeof candidate.defaultInstrument === "string" &&
        candidate.defaultInstrument.trim().length > 0 &&
        candidate.defaultInstrument.length <= 40
          ? candidate.defaultInstrument.trim().toUpperCase()
          : defaults.defaultInstrument,
      showSma:
        typeof candidate.showSma === "boolean"
          ? candidate.showSma
          : defaults.showSma,
      showEma:
        typeof candidate.showEma === "boolean"
          ? candidate.showEma
          : defaults.showEma,
      showVolume:
        typeof candidate.showVolume === "boolean"
          ? candidate.showVolume
          : defaults.showVolume,
    };
  } catch (error) {
    console.warn("Unable to read saved Veytrix preferences.", error);
    return defaults;
  }
}

function readPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parsePreferences(raw);
  } catch (error) {
    console.warn("Unable to read saved Veytrix preferences.", error);
    return defaults;
  }
}

function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setPreferences(readPreferences());
      setReady(true);
    }, 0);
    const handleStorage = () => {
      if (active) setPreferences(readPreferences());
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = resolveTheme(preferences.theme);
    };

    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferences.theme]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.style.setProperty("--accent", preferences.accentColor);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn("Unable to save Veytrix preferences.", error);
    }
  }, [preferences, ready]);

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      setPreferences((current) => ({ ...current, ...patch }));
    },
    [],
  );

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
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

export const themeBootstrapScript = `try {
  const saved = localStorage.getItem("${STORAGE_KEY}");
  const prefs = saved ? JSON.parse(saved) : null;
  const theme = prefs && ["light", "dark", "system"].includes(prefs.theme) ? prefs.theme : "system";
  document.documentElement.dataset.theme = theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
} catch (error) {
  console.warn("Unable to apply saved Veytrix theme.", error);
}`;
