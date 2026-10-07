import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { html } from '../ui/html.ts';
import { currentPath, isActive, navigate, onRouteChange } from './router.ts';
import { ROUTES } from './routes.ts';
import { toastError } from '../ui/toast.ts';
import { authFacade } from '../features/auth/auth.facade.ts';
import './gz-theme-toggle.component.ts';

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
    this.$('nav')?.classList.toggle('auth', authFacade.enabled());
    // Oat focuses the first item on open; this listener is registered after Oat's, so it wins.
    this.$<HTMLElement>('menu[popover]')?.addEventListener('toggle', (event) => {
      if (event.newState === 'open') {
        this.$<HTMLAnchorElement>('menu a[aria-current="page"]')?.focus();
      }
    });
  }

  // Canceled here, before gz-app routes the link, so the session ends before the login page opens.
  override async handleAction(action: string, _element: HTMLElement, event: Event): Promise<void> {
    if (action !== 'logout') {
      return;
    }
    event.preventDefault();
    try {
      await authFacade.logout();
    } catch (error) {
      toastError(error);
      return;
    }
    navigate('/login');
  }

  #syncLinks(): void {
    this.$('nav')?.classList.toggle('login', /^\/login\/?$/.test(currentPath()));
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
        <nav class="container" data-testid="nav">
          <a class="brand" href="/">
            <img src="/icons/icon.svg" alt="" />
            <strong>gainz</strong>
          </a>
          <ul class="links unstyled" data-testid="links">
            ${navItems.map((item) => html`<li><a href="${item.path}" data-path="${item.path}">${item.label}</a></li>`)}
            <li class="logout"><a href="/login" data-action="logout" data-testid="links-logout">Log out</a></li>
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
            <menu popover id="nav-menu" data-testid="menu">
              ${navItems.map((item) => html`<a role="menuitem" href="${item.path}" data-path="${item.path}">${item.label}</a>`)}
              <a role="menuitem" class="logout" href="/login" data-action="logout" data-testid="menu-logout">Log out</a>
            </menu>
          </ot-dropdown>
          <gz-theme-toggle></gz-theme-toggle>
        </nav>
      </header>
    `;
  }
}

await define('gz-header', GzHeaderComponent, import.meta.url);
