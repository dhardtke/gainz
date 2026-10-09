import type { RawHtml } from '../html.ts';
import { define, GzElement } from '../base.ts';
import { html } from '../html.ts';

// Not bubbling, unlike `emit()`: only confirmAction() listens, on the host.
export const CONFIRM_CLOSED_EVENT = 'confirm-closed';

export interface ConfirmOptions {
  title: string;
  message?: string;
  items?: string[];
  confirmLabel: string;
  danger?: boolean;
}

export class GzConfirmDialogComponent extends GzElement {
  options: ConfirmOptions | undefined;

  override handleAction(action: string): void {
    const dialog = this.$<HTMLDialogElement>('dialog');
    if (action === 'confirm') {
      dialog?.close('confirm');
    } else if (action === 'cancel') {
      dialog?.close();
    }
  }

  override afterRender(): void {
    const dialog = this.$<HTMLDialogElement>('dialog');
    if (!dialog) {
      return;
    }
    // Oat's touch shim listens on `document`, where this shadow root's clicks name the host instead.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });
    dialog.addEventListener('close', () => {
      this.dispatchEvent(new CustomEvent(CONFIRM_CLOSED_EVENT, { detail: dialog.returnValue === 'confirm' }));
      this.remove();
    });
    dialog.showModal();
  }

  override template(): RawHtml {
    if (!this.options) {
      return html``;
    }
    const { title, message, items, confirmLabel, danger = false } = this.options;
    return html`
      <dialog aria-labelledby="title" ${message ? html`aria-describedby="message"` : ''} data-testid="dialog">
        <header>
          <h2 id="title" data-testid="title">${title}</h2>
          ${message ? html`<p id="message" data-testid="message">${message}</p>` : ''}
        </header>
        ${
          items && items.length > 0
            ? html`<div>
                <ul data-testid="items">
                  ${items.map((item) => html`<li>${item}</li>`)}
                </ul>
              </div>`
            : ''
        }
        <footer>
          <button class="outline" data-action="cancel" data-testid="cancel" ${danger ? 'autofocus' : ''}>Cancel</button>
          <button ${danger ? html`data-variant="danger"` : ''} data-action="confirm" data-testid="confirm" ${danger ? '' : 'autofocus'}>${confirmLabel}</button>
        </footer>
      </dialog>
    `;
  }
}

await define('gz-confirm-dialog', GzConfirmDialogComponent, import.meta.url);
