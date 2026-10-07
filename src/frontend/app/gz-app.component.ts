import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { GzView, PAGE_TITLE_EVENT } from '../ui/view.ts';
import { html } from '../ui/html.ts';
import { currentPath, linkPath, matchRoute, navigate, onRouteChange } from './router.ts';
import type { RouteDef, RouteMatch } from './router.ts';
import { ROUTES } from './routes.ts';
import { tabTitle } from './tab-title.ts';
import { toastError } from '../ui/toast.ts';
import { UNAUTHORIZED_EVENT } from '../http/errors.ts';
import type { GzBreadcrumbsComponent } from './gz-breadcrumbs.component.ts';
import './gz-breadcrumbs.component.ts';
import './gz-header.component.ts';

const SLOW_VIEW_MS = 300;

// Views live in light DOM (slotted): password managers do not search shadow roots.
class GzAppComponent extends GzElement {
  #unsubscribe: (() => void) | null = null;
  #renderToken = 0;
  #shown: { route: RouteDef | null; view: Element } | null = null;

  readonly #onUnauthorized = (): void => {
    if (currentPath() !== '/login') {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
  };

  constructor() {
    super();
    this.addEventListener('click', (event) => {
      // Shadow roots retarget event.target to the host; composedPath() still holds the anchor.
      const anchor = event.composedPath().find((target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement);
      if (!anchor) {
        return;
      }
      const path = linkPath(event, { href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') }, location.origin);
      if (path === null) {
        return;
      }
      event.preventDefault();
      navigate(path);
    });
    this.addEventListener(PAGE_TITLE_EVENT, (event) => {
      if (event.target === this.#shown?.view) {
        this.#showPage();
      }
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#unsubscribe = onRouteChange(() => {
      this.#renderView();
    });
    window.addEventListener(UNAUTHORIZED_EVENT, this.#onUnauthorized);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unsubscribe?.();
    window.removeEventListener(UNAUTHORIZED_EVENT, this.#onUnauthorized);
  }

  override afterRender(): void {
    this.#renderView();
  }

  async #viewElement(path: string): Promise<{ match: RouteMatch | null; view: Element }> {
    const match = matchRoute(ROUTES, path);
    if (match) {
      return { match, view: await match.route.view(match.params) };
    }

    const view = document.createElement('p');
    view.className = 'empty';
    view.dataset.testid = 'not-found';
    view.textContent = `Nothing lives at ${path}.`;
    return { match, view };
  }

  #renderView(): void {
    // navigate() dispatches popstate for the current path too, so this runs re-entrantly.
    const token = ++this.#renderToken;

    void this.#swapView(currentPath(), token);
  }

  async #swapView(path: string, token: number): Promise<void> {
    let match: RouteMatch | null;
    let view: Element;
    try {
      ({ match, view } = await this.#viewElement(path));
    } catch (cause) {
      toastError(cause);
      return;
    }

    if (token !== this.#renderToken || !this.isConnected) {
      return;
    }

    // A GzView loads once connected, so it is connected hidden and revealed when ready.
    if (view instanceof GzView) {
      view.hidden = true;
      this.append(view);
      const slow = new Promise<void>((resolve) => {
        setTimeout(resolve, SLOW_VIEW_MS);
      });
      await Promise.race([view.ready, slow]);
      if (token !== this.#renderToken || !view.isConnected) {
        view.remove();
        return;
      }
    }

    // Not replaceChildren: moving a connected view would reconnect it, and it would load again.
    for (const child of Array.from(this.children)) {
      if (child !== view) {
        child.remove();
      }
    }
    if (view.parentNode !== this) {
      this.append(view);
    }
    view.removeAttribute('hidden');
    this.#shown = { route: match?.route ?? null, view };
    this.#showPage();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  #showPage(): void {
    if (!this.#shown) {
      return;
    }
    const { route, view } = this.#shown;
    const viewTitle = view instanceof GzView ? view.pageTitle : null;
    const name = route ? (viewTitle ?? route.title ?? null) : 'Not found';
    document.title = tabTitle(name);
    const breadcrumbs = this.$<GzBreadcrumbsComponent>('gz-breadcrumbs');
    if (breadcrumbs) {
      const parents = route?.parents ?? [];
      breadcrumbs.trail = parents.length > 0 ? { parents, current: name ?? '' } : null;
    }
  }

  override template(): RawHtml {
    return html`
      <gz-header data-testid="header"></gz-header>

      <main class="container"><gz-breadcrumbs data-testid="breadcrumbs"></gz-breadcrumbs><slot data-testid="view-slot"></slot></main>
    `;
  }
}

await define('gz-app', GzAppComponent, import.meta.url);
