import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatBodyWeight, formatDate, formatShortDate, UNIT } from '../../../ui/format.ts';
import type { WeighInDto } from '../../../../shared/dto/weight.ts';
import { toast, toastError } from '../../../ui/toast.ts';
import { confirmAction } from '../../../ui/confirm/confirm.ts';
import { weighInFacade } from '../weight.facade.ts';

export const WEIGH_IN_SAVED_EVENT = 'weigh-in-saved';
export const WEIGH_IN_DELETED_EVENT = 'weigh-in-deleted';

export interface FocusedField {
  name: string;
  value: string;
}

export class GzWeighInRowComponent extends GzElement {
  #weighIn: WeighInDto | null = null;

  // Serialized, so an Enter and the change it commits save once.
  #pending: Promise<void> = Promise.resolve();

  set weighIn(value: WeighInDto | undefined) {
    this.#weighIn = value ?? null;
    if (this.isConnected) {
      this.render();
    }
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

  #enqueue(request: () => Promise<void>): Promise<void> {
    this.#pending = this.#pending.then(request);
    return this.#pending;
  }

  override handleAction(action: string): Promise<void> {
    return this.#enqueue(async () => {
      if (action === 'delete') {
        await this.#delete();
      }
    });
  }

  async #delete(): Promise<void> {
    const weighIn = this.#weighIn;
    if (!weighIn) {
      return;
    }
    const message = `${formatShortDate(weighIn.measuredOn)} · ${formatBodyWeight(weighIn.weight)}`;
    if (!(await confirmAction({ title: 'Delete weigh-in?', message, confirmLabel: 'Delete', danger: true }))) {
      return;
    }
    try {
      await weighInFacade.delete(weighIn.measuredOn);
      toast('Weigh-in deleted', 'success');
      this.emit(WEIGH_IN_DELETED_EVENT, weighIn.measuredOn);
    } catch (error) {
      toastError(error);
    }
  }

  async #save(form: HTMLFormElement): Promise<void> {
    const weighIn = this.#weighIn;
    if (!weighIn || !form.reportValidity()) {
      return;
    }
    const weight = Number(this.formData(form).weight);
    if (weight === weighIn.weight) {
      return;
    }
    try {
      this.#weighIn = await weighInFacade.put(weighIn.measuredOn, { weight });
      this.emit(WEIGH_IN_SAVED_EVENT, this.#weighIn);
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    const form = this.$<HTMLFormElement>('form');
    form?.addEventListener('change', () => {
      void this.#enqueue(() => this.#save(form));
    });
    form?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        void this.#enqueue(() => this.#save(form));
      }
    });
  }

  override template(): RawHtml {
    const weighIn = this.#weighIn;
    if (!weighIn) {
      return html``;
    }
    const id = `weight-${weighIn.measuredOn}`;
    return html`
      <form class="row" data-testid="row">
        <span class="date" data-testid="date">${formatDate(weighIn.measuredOn)}</span>
        <fieldset class="group">
          <input
            id="${id}"
            name="weight"
            type="number"
            step="any"
            min="20"
            max="500"
            value="${weighIn.weight}"
            aria-label="Weight"
            required
            data-testid="weight"
          />
          <label for="${id}">${UNIT}</label>
        </fieldset>
        <button type="button" class="ghost" data-action="delete" data-testid="delete" aria-label="Delete ${formatShortDate(weighIn.measuredOn)}'s weigh-in">
          ×
        </button>
      </form>
    `;
  }
}

await define('gz-weigh-in-row', GzWeighInRowComponent, import.meta.url);
