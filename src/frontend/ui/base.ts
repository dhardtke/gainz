import { raw } from './html.ts';
import type { RawHtml } from './html.ts';
import { loadStyles, stylesFor } from './styles.ts';
import { applyThemeTo, onThemeChange } from './theme.ts';

/**
 * Base class for every gainz component: an open shadow root styled by Pico,
 * the shared utilities and the element's own stylesheet, a render hook, and
 * click/submit delegation driven by `data-action` attributes.
 *
 * The component's CSS file sits next to its module and is found from the
 * module's URL — `ui/gz-tile.component.ts` is styled by `ui/gz-tile.component.css` — so a
 * component never carries CSS in JavaScript.
 */
export class GzElement extends HTMLElement {
  #stopThemeSync: (() => void) | null = null;

  /**
   * The shadow root, kept here rather than read back from `this.shadowRoot`,
   * which the DOM types leave nullable for the life of the element.
   */
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.adoptedStyleSheets = stylesFor(this.localName);

    this.#root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
      if (target instanceof HTMLElement && target.dataset.action) {
        void this.handleAction(target.dataset.action, target, event);
      }
    });

    this.#root.addEventListener('submit', (event) => {
      const form = event.target instanceof Element ? event.target.closest('form[data-action]') : null;
      if (!(form instanceof HTMLFormElement) || !form.dataset.action) {
        return;
      }
      event.preventDefault();
      void this.handleSubmit(form.dataset.action, form, event);
    });
  }

  /** The component's shadow root. Non-null from the constructor onward. */
  get root(): ShadowRoot {
    return this.#root;
  }

  connectedCallback(): void {
    // Pico only themes a shadow root through :host, so the chosen theme has to
    // be mirrored onto each host rather than set once on <html>.
    applyThemeTo(this);
    this.#stopThemeSync ??= onThemeChange(() => {
      applyThemeTo(this);
    });
    this.render();
  }

  /** Subclasses that override this must call super, or the theme sync leaks. */
  disconnectedCallback(): void {
    this.#stopThemeSync?.();
    this.#stopThemeSync = null;
  }

  /** Subclasses return the shadow markup for the current state. */
  template(): RawHtml {
    return raw('');
  }

  render(): void {
    this.#root.innerHTML = String(this.template());
    this.afterRender();
  }

  /**
   * Called after every render, for the wiring markup cannot express: handing a
   * child component its data, or putting focus somewhere. A no-op here, like
   * the two handlers below — the base class calls them, subclasses fill them in.
   */
  afterRender(): void {}

  /**
   * Handles a click on an element carrying `data-action`.
   *
   * @param _element the element the attribute sits on.
   */
  handleAction(_action: string, _element: HTMLElement, _event: Event): void | Promise<void> {}

  /**
   * Handles a submit of a form carrying `data-action`. The default has already
   * been prevented by the time this runs.
   */
  handleSubmit(_action: string, _form: HTMLFormElement, _event: Event): void | Promise<void> {}

  // The type parameter appears once on purpose: it is the same convenience
  // querySelector itself offers, letting a caller name the element type it
  // knows its own markup produces. Proving it instead would mean an instanceof
  // check at every call site, two of them against custom element classes that
  // would have to be imported for the check alone.
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
  $<T extends Element = Element>(selector: string): T | null {
    return this.#root.querySelector<T>(selector);
  }

  $$<T extends Element = Element>(selector: string): T[] {
    return Array.from(this.#root.querySelectorAll<T>(selector));
  }

  /** Dispatches a composed custom event so ancestors outside the shadow see it. */
  emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /**
   * Reads a form's fields as a plain object, trimming text values. Only text
   * fields are kept — the app has no file inputs, and a caller that asked for
   * one would want to reach for `FormData` directly anyway.
   */
  formData(form: HTMLFormElement): Record<string, string> {
    const values: Record<string, string> = {};
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === 'string') {
        values[key] = value.trim();
      }
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
 */
export async function define(name: string, ctor: CustomElementConstructor, moduleUrl: string): Promise<void> {
  if (customElements.get(name)) {
    return;
  }
  await loadStyles(name, moduleUrl);
  if (!customElements.get(name)) {
    customElements.define(name, ctor);
  }
}
