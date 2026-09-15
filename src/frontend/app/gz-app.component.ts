import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { html } from '../ui/html.ts';
import { currentPath, isActive, linkPath, matchRoute, navigate, onRouteChange } from './router.ts';
import { ROUTES } from './routes.ts';
import { toastError } from '../ui/gz-toast.component.ts';
import './gz-theme-toggle.component.ts';

/**
 * Application shell: a persistent header plus a view slot.
 *
 * The shell renders once; route changes only swap the element inside <main>,
 * so the header and the toast stack survive navigation.
 */
class GzAppComponent extends GzElement {
  #unsubscribe: (() => void) | null = null;
  #renderToken = 0;

  constructor() {
    super();
    this.addEventListener('click', (event) => {
      // Links sit in the views' shadow roots, which retarget event.target to the view's host by the
      // time the click reaches here; composedPath() still holds the anchor itself.
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
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#unsubscribe = onRouteChange(() => {
      this.#renderView();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unsubscribe?.();
  }

  afterRender(): void {
    this.#renderView();
  }

  /** Builds the element for a route, fetching its module first if need be. */
  async #viewElement(path: string): Promise<Element> {
    const match = matchRoute(ROUTES, path);
    if (match) {
      return match.route.view(match.params);
    }

    const view = document.createElement('p');
    view.className = 'empty';
    view.textContent = `Nothing lives at ${path}.`;
    return view;
  }

  /**
   * Points the shell at the active route.
   *
   * The header is updated synchronously so a click is answered at once, and the
   * view follows when it is ready. On a route's first visit its script and
   * stylesheet still have to arrive; until they do, the outgoing view stays put
   * rather than the page going blank.
   */
  #renderView(): void {
    const path = currentPath();

    // Bumped on every entry, not just on a genuine route change: navigate()
    // dispatches popstate for the current path on purpose, so this runs
    // re-entrantly.
    const token = ++this.#renderToken;

    // aria-current marks the active page for assistive tech, and gz-app.component.css
    // keys the solid button off it — one attribute does both jobs.
    const links = this.$$<HTMLAnchorElement>('nav a[data-path]');
    for (const link of links) {
      const active = isActive(link.dataset.path ?? '');
      link.classList.toggle('outline', !active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });

    void this.#swapView(path, token);
  }

  /** Nothing awaits this, so it has to own its failures. */
  async #swapView(path: string, token: number): Promise<void> {
    let view: Element;
    try {
      view = await this.#viewElement(path);
    } catch (cause) {
      // Offline, or a deploy moved the file: keep what is on screen and say so,
      // rather than leaving a nav button that looks dead.
      toastError(cause);
      return;
    }

    // A newer route change started while this one was loading; that one wins.
    if (token !== this.#renderToken) {
      return;
    }

    // Re-queried after the await: replaceChildren on a stale node is silent.
    const main = this.$('main');
    if (main?.isConnected === true) {
      main.replaceChildren(view);
    }
  }

  template(): RawHtml {
    return html`
      <header>
        <nav class="container">
          <ul>
            <li>
              <a class="brand" href="/"><strong>gainz</strong><span class="tag">lifting log</span></a>
            </li>
          </ul>
          <ul>
            ${ROUTES.flatMap((route) => (route.nav ? [route.nav] : [])).map(
              (item) => html`
                <li>
                  <a role="button" class="secondary outline" href="${item.path}" data-path="${item.path}">${item.label}</a>
                </li>
              `,
            )}
            <li><gz-theme-toggle></gz-theme-toggle></li>
          </ul>
        </nav>
      </header>

      <main class="container"></main>

      <footer class="container">Weights in kilograms · estimated 1RM uses the Epley formula.</footer>

      <gz-toast></gz-toast>
    `;
  }
}

await define('gz-app', GzAppComponent, import.meta.url);
