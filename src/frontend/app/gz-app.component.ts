import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { html } from '../ui/html.ts';
import { currentPath, linkPath, matchRoute, navigate, onRouteChange } from './router.ts';
import { ROUTES } from './routes.ts';
import { toastError } from '../ui/toast.ts';
import './gz-header.component.ts';

/**
 * Application shell: a persistent header and view slot.
 *
 * The shell renders once; route changes only swap the element inside <main>,
 * so the header survives navigation. Toasts live in the document, not here.
 */
class GzAppComponent extends GzElement {
  #unsubscribe: (() => void) | null = null;
  #renderToken = 0;

  constructor() {
    super();
    this.addEventListener('click', (event) => {
      // Links sit in the views' and the header's shadow roots, which retarget event.target to their
      // host by the time the click reaches here; composedPath() still holds the anchor itself.
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.#unsubscribe = onRouteChange(() => {
      this.#renderView();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unsubscribe?.();
  }

  override afterRender(): void {
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
   * Points the view slot at the active route.
   *
   * On a route's first visit its script and stylesheet still have to arrive;
   * until they do, the outgoing view stays put rather than the page going blank.
   */
  #renderView(): void {
    const path = currentPath();

    // Bumped on every entry, not just on a genuine route change: navigate()
    // dispatches popstate for the current path on purpose, so this runs
    // re-entrantly.
    const token = ++this.#renderToken;

    window.scrollTo({ top: 0, behavior: 'instant' });

    void this.#swapView(path, token);
  }

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

  override template(): RawHtml {
    return html`
      <gz-header></gz-header>

      <main class="container"></main>

      <footer class="container">Weights in kilograms · estimated 1RM uses the Epley formula.</footer>
    `;
  }
}

await define('gz-app', GzAppComponent, import.meta.url);
