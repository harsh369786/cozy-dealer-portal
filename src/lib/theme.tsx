import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeKey = "gold" | "neutral" | "fresh";

export const THEMES: { key: ThemeKey; name: string; note: string; swatch: string[] }[] = [
  {
    key: "gold",
    name: "Premium Gold",
    note: "Black + gold, luxury",
    swatch: ["#141210", "#c9a227", "#e6cf8a", "#f7f3ea"],
  },
  {
    key: "neutral",
    name: "Warm Neutral",
    note: "Cream, beige, soft gold",
    swatch: ["#f7f1e6", "#e3d6c2", "#8a6c4f", "#c9a227"],
  },
  {
    key: "fresh",
    name: "Modern Fresh",
    note: "Yellow, black, white",
    swatch: ["#ffffff", "#f5c518", "#1a1a1a", "#f2f2f0"],
  },
];

const ThemeContext = createContext<{ theme: ThemeKey; setTheme: (t: ThemeKey) => void }>({
  theme: "gold",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>("gold");

  useEffect(() => {
    const stored = localStorage.getItem("backrest-theme") as ThemeKey | null;
    if (stored) setThemeState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeKey) => {
    setThemeState(t);
    localStorage.setItem("backrest-theme", t);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
