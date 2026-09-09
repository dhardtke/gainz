import { define, GzElement, html } from "../base.js";
import { currentTheme, onThemeChange, setTheme, THEMES } from "../theme.js";

const LABELS = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

const TITLES = {
  system: "Follow the operating system's colour scheme",
  light: "Always use the light theme",
  dark: "Always use the dark theme",
};

/** Segmented control for the colour theme: Auto, Light or Dark. */
class GzThemeToggle extends GzElement {
  #stopThemeSync = null;

  connectedCallback() {
    super.connectedCallback();
    // The base class keeps this element's own colours in step; this redraw is
    // for the pressed state, so the control agrees with a change made anywhere.
    this.#stopThemeSync = onThemeChange(() => this.render());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopThemeSync?.();
    this.#stopThemeSync = null;
  }

  handleAction(action, element) {
    if (action === "set-theme") setTheme(element.dataset.theme);
  }

  template() {
    const active = currentTheme();
    return html`
      <div role="group" aria-label="Colour theme">
        ${THEMES.map(
          (theme) => html`
            <button
              class="secondary outline"
              data-action="set-theme"
              data-theme="${theme}"
              aria-pressed="${theme === active}"
              title="${TITLES[theme]}"
            >
              ${LABELS[theme]}
            </button>
          `,
        )}
      </div>
    `;
  }
}

define("gz-theme-toggle", GzThemeToggle);
