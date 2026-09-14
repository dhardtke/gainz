import type { RawHtml } from '../ui/base.ts';
import { define, GzElement, html } from '../ui/base.ts';
import { currentTheme, onThemeChange, setTheme } from '../ui/theme.ts';

/** Switch for the colour theme: off is light, on is dark. */
class GzThemeToggle extends GzElement {
  #stopThemeSync: (() => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    // The base class keeps this element's own colours in step; this keeps the
    // switch position in step, so it agrees with a change made anywhere.
    this.#stopThemeSync = onThemeChange(() => {
      this.#syncSwitch();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stopThemeSync?.();
    this.#stopThemeSync = null;
  }

  afterRender(): void {
    this.#syncSwitch();
  }

  /**
   * Sets the position as a property rather than re-rendering: the input has to
   * survive its own click, or a keyboard toggle would destroy the element the
   * user is standing on and drop focus.
   */
  #syncSwitch(): void {
    const input = this.$<HTMLInputElement>('input[role="switch"]');
    if (input) {
      input.checked = currentTheme() === 'dark';
    }
  }

  handleAction(action: string, element: HTMLElement): void {
    if (action === 'toggle-theme' && element instanceof HTMLInputElement) {
      setTheme(element.checked ? 'dark' : 'light');
    }
  }

  template(): RawHtml {
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

await define('gz-theme-toggle', GzThemeToggle, import.meta.url);
