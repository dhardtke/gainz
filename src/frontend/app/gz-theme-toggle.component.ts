import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { html } from '../ui/html.ts';
import { currentTheme, onThemeChange, toggleTheme } from '../ui/theme.ts';

/** Icon button for the color theme: a sun in light mode, a moon in dark mode. */
class GzThemeToggleComponent extends GzElement {
  #stopThemeSync: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    // Keeps the icon and label in sync, so they agree with a change made anywhere.
    this.#stopThemeSync = onThemeChange(() => {
      this.#syncIcon();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stopThemeSync?.();
    this.#stopThemeSync = null;
  }

  /**
   * Updates the icon and label in place rather than re-rendering: the button has
   * to survive its own click, or a keyboard toggle would destroy the element the
   * user is standing on and drop focus.
   */
  #syncIcon(): void {
    const dark = currentTheme() === 'dark';
    this.$('svg.icon-theme-toggle')?.classList.toggle('moon', dark);
    this.$('button.theme-toggle')?.setAttribute('aria-label', dark ? 'Turn off dark mode' : 'Turn on dark mode');
  }

  override handleAction(action: string): void {
    if (action === 'toggle-theme') {
      toggleTheme();
    }
  }

  override template(): RawHtml {
    const dark = currentTheme() === 'dark';
    return html`
      <button type="button" class="theme-toggle icon" data-action="toggle-theme" aria-label="${dark ? 'Turn off dark mode' : 'Turn on dark mode'}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" class="icon-theme-toggle ${dark ? 'moon' : ''}">
          <clipPath id="theme-toggle-cutout"><path d="M0-11h25a1 1 0 0017 13v30H0Z" /></clipPath>
          <g clip-path="url(#theme-toggle-cutout)">
            <circle cx="16" cy="16" r="8.4" />
            <path
              d="M18.3 3.2c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3S14.7.9 16 .9s2.3 1 2.3 2.3zm-4.6 25.6c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3-1 2.3-2.3 2.3-2.3-1-2.3-2.3zm15.1-10.5c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zM3.2 13.7c1.3 0 2.3 1 2.3 2.3s-1 2.3-2.3 2.3S.9 17.3.9 16s1-2.3 2.3-2.3zm5.8-7C9 7.9 7.9 9 6.7 9S4.4 8 4.4 6.7s1-2.3 2.3-2.3S9 5.4 9 6.7zm16.3 21c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zm2.4-21c0 1.3-1 2.3-2.3 2.3S23 7.9 23 6.7s1-2.3 2.3-2.3 2.4 1 2.4 2.3zM6.7 23C8 23 9 24 9 25.3s-1 2.3-2.3 2.3-2.3-1-2.3-2.3 1-2.3 2.3-2.3z"
            />
          </g>
        </svg>
      </button>
    `;
  }
}

await define('gz-theme-toggle', GzThemeToggleComponent, import.meta.url);
