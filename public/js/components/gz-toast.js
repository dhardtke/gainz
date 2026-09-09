import { define, GzElement, html } from "../base.js";

const EVENT = "gz-toast";
let nextId = 0;

/** Shows a transient message. Any module can call this without a DOM reference. */
export function toast(message, kind = "info") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

/** Reports a failed API call in the user's terms. */
export function toastError(error) {
  toast(error?.message ?? String(error), "error");
}

class GzToast extends GzElement {
  #items = [];

  connectedCallback() {
    this.onToast = (event) => this.#add(event.detail);
    window.addEventListener(EVENT, this.onToast);
    super.connectedCallback();
  }

  disconnectedCallback() {
    window.removeEventListener(EVENT, this.onToast);
  }

  #add({ message, kind }) {
    const id = ++nextId;
    this.#items = [...this.#items, { id, message, kind }];
    this.render();
    setTimeout(() => this.#dismiss(id), kind === "error" ? 6000 : 3000);
  }

  #dismiss(id) {
    const remaining = this.#items.filter((item) => item.id !== id);
    if (remaining.length === this.#items.length) return;
    this.#items = remaining;
    this.render();
  }

  handleAction(action, element) {
    if (action === "dismiss") this.#dismiss(Number(element.dataset.id));
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

define("gz-toast", GzToast);
