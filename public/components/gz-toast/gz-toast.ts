import { errorMessage } from "../../js/api.ts";
import { define, GzElement, html } from "../../js/base.ts";

export type ToastKind = "info" | "success" | "error";

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

const EVENT = "gz-toast";
let nextId = 0;

/** Shows a transient message. Any module can call this without a DOM reference. */
export function toast(message: string, kind: ToastKind = "info"): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

/** Reports a failed API call in the user's terms. */
export function toastError(error: unknown): void {
  toast(errorMessage(error), "error");
}

class GzToast extends GzElement {
  #items: { id: number; message: string; kind: ToastKind }[] = [];

  #onToast: ((event: Event) => void) | null = null;

  connectedCallback(): void {
    this.#onToast = (event) => {
      if (event instanceof CustomEvent) {
        this.#add(event.detail);
      }
    };
    window.addEventListener(EVENT, this.#onToast);
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.#onToast) {
      window.removeEventListener(EVENT, this.#onToast);
    }
    this.#onToast = null;
  }

  #add({ message, kind }: ToastDetail): void {
    const id = ++nextId;
    this.#items = [...this.#items, { id, message, kind }];
    this.render();
    setTimeout(() => this.#dismiss(id), kind === "error" ? 6000 : 3000);
  }

  #dismiss(id: number): void {
    const remaining = this.#items.filter((item) => item.id !== id);
    if (remaining.length === this.#items.length) {
      return;
    }
    this.#items = remaining;
    this.render();
  }

  handleAction(action: string, element: HTMLElement): void {
    if (action === "dismiss") {
      this.#dismiss(Number(element.dataset.id));
    }
  }

  template() {
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

await define("gz-toast", GzToast);
