import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { GzView } from '../ui/view.ts';
import { html } from '../ui/html.ts';
import { currentPath, linkPath, matchRoute, navigate, onRouteChange } from './router.ts';
import { ROUTES } from './routes.ts';
import { toastError } from '../ui/toast.ts';
import { UNAUTHORIZED_EVENT } from '../http/errors.ts';
import './gz-header.component.ts';

/** How long the outgoing view waits for the incoming one's data before giving way to its loading state. */
const SLOW_VIEW_MS = 300;

/**
 * Application shell: a persistent header and view slot.
 *
 * The shell renders once; route changes only swap the view, so the header survives navigation.
 * Toasts live in the document, not here.
 *
 * The view is the shell's own child, in the document's light DOM, and shows through a <slot> in
 * <main>. Password managers search the document, not shadow roots, so the login form, which gz-login
 * keeps in its own light DOM for that reason, must not end up inside the shell's shadow root either.
 *
 * Any API call answered 401 sends the user to the login page, remembering where they were.
 */
class GzAppComponent extends GzElement {
  #unsubscribe: (() => void) | null = null;
  #renderToken = 0;

  readonly #onUnauthorized = (): void => {
    if (currentPath() !== '/login') {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
  };

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
   * The outgoing view stays put until the incoming one has its script, its
   * stylesheet and its data, rather than the page going blank or collapsing to
   * a "Loading…" line for a frame or two.
   */
  #renderView(): void {
    // Bumped on every entry, not just on a genuine route change: navigate()
    // dispatches popstate for the current path on purpose, so this runs
    // re-entrantly.
    const token = ++this.#renderToken;

    void this.#swapView(currentPath(), token);
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
    if (token !== this.#renderToken || !this.isConnected) {
      return;
    }

    // A GzView fetches its data once connected, so it is connected hidden, beside
    // the outgoing one, and shown when ready. A slow API still gets its loading
    // state after a moment rather than a navigation that seems to do nothing.
    // Anything else, such as the not-found line, is swapped in straight away.
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
    // A copy: `children` is live, and removing from it while iterating skips elements.
    for (const child of Array.from(this.children)) {
      if (child !== view) {
        child.remove();
      }
    }
    if (view.parentNode !== this) {
      this.append(view);
    }
    view.removeAttribute('hidden');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  override template(): RawHtml {
    return html`
      <gz-header></gz-header>

      <main class="container"><slot></slot></main>
    `;
  }
}

await define('gz-app', GzAppComponent, import.meta.url);
