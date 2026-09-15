import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { html } from '../ui/html.ts';
import { isActive, onRouteChange } from './router.ts';
import { ROUTES } from './routes.ts';
import './gz-theme-toggle.component.ts';

/** Sticky page header: brand, page links (a dropdown on narrow screens) and the theme toggle. */
class GzHeaderComponent extends GzElement {
  #unsubscribe: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#unsubscribe = onRouteChange(() => {
      this.#syncLinks();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  override afterRender(): void {
    this.#syncLinks();
  }

  #syncLinks(): void {
    // Pico's nav hides the underline its aria-current styling relies on, so the
    // current page also swaps secondary for contrast to stand out.
    const links = this.$$<HTMLAnchorElement>('nav a[data-path]');
    for (const link of links) {
      const active = isActive(link.dataset.path ?? '');
      link.classList.toggle('contrast', active);
      link.classList.toggle('secondary', !active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    const menu = this.$<HTMLDetailsElement>('details.dropdown');
    if (menu) {
      menu.open = false;
    }
  }

  override template(): RawHtml {
    const navItems = ROUTES.flatMap((route) => (route.nav ? [route.nav] : []));
    return html`
      <header>
        <nav class="container">
          <ul>
            <li>
              <a class="brand" href="/"><strong>gainz</strong><span class="tag">lifting log</span></a>
            </li>
          </ul>
          <ul class="links">
            ${navItems.map((item) => html`<li><a class="secondary" href="${item.path}" data-path="${item.path}">${item.label}</a></li>`)}
          </ul>
          <ul class="menu">
            <li>
              <details class="dropdown">
                <summary aria-label="Menu">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </summary>
                <ul dir="rtl">
                  ${navItems.map((item) => html`<li><a class="secondary" href="${item.path}" data-path="${item.path}">${item.label}</a></li>`)}
                </ul>
              </details>
            </li>
          </ul>
          <ul class="icons">
            <li><gz-theme-toggle></gz-theme-toggle></li>
          </ul>
        </nav>
      </header>
    `;
  }
}

await define('gz-header', GzHeaderComponent, import.meta.url);
