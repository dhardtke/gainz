import { errorMessage } from "../../js/api.js";
import { define, GzElement, html } from "../../js/base.js";

/** @typedef {"info" | "success" | "error"} ToastKind */

/** @typedef {{ message: string, kind: ToastKind }} ToastDetail */

const EVENT = "gz-toast";
let nextId = 0;

/**
 * Shows a transient message. Any module can call this without a DOM reference.
 *
 * @param {string} message
 * @param {ToastKind} [kind]
 */
export function toast(message, kind = "info") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

/**
 * Reports a failed API call in the user's terms.
 *
 * @param {unknown} error
 */
export function toastError(error) {
  toast(errorMessage(error), "error");
}

class GzToast extends GzElement {
  /** @type {{ id: number, message: string, kind: ToastKind }[]} */
  #items = [];

  /** @type {((event: Event) => void) | null} */
  #onToast = null;

  connectedCallback() {
    this.#onToast = (event) => {
      if (event instanceof CustomEvent) this.#add(event.detail);
    };
    window.addEventListener(EVENT, this.#onToast);
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#onToast) window.removeEventListener(EVENT, this.#onToast);
    this.#onToast = null;
  }

  /** @param {ToastDetail} detail */
  #add({ message, kind }) {
    const id = ++nextId;
    this.#items = [...this.#items, { id, message, kind }];
    this.render();
    setTimeout(() => this.#dismiss(id), kind === "error" ? 6000 : 3000);
  }

  /** @param {number} id */
  #dismiss(id) {
    const remaining = this.#items.filter((item) => item.id !== id);
    if (remaining.length === this.#items.length) return;
    this.#items = remaining;
    this.render();
  }

  /**
   * @param {string} action
   * @param {HTMLElement} element
   */
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

await define("gz-toast", GzToast);
