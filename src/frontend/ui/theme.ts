/**
 * Color theme preference: light or dark.
 *
 * The choice is a `data-theme` attribute on `<html>`, which app.css turns into
 * `color-scheme`. Oat colours every token with `light-dark()`, and `color-scheme`
 * inherits into every shadow root, so setting it once on the document is enough.
 */

export type Theme = 'light' | 'dark';

/** Also read by the inline no-flash script in index.html — keep them in sync. */
const STORAGE_KEY = 'gainz:theme';
const EVENT = 'gz-theme-change';

export const THEMES: readonly Theme[] = ['light', 'dark'];

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The system's setting, consulted once to seed a visitor who has never chosen. */
function systemTheme(): Theme {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) {
      return stored;
    }
  } catch {
    // ignore errors
  }
  return systemTheme();
}

let current = readStoredTheme();

export function currentTheme(): Theme {
  return current;
}

function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', current);
}

export function setTheme(theme: Theme): void {
  if (theme === current) {
    return;
  }
  current = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}

  applyTheme();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { theme } }));
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/** @returns call it to stop listening. */
export function onThemeChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener(EVENT, listener);
  };
}

// The inline script has already covered the first paint for a stored choice;
// this pins the attribute down for the unstored case too, where that script
// deliberately leaves it off so Oat's `color-scheme: light dark` paints the first frame.
applyTheme();
