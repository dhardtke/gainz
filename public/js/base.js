import { loadStyles, stylesFor } from "./styles.js";
import { applyThemeTo, onThemeChange } from "./theme.js";

/** Marks a string as already-safe HTML so `html` will not escape it again. */
class RawHtml {
  /** @param {string} value */
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/**
 * Wraps pre-rendered markup (usually the output of another `html` call).
 *
 * @param {unknown} value
 * @returns {RawHtml}
 */
export const raw = (value) => new RawHtml(String(value));

/** @type {Record<string, string>} */
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function interpolate(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join("");
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolated value. Anything a user typed
 * — an exercise name, a set note — is therefore safe to drop straight in.
 *
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {RawHtml}
 */
export function html(strings, ...values) {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) out += interpolate(values[i]) + (strings[i + 1] ?? "");
  return raw(out);
}

/**
 * Base class for every gainz component: an open shadow root styled by Pico,
 * the shared utilities and the element's own stylesheet, a render hook, and
 * click/submit delegation driven by `data-action` attributes.
 *
 * The component's CSS file sits next to its module and is found by convention —
 * `<gz-chart>` is styled by `public/components/gz-chart/gz-chart.css` — so a
 * component never carries CSS in JavaScript.
 */
export class GzElement extends HTMLElement {
  /** @type {(() => void) | null} */
  #stopThemeSync = null;

  /**
   * The shadow root, kept here rather than read back from `this.shadowRoot`,
   * which the DOM types leave nullable for the life of the element.
   *
   * @type {ShadowRoot}
   */
  #root;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#root.adoptedStyleSheets = stylesFor(this.localName);

    this.#root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
      if (target instanceof HTMLElement && target.dataset.action) {
        this.handleAction(target.dataset.action, target, event);
      }
    });

    this.#root.addEventListener("submit", (event) => {
      const form = event.target instanceof Element ? event.target.closest("form[data-action]") : null;
      if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
      event.preventDefault();
      this.handleSubmit(form.dataset.action, form, event);
    });
  }

  /** The component's shadow root. Non-null from the constructor onward. */
  get root() {
    return this.#root;
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
    this.#root.innerHTML = String(this.template());
    this.afterRender();
  }

  /**
   * Called after every render, for the wiring markup cannot express: handing a
   * child component its data, or putting focus somewhere. A no-op here, like
   * the two handlers below — the base class calls them, subclasses fill them in.
   */
  afterRender() {}

  /**
   * Handles a click on an element carrying `data-action`.
   *
   * @param {string} _action
   * @param {HTMLElement} _element the element the attribute sits on.
   * @param {Event} _event
   * @returns {void | Promise<void>}
   */
  handleAction(_action, _element, _event) {}

  /**
   * Handles a submit of a form carrying `data-action`. The default has already
   * been prevented by the time this runs.
   *
   * @param {string} _action
   * @param {HTMLFormElement} _form
   * @param {Event} _event
   * @returns {void | Promise<void>}
   */
  handleSubmit(_action, _form, _event) {}

  /**
   * @template {Element} [T=Element]
   * @param {string} selector
   * @returns {T | null}
   */
  $(selector) {
    return this.#root.querySelector(selector);
  }

  /**
   * @template {Element} [T=Element]
   * @param {string} selector
   * @returns {T[]}
   */
  $$(selector) {
    return Array.from(this.#root.querySelectorAll(selector));
  }

  /**
   * Dispatches a composed custom event so ancestors outside the shadow see it.
   *
   * @param {string} name
   * @param {unknown} [detail]
   */
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /**
   * Reads a form's fields as a plain object, trimming text values. Only text
   * fields are kept — the app has no file inputs, and a caller that asked for
   * one would want to reach for `FormData` directly anyway.
   *
   * @param {HTMLFormElement} form
   * @returns {Record<string, string>}
   */
  formData(form) {
    /** @type {Record<string, string>} */
    const values = {};
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string") values[key] = value.trim();
    }
    return values;
  }
}

/**
 * Registers a custom element once its stylesheet is in hand, tolerating a
 * repeated module evaluation.
 *
 * Components await this at module scope, which is what makes "this module has
 * loaded" also mean "its CSS is ready" for everything that imports it — so a
 * route can be fetched on demand and still be styled on its first paint.
 * Registering only after the sheet is cached is also what lets `stylesFor` stay
 * synchronous, as the constructor needs it to be.
 *
 * @param {string} name
 * @param {CustomElementConstructor} ctor
 * @returns {Promise<void>}
 */
export async function define(name, ctor) {
  if (customElements.get(name)) return;
  await loadStyles(name);
  if (!customElements.get(name)) customElements.define(name, ctor);
}
