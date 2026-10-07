import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatNumber, formatVolume, UNIT } from '../../../ui/format.ts';
import type { EditSetDto, LiftSetDto } from '../../../../shared/dto/set.ts';
import { toast, toastError } from '../../../ui/toast.ts';
import { setFacade } from '../workouts.facade.ts';

export interface FocusedField {
  name: string;
  value: string;
}

export class GzSetRowComponent extends GzElement {
  #set: LiftSetDto | null = null;

  #index = 0;

  // Serialized: a blur save must land before the click that caused it marks the set done.
  #pending: Promise<void> = Promise.resolve();

  set set(value: LiftSetDto | undefined) {
    this.#set = value ?? null;
    if (this.isConnected) {
      this.render();
    }
  }

  set index(value: number) {
    // The parent reads this off a data attribute, so a NaN is a real possibility.
    this.#index = Number.isFinite(value) ? value : 0;
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
    return this.#enqueue(() => this.#run(action));
  }

  async #run(action: string): Promise<void> {
    const set = this.#set;
    if (!set) {
      return;
    }

    if (action === 'toggle-done') {
      try {
        await setFacade.update(set.id, { done: !set.done });
        this.emit('sets-changed');
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === 'duplicate') {
      try {
        await setFacade.create(set.workoutId, {
          exerciseId: set.exerciseId,
          reps: set.reps,
          weight: set.weight,
          notes: set.notes,
        });
        this.emit('sets-changed');
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Delete this set (${formatNumber(set.weight)} ${UNIT} × ${set.reps})?`)) {
        return;
      }
      try {
        await setFacade.delete(set.id);
        toast('Set deleted', 'success');
        this.emit('sets-changed');
      } catch (error) {
        toastError(error);
      }
    }
  }

  async #save(form: HTMLFormElement): Promise<void> {
    const set = this.#set;
    if (!set || !form.reportValidity()) {
      return;
    }
    const values = this.formData(form);
    const changes: EditSetDto = {};
    if (Number(values.reps) !== set.reps) {
      changes.reps = Number(values.reps);
    }
    if (Number(values.weight) !== set.weight) {
      changes.weight = Number(values.weight);
    }
    if ((values.notes ?? '') !== (set.notes ?? '')) {
      changes.notes = values.notes;
    }
    if (Object.keys(changes).length === 0) {
      return;
    }
    try {
      await setFacade.update(set.id, changes);
      this.#set = { ...set, ...changes };
      this.emit('sets-changed');
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    const form = this.$<HTMLFormElement>('form');
    form?.addEventListener('change', () => {
      void this.#enqueue(() => this.#save(form));
    });
    // A multi-field form without a submit button ignores Enter.
    form?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        void this.#enqueue(() => this.#save(form));
      }
    });
  }

  #toggleTemplate(set: LiftSetDto): RawHtml {
    return html`
      <button
        type="button"
        class="${set.done ? '' : 'outline'} toggle"
        data-action="toggle-done"
        data-testid="toggle-done"
        aria-pressed="${set.done ? 'true' : 'false'}"
        aria-label="${set.done ? 'Mark set as not done' : 'Mark set as done'}"
      >
        ✓
      </button>
    `;
  }

  override template(): RawHtml {
    const set = this.#set;
    if (!set) {
      return html``;
    }
    const disabled = set.done ? 'disabled' : '';

    return html`
      <form class="row-view ${set.done ? 'done' : ''}" data-testid="row">
        ${this.#toggleTemplate(set)}
        <span class="index">${this.#index}</span>
        <span class="load">
          <fieldset class="group">
            <input
              id="weight"
              name="weight"
              type="number"
              step="any"
              min="0"
              value="${set.weight}"
              aria-label="Weight"
              required
              data-testid="weight"
              ${disabled}
            />
            <label for="weight">${UNIT}</label>
          </fieldset>
          <span aria-hidden="true">×</span>
          <fieldset class="group">
            <input id="reps" name="reps" type="number" step="1" min="1" value="${set.reps}" aria-label="Reps" required data-testid="reps" ${disabled} />
            <label for="reps">reps</label>
          </fieldset>
        </span>
        <input
          class="note"
          name="notes"
          type="text"
          maxlength="2000"
          value="${set.notes ?? ''}"
          placeholder="Notes"
          aria-label="Notes"
          data-testid="notes"
          ${disabled}
        />
        <div class="actions">
          <span class="volume mono">${formatVolume(set.weight * set.reps)}</span>
          <button type="button" class="outline" data-action="duplicate" data-testid="duplicate" title="Log another set just like this one">+1</button>
          <button type="button" data-variant="danger" data-action="delete" data-testid="delete" aria-label="Delete set" ${disabled}>×</button>
        </div>
      </form>
    `;
  }
}

await define('gz-set-row', GzSetRowComponent, import.meta.url);
