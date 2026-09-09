import { define, GzElement, html } from "../base.js";
import { currentRoute, isActive, onRouteChange } from "../router.js";
import "./gz-toast.js";
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
  static styles = `
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
    }
    .bar {
      max-width: 1040px;
      margin: 0 auto;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .brand:hover { text-decoration: none; }
    .brand .dot { color: var(--accent); }
    .brand .tag { font-size: 0.78rem; font-weight: 500; color: var(--text-muted); letter-spacing: 0; }

    nav { display: flex; gap: 4px; }
    nav a {
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-weight: 550;
      font-size: 0.95rem;
    }
    nav a:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
    nav a.active { background: var(--accent-soft); color: var(--accent); }

    main {
      max-width: 1040px;
      margin: 0 auto;
      padding: 24px 20px 64px;
    }

    footer {
      max-width: 1040px;
      margin: 0 auto;
      padding: 0 20px 32px;
      color: var(--text-muted);
      font-size: 0.82rem;
    }

    @media (max-width: 560px) {
      .bar { padding: 10px 14px; gap: 10px; }
      main { padding: 16px 14px 48px; }
      .brand .tag { display: none; }
    }
  `;

  #unsubscribe = null;

  connectedCallback() {
    super.connectedCallback();
    this.#unsubscribe = onRouteChange(() => this.#renderView());
  }

  disconnectedCallback() {
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
        const view = document.createElement("div");
        view.className = "empty";
        view.textContent = `Nothing lives at ${route.path}.`;
        return view;
      }
    }
  }

  #renderView() {
    const route = currentRoute();
    this.$("main")?.replaceChildren(this.#viewElement(route));

    for (const link of this.$$("nav a")) {
      link.classList.toggle("active", isActive(link.dataset.path));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  template() {
    return html`
      <header>
        <div class="bar">
          <a class="brand" href="#/">gainz<span class="dot">.</span><span class="tag">lifting log</span></a>
          <nav>
            ${NAV.map(
              (item) => html`<a href="#${item.path}" data-path="${item.path}">${item.label}</a>`,
            )}
          </nav>
        </div>
      </header>
      <main></main>
      <footer>Weights in kilograms · estimated 1RM uses the Epley formula.</footer>
      <gz-toast></gz-toast>
    `;
  }
}

define("gz-app", GzApp);
