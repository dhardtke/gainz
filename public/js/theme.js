/**
 * Colour theme preference: follow the system, or force light or dark.
 *
 * Pico themes an element through a `data-theme` attribute, and its rules only
 * reach a shadow root through `:host`. So the choice is mirrored onto the
 * document element *and* onto every component host — base.js does the latter
 * for all of them.
 *
 * The three cases inside a shadow root resolve like this:
 *   no attribute    → `:host(:not([data-theme]))` under the dark media query,
 *                     so the component follows the operating system;
 *   data-theme=light → `:host(:not([data-theme=dark]))` matches, forcing light;
 *   data-theme=dark  → Pico only ships a bare `[data-theme=dark]`, which cannot
 *                     match a host from inside its own shadow root. No rule
 *                     matches, so the colours inherit from the document
 *                     element, which carries the same attribute. Pico's base
 *                     `:host,:root` block sets no colours, so nothing local
 *                     overrides that inheritance.
 */

/** Also read by the inline no-flash script in index.html — keep them in step. */
const STORAGE_KEY = "gainz:theme";
const EVENT = "gz-theme-change";

export const THEMES = ["system", "light", "dark"];

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : "system";
  } catch {
    // Private mode or blocked site data: fall back to following the system.
    return "system";
  }
}

let current = readStoredTheme();

export function currentTheme() {
  return current;
}

/** Mirrors the current choice onto one element (a shadow host, or <html>). */
export function applyThemeTo(element) {
  if (current === "system") element.removeAttribute("data-theme");
  else element.setAttribute("data-theme", current);
}

export function setTheme(theme) {
  if (!THEMES.includes(theme) || theme === current) return;
  current = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Nothing to persist to; the choice still applies for this page.
  }

  applyThemeTo(document.documentElement);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { theme } }));
}

export function onThemeChange(listener) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// The inline script has already done this for the first paint; repeat it so the
// document is correct even if that script was skipped or storage was unreadable.
applyThemeTo(document.documentElement);
