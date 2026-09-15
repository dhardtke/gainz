import { errorMessage } from '../http/errors.ts';
import type { RawHtml } from './html.ts';
import { define, GzElement } from './base.ts';
import { html } from './html.ts';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

const EVENT = 'gz-toast';
let nextId = 0;

declare global {
  interface WindowEventMap {
    'gz-toast': CustomEvent<ToastDetail>;
  }
}

/** Shows a transient message. Any module can call this without a DOM reference. */
export function toast(message: string, kind: ToastKind = 'info'): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

/** Reports a failed API call in the user's terms. */
export function toastError(error: unknown): void {
  toast(errorMessage(error), 'error');
}

class GzToastComponent extends GzElement {
  #items: { id: number; message: string; kind: ToastKind }[] = [];

  #onToast: ((event: WindowEventMap[typeof EVENT]) => void) | null = null;

  override connectedCallback(): void {
    this.#onToast = (event): void => {
      this.#add(event.detail);
    };
    window.addEventListener(EVENT, this.#onToast);
    super.connectedCallback();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.#onToast !== null) {
      window.removeEventListener(EVENT, this.#onToast);
    }
    this.#onToast = null;
  }

  #add({ message, kind }: ToastDetail): void {
    const id = ++nextId;
    this.#items = [...this.#items, { id, message, kind }];
    this.render();
    setTimeout(
      () => {
        this.#dismiss(id);
      },
      kind === 'error' ? 6000 : 3000,
    );
  }

  #dismiss(id: number): void {
    const remaining = this.#items.filter((item) => item.id !== id);
    if (remaining.length === this.#items.length) {
      return;
    }
    this.#items = remaining;
    this.render();
  }

  override handleAction(action: string, element: HTMLElement): void {
    if (action === 'dismiss') {
      this.#dismiss(Number(element.dataset.id));
    }
  }

  override template(): RawHtml {
    return html`
      ${this.#items.map(
        (item) => html`
          <div class="toast ${item.kind}" role="status">
            <span class="grow">${item.message}</span>
            <button type="button" data-action="dismiss" data-id="${item.id}" aria-label="Dismiss">×</button>
          </div>
        `,
      )}
    `;
  }
}

await define('gz-toast', GzToastComponent, import.meta.url);
