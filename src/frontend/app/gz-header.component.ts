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
    // Oat focuses, and so highlights, the first item when the menu opens. Its listener is
    // registered first (oat.js defines ot-dropdown before any module runs, so the dropdown
    // initializes as the template is inserted), so this one runs after it and moves focus on to
    // the current page.
    this.$<HTMLElement>('menu[popover]')?.addEventListener('toggle', (event) => {
      if (event.newState === 'open') {
        this.$<HTMLAnchorElement>('menu a[aria-current="page"]')?.focus();
      }
    });
  }

  /** Marks the current page in both link lists, and closes the menu after a navigation from it. */
  #syncLinks(): void {
    const links = this.$$<HTMLAnchorElement>('nav a[data-path]');
    for (const link of links) {
      if (isActive(link.dataset.path ?? '')) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    const menu = this.$<HTMLElement>('menu[popover]');
    if (menu?.matches(':popover-open') === true) {
      menu.hidePopover();
    }
  }

  override template(): RawHtml {
    const navItems = ROUTES.flatMap((route) => (route.nav ? [route.nav] : []));
    return html`
      <header>
        <nav class="container">
          <a class="brand" href="/"><strong>gainz</strong><span class="tag">lifting log</span></a>
          <ul class="links unstyled">
            ${navItems.map((item) => html`<li><a href="${item.path}" data-path="${item.path}">${item.label}</a></li>`)}
          </ul>
          <ot-dropdown class="menu">
            <button type="button" class="ghost icon" popovertarget="nav-menu" aria-label="Menu">
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
            </button>
            <menu popover id="nav-menu">
              ${navItems.map((item) => html`<a role="menuitem" href="${item.path}" data-path="${item.path}">${item.label}</a>`)}
            </menu>
          </ot-dropdown>
          <gz-theme-toggle></gz-theme-toggle>
        </nav>
      </header>
    `;
  }
}

await define('gz-header', GzHeaderComponent, import.meta.url);
