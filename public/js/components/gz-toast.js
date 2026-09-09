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
  static styles = `
    :host {
      position: fixed;
      inset: auto 16px 16px auto;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: min(90vw, 420px);
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong);
      background: var(--surface);
      box-shadow: var(--shadow);
      font-size: 0.92rem;
      animation: slide-in 160ms ease-out;
    }
    .toast.error { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }
    .toast.success { border-color: var(--success); color: var(--success); }
    .toast button { padding: 0 4px; border: none; background: none; color: inherit; font-size: 1.1rem; line-height: 1; }

    @keyframes slide-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast { animation: none; }
    }
  `;

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
