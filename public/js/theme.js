/**
 * Colour theme preference: light or dark.
 *
 * Pico themes an element through a `data-theme` attribute, and its rules only
 * reach a shadow root through `:host`. So the choice is mirrored onto the
 * document element *and* onto every component host — base.js does the latter
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

/** @typedef {"light" | "dark"} Theme */

/** Also read by the inline no-flash script in index.html — keep them in step. */
const STORAGE_KEY = "gainz:theme";
const EVENT = "gz-theme-change";

/** @type {readonly Theme[]} */
export const THEMES = ["light", "dark"];

/**
 * @param {string | null} value
 * @returns {value is Theme}
 */
function isTheme(value) {
  return value === "light" || value === "dark";
}

/**
 * The system's setting, consulted once to seed a visitor who has never chosen.
 *
 * @returns {Theme}
 */
function systemTheme() {
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** @returns {Theme} */
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
    // Anything else — nothing stored, or the "system" an earlier version wrote
    // — means no choice has been made, so start where the system points.
  } catch {
    // Private mode or blocked site data: nothing was remembered.
  }
  return systemTheme();
}

let current = readStoredTheme();

/** @returns {Theme} */
export function currentTheme() {
  return current;
}

/**
 * Mirrors the current choice onto one element (a shadow host, or <html>).
 *
 * @param {Element} element
 */
export function applyThemeTo(element) {
  element.setAttribute("data-theme", current);
}

/** @param {Theme} theme */
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

/**
 * @param {() => void} listener
 * @returns {() => void} call it to stop listening.
 */
export function onThemeChange(listener) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// The inline script has already covered the first paint for a stored choice;
// this pins the attribute down for the unstored case too, where that script
// deliberately leaves it off and lets Pico's media query paint the first frame.
applyThemeTo(document.documentElement);
