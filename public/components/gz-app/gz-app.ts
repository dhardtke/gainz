import type { RawHtml } from "../../js/base.ts";
import { define, GzElement, html } from "../../js/base.ts";
import type { Route, ViewName } from "../../js/router.ts";
import { currentRoute, isActive, onRouteChange } from "../../js/router.ts";
import { toastError } from "../gz-toast/gz-toast.ts";
import "../gz-theme-toggle/gz-theme-toggle.ts";

const NAV = [
  { path: "/", label: "Dashboard" },
  { path: "/workouts", label: "Workouts" },
  { path: "/exercises", label: "Exercises" },
];

/**
 * The view for each route, fetched the first time that route is opened.
 *
 * The specifiers are written out in full so they stay statically analysable;
 * only the call is deferred. A view statically imports whatever it renders
 * inside itself — the set row, the chart, the stat tiles — and every component
 * awaits its own stylesheet before defining itself, so awaiting one of these
 * means the whole page is ready, scripts and CSS alike, before it goes on
 * screen.
 */
const VIEWS: Record<ViewName, () => Promise<unknown>> = {
  dashboard: () => import("../gz-dashboard/gz-dashboard.ts"),
  workouts: () => import("../gz-workout-list/gz-workout-list.ts"),
  workout: () => import("../gz-workout-detail/gz-workout-detail.ts"),
  exercises: () => import("../gz-exercise-list/gz-exercise-list.ts"),
  exercise: () => import("../gz-exercise-detail/gz-exercise-detail.ts"),
};

/**
 * Application shell: a persistent header plus a view slot.
 *
 * The shell renders once; route changes only swap the element inside <main>,
 * so the header and the toast stack survive navigation.
 */
class GzApp extends GzElement {
  #unsubscribe: (() => void) | null = null;
  #renderToken = 0;

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
  async #viewElement(route: Route): Promise<Element> {
    if (route.name !== "notfound") {
      await VIEWS[route.name]();
    }

    switch (route.name) {
      case "dashboard":
        return document.createElement("gz-dashboard");

      case "workouts":
        return document.createElement("gz-workout-list");

      case "workout": {
        const view = document.createElement("gz-workout-detail");
        view.setAttribute("workout-id", route.params.id ?? "");
        return view;
      }

      case "exercises":
        return document.createElement("gz-exercise-list");

      case "exercise": {
        const view = document.createElement("gz-exercise-detail");
        view.setAttribute("exercise-id", route.params.id ?? "");
        return view;
      }

      // Listed rather than left to a default, so adding a route to the union is
      // a compile error here until this method knows how to build its view.
      case "notfound": {
        const view = document.createElement("p");
        view.className = "empty";
        view.textContent = `Nothing lives at ${route.path}.`;
        return view;
      }
    }

    // Unreachable: every ViewName is handled above, which is the point of
    // listing them. Spelled out because flow analysis stops at the switch and
    // asks what happens if none of the cases matched.
    throw new Error("Unhandled route");
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
    const route = currentRoute();

    // Bumped on every entry, not just on a genuine route change: navigate()
    // re-dispatches hashchange for the current path on purpose, so this runs
    // re-entrantly.
    const token = ++this.#renderToken;

    // aria-current marks the active page for assistive tech, and gz-app.css
    // keys the solid button off it — one attribute does both jobs.
    const links = this.$$<HTMLAnchorElement>("nav a[data-path]");
    for (const link of links) {
      const active = isActive(link.dataset.path ?? "");
      link.classList.toggle("outline", !active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" });

    void this.#swapView(route, token);
  }

  /** Nothing awaits this, so it has to own its failures. */
  async #swapView(route: Route, token: number): Promise<void> {
    let view: Element;
    try {
      view = await this.#viewElement(route);
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
    const main = this.$("main");
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
              <a class="brand" href="#/"><strong>gainz</strong><span class="tag">lifting log</span></a>
            </li>
          </ul>
          <ul>
            ${NAV.map(
              (item) => html`
                <li>
                  <a role="button" class="secondary outline" href="#${item.path}" data-path="${item.path}">${item.label}</a>
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

await define("gz-app", GzApp);
