import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "stormwatch-theme"
const DEFAULT_THEME: Theme = "light"

type ThemeContextValue = {
  theme: Theme
  /** Alias kept for the map primitives, which expect next-themes' shape. */
  resolvedTheme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Reads the stored preference. The OS `prefers-color-scheme` is deliberately
 * ignored: StormWatch is light-first and only switches when asked to. The same
 * key is read by the inline script in index.html to avoid a theme flash.
 */
function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Storage blocked — the theme still applies for this session.
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])
  const toggleTheme = useCallback(
    () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
    []
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    // Map primitives may render before the provider in isolation/tests.
    return {
      theme: DEFAULT_THEME,
      resolvedTheme: DEFAULT_THEME,
      setTheme: () => {},
      toggleTheme: () => {},
    }
  }
  return context
}
