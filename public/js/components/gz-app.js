import { define, GzElement, html } from "../base.js";
import { currentRoute, isActive, onRouteChange } from "../router.js";
import "./gz-toast.js";
import "./gz-theme-toggle.js";
import "./gz-dashboard.js";
import "./gz-workout-list.js";
import "./gz-workout-detail.js";
import "./gz-exercise-list.js";
import "./gz-exercise-detail.js";

const NAV = [
  { path: "/", label: "Dashboard" },
  { path: "/workouts", label: "Workouts" },
  { path: "/exercises", label: "Exercises" },
];

/**
 * Application shell: a persistent header plus a view slot.
 *
 * The shell renders once; route changes only swap the element inside <main>,
 * so the header and the toast stack survive navigation.
 */
class GzApp extends GzElement {
  #unsubscribe = null;

  connectedCallback() {
    super.connectedCallback();
    this.#unsubscribe = onRouteChange(() => this.#renderView());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#unsubscribe?.();
  }

  afterRender() {
    this.#renderView();
  }

  /** Builds the element for the active route. */
  #viewElement(route) {
    switch (route.name) {
      case "dashboard":
        return document.createElement("gz-dashboard");

      case "workouts":
        return document.createElement("gz-workout-list");

      case "workout": {
        const view = document.createElement("gz-workout-detail");
        view.setAttribute("workout-id", route.params.id);
        return view;
      }

      case "exercises":
        return document.createElement("gz-exercise-list");

      case "exercise": {
        const view = document.createElement("gz-exercise-detail");
        view.setAttribute("exercise-id", route.params.id);
        return view;
      }

      default: {
        const view = document.createElement("p");
        view.className = "empty";
        view.textContent = `Nothing lives at ${route.path}.`;
        return view;
      }
    }
  }

  #renderView() {
    const route = currentRoute();
    this.$("main")?.replaceChildren(this.#viewElement(route));

    // The active page is a solid Pico button and the rest are outlined ones,
    // which is a change of variant rather than of colour: dropping .outline
    // swaps one stock Pico button for another, so no stylesheet has to know.
    for (const link of this.$$("nav a[data-path]")) {
      const active = isActive(link.dataset.path);
      link.classList.toggle("outline", !active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  template() {
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

      <footer class="container">
        Weights in kilograms · estimated 1RM uses the Epley formula.
      </footer>

      <gz-toast></gz-toast>
    `;
  }
}

define("gz-app", GzApp);
