import { ApiError, errorMessage } from '../http/errors.ts';
import { GzElement } from './base.ts';
import { html } from './html.ts';
import type { RawHtml } from './html.ts';
import { toastError } from './toast.ts';

export type ViewState<Data> = { status: 'loading' } | { status: 'ready'; data: Data } | { status: 'error'; message: string };

/**
 * Base class for a route view: an element that fetches its own data when connected,
 * shows `loadingText` until it arrives, then `readyTemplate()` or `errorTemplate()`.
 */
export abstract class GzView<Data> extends GzElement {
  /**
   * Settles once the view shows its content rather than a loading state.
   * gz-app keeps the outgoing view on screen until the incoming one is ready, so a
   * page switch does not flash a "Loading…" line. Replaced by the first `reload()`
   * on connect, which never rejects.
   */
  ready: Promise<void> = Promise.resolve();

  #state: ViewState<Data> = { status: 'loading' };

  loadingText = 'Loading…';

  /** Where an error offers to go instead, shown below the message; none by default. */
  backLink: { href: string; label: string } | null = null;

  /** The loaded data, or undefined while loading or after an error. */
  get data(): Data | undefined {
    return this.#state.status === 'ready' ? this.#state.data : undefined;
  }

  abstract load(): Promise<Data>;

  abstract readyTemplate(data: Data): RawHtml;

  errorTemplate(message: string): RawHtml {
    if (!this.backLink) {
      return html`<p class="error-text" data-testid="error">${message}</p>`;
    }
    return html`
      <div class="vstack">
        <p class="error-text" data-testid="error">${message}</p>
        <p><a href="${this.backLink.href}" data-testid="back-link">${this.backLink.label}</a></p>
      </div>
    `;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.ready = this.reload();
  }

  /**
   * Loads and renders; never rejects. The last state stays on screen until the load
   * settles. An error is shown and toasted, except a 404, which the view says itself.
   */
  async reload(): Promise<void> {
    try {
      this.#state = { status: 'ready', data: await this.load() };
    } catch (error) {
      this.#state = { status: 'error', message: errorMessage(error) };
      if (!(error instanceof ApiError) || error.status !== 404) {
        toastError(error);
      }
    }
    this.render();
  }

  override template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true" data-testid="loading">${this.loadingText}</p>`;
    }
    if (this.#state.status === 'error') {
      return this.errorTemplate(this.#state.message);
    }
    return this.readyTemplate(this.#state.data);
  }

  /**
   * A numeric attribute its route set before connecting the view. Routes match ids as
   * `(\d+)`, so the conversion cannot produce a NaN.
   *
   * @throws {Error} when the attribute is missing.
   */
  numericAttribute(name: string): number {
    const value = this.getAttribute(name);
    if (value === null) {
      throw new Error(`${this.localName} needs a ${name} attribute`);
    }
    return Number(value);
  }
}
