import { GzElement } from './base.ts';

export interface FocusedField {
  name: string;
  value: string;
}

export abstract class GzEditableRow extends GzElement {
  // Serialized, so an Enter and the change it commits save once, and a blur save lands before the click that caused it.
  #pending: Promise<void> = Promise.resolve();

  abstract save(form: HTMLFormElement): Promise<void>;

  enqueue(request: () => Promise<void>): Promise<void> {
    this.#pending = this.#pending.then(request);
    return this.#pending;
  }

  focusedField(): FocusedField | null {
    const input = this.root.activeElement;
    return input instanceof HTMLInputElement && input.name ? { name: input.name, value: input.value } : null;
  }

  restoreField({ name, value }: FocusedField): void {
    const input = this.$<HTMLInputElement>(`input[name='${name}']`);
    if (input) {
      input.value = value;
      input.focus();
    }
  }

  override afterRender(): void {
    const form = this.$<HTMLFormElement>('form');
    form?.addEventListener('change', () => {
      void this.enqueue(() => this.save(form));
    });
    // A form without a submit button ignores Enter.
    form?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        void this.enqueue(() => this.save(form));
      }
    });
  }
}

// The returned function restores the focus in the row that replaced it, matched by `data-<key>`.
export function keepRowFocus(root: ShadowRoot, key: string): () => boolean {
  const row = root.activeElement instanceof GzEditableRow ? root.activeElement : null;
  const field = row?.focusedField() ?? null;
  return () => {
    if (!row || !field) {
      return false;
    }
    root.querySelector<GzEditableRow>(`${row.localName}[data-${key}='${row.dataset[key] ?? ''}']`)?.restoreField(field);
    return true;
  };
}
