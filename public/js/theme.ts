/**
 * Colour theme preference: light or dark.
 *
 * Pico themes an element through a `data-theme` attribute, and its rules only
 * reach a shadow root through `:host`. So the choice is mirrored onto the
 * document element *and* onto every component host — base.ts does the latter
 * for all of them.
 *
 * The two cases inside a shadow root resolve like this:
 *   data-theme=light → `:host(:not([data-theme=dark]))` matches, forcing light;
 *   data-theme=dark  → Pico only ships a bare `[data-theme=dark]`, which cannot
 *                     match a host from inside its own shadow root. No rule
 *                     matches, so the colours inherit from the document
 *                     element, which carries the same attribute. Pico's base
 *                     `:host,:root` block sets no colours, so nothing local
 *                     overrides that inheritance.
 */

export type Theme = "light" | "dark";

/** Also read by the inline no-flash script in index.html — keep them in step. */
const STORAGE_KEY = "gainz:theme";
const EVENT = "gz-theme-change";

export const THEMES: readonly Theme[] = ["light", "dark"];

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

/** The system's setting, consulted once to seed a visitor who has never chosen. */
function systemTheme(): Theme {
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) {
      return stored;
    }
    // Anything else — nothing stored, or the "system" an earlier version wrote
    // — means no choice has been made, so start where the system points.
  } catch {
    // Private mode or blocked site data: nothing was remembered.
  }
  return systemTheme();
}

let current = readStoredTheme();

export function currentTheme(): Theme {
  return current;
}

/** Mirrors the current choice onto one element (a shadow host, or <html>). */
export function applyThemeTo(element: Element): void {
  element.setAttribute("data-theme", current);
}

export function setTheme(theme: Theme): void {
  if (!THEMES.includes(theme) || theme === current) {
    return;
  }
  current = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Nothing to persist to; the choice still applies for this page.
  }

  applyThemeTo(document.documentElement);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { theme } }));
}

/** @returns call it to stop listening. */
export function onThemeChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// The inline script has already covered the first paint for a stored choice;
// this pins the attribute down for the unstored case too, where that script
// deliberately leaves it off and lets Pico's media query paint the first frame.
applyThemeTo(document.documentElement);
