import { define, GzElement, html } from "../../js/base.js";
import { currentTheme, onThemeChange, setTheme } from "../../js/theme.js";

/** Switch for the colour theme: off is light, on is dark. */
class GzThemeToggle extends GzElement {
  /** @type {(() => void) | null} */
  #stopThemeSync = null;

  connectedCallback() {
    super.connectedCallback();
    // The base class keeps this element's own colours in step; this keeps the
    // switch position in step, so it agrees with a change made anywhere.
    this.#stopThemeSync = onThemeChange(() => this.#syncSwitch());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopThemeSync?.();
    this.#stopThemeSync = null;
  }

  afterRender() {
    this.#syncSwitch();
  }

  /**
   * Sets the position as a property rather than re-rendering: the input has to
   * survive its own click, or a keyboard toggle would destroy the element the
   * user is standing on and drop focus.
   */
  #syncSwitch() {
    /** @type {HTMLInputElement | null} */
    const input = this.$('input[role="switch"]');
    if (input) input.checked = currentTheme() === "dark";
  }

  /**
   * @param {string} action
   * @param {HTMLElement} element
   */
  handleAction(action, element) {
    if (action === "toggle-theme" && element instanceof HTMLInputElement) {
      setTheme(element.checked ? "dark" : "light");
    }
  }

  template() {
    // The aria-label duplicates the visible text on purpose: the text is hidden
    // on a narrow header, and the switch still has to announce itself there.
    return html`
      <label>
        <input type="checkbox" role="switch" data-action="toggle-theme" aria-label="Dark mode" />
        <span class="label">Dark mode</span>
      </label>
    `;
  }
}

await define("gz-theme-toggle", GzThemeToggle);
