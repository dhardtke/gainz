import { stylesFor } from "./styles.js";
import { applyThemeTo, onThemeChange } from "./theme.js";

/** Marks a string as already-safe HTML so `html` will not escape it again. */
class RawHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** Wraps pre-rendered markup (usually the output of another `html` call). */
export const raw = (value) => new RawHtml(String(value));

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function interpolate(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join("");
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolated value. Anything a user typed
 * — an exercise name, a set note — is therefore safe to drop straight in.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += interpolate(values[i]) + strings[i + 1];
  return raw(out);
}

/**
 * Base class for every gainz component: an open shadow root styled by Pico,
 * the shared utilities and the element's own stylesheet, a render hook, and
 * click/submit delegation driven by `data-action` attributes.
 *
 * The component's CSS file is found by convention — `<gz-chart>` is styled by
 * `public/css/gz-chart.css` — so a component never carries CSS in JavaScript.
 */
export class GzElement extends HTMLElement {
  #stopThemeSync = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.adoptedStyleSheets = stylesFor(this.localName);

    this.shadowRoot.addEventListener("click", (event) => {
      const target = event.target.closest?.("[data-action]");
      if (target) this.handleAction?.(target.dataset.action, target, event);
    });

    this.shadowRoot.addEventListener("submit", (event) => {
      const form = event.target.closest?.("form[data-action]");
      if (!form) return;
      event.preventDefault();
      this.handleSubmit?.(form.dataset.action, form, event);
    });
  }

  connectedCallback() {
    // Pico only themes a shadow root through :host, so the chosen theme has to
    // be mirrored onto each host rather than set once on <html>.
    applyThemeTo(this);
    this.#stopThemeSync ??= onThemeChange(() => applyThemeTo(this));
    this.render();
  }

  /** Subclasses that override this must call super, or the theme sync leaks. */
  disconnectedCallback() {
    this.#stopThemeSync?.();
    this.#stopThemeSync = null;
  }

  /** Subclasses return the shadow markup for the current state. */
  template() {
    return raw("");
  }

  render() {
    this.shadowRoot.innerHTML = String(this.template());
    this.afterRender?.();
  }

  $(selector) {
    return this.shadowRoot.querySelector(selector);
  }

  $$(selector) {
    return [...this.shadowRoot.querySelectorAll(selector)];
  }

  /** Dispatches a composed custom event so ancestors outside the shadow see it. */
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /** Reads a form's fields as a plain object, trimming text values. */
  formData(form) {
    const values = {};
    for (const [key, value] of new FormData(form).entries()) {
      values[key] = typeof value === "string" ? value.trim() : value;
    }
    return values;
  }
}

/** Registers a custom element, tolerating a repeated module evaluation. */
export function define(name, ctor) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
