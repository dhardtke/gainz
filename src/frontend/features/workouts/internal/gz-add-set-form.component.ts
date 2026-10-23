import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatKilograms, formatNumber, formatShortDate, formatWeight, plural, UNIT } from '../../../ui/format.ts';
import type { ExerciseLastSessionDto, ExerciseWithStatsDto, LastSessionDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseKind } from '../../../../shared/exercise-kind.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import { toastError } from '../../../ui/toast.ts';
import { exerciseFacade } from '../../exercises/exercises.facade.ts';
import { setFacade } from '../workouts.facade.ts';

// Lookups skip the open workout, so nothing on its page makes them stale.
export class LastSessionCache {
  readonly resolved = new Map<ExerciseId, ExerciseLastSessionDto>();

  readonly #pending = new Map<ExerciseId, Promise<ExerciseLastSessionDto>>();

  lookup(exerciseId: ExerciseId, workoutId: WorkoutId): Promise<ExerciseLastSessionDto> {
    let pending = this.#pending.get(exerciseId);
    if (!pending) {
      pending = exerciseFacade.lastSession(exerciseId, workoutId).then(
        (found) => {
          this.resolved.set(exerciseId, found);
          this.#pending.delete(exerciseId);
          return found;
        },
        (error: unknown) => {
          this.#pending.delete(exerciseId);
          throw error;
        },
      );
      this.#pending.set(exerciseId, pending);
    }
    return pending;
  }
}

function weightLabel(kind: ExerciseKind): string {
  return kind === 'assisted' ? `Assistance (${UNIT})` : `Weight (${UNIT})`;
}

export class GzAddSetFormComponent extends GzElement {
  #workoutId: WorkoutId | null = null;

  #exercises: ExerciseWithStatsDto[] = [];

  #lastSessions = new LastSessionCache();

  #sets: LiftSetDto[] | null = null;

  // Read by template(), so the button stays disabled through a re-render.
  #adding = false;

  // What was typed since the last logged set; the view hands it to the form that replaces this one.
  #draft: Record<string, string> | null = null;

  get draft(): Record<string, string> | null {
    return this.#draft;
  }

  set draft(value: Record<string, string> | null) {
    this.#draft = value;
  }

  set workoutId(value: WorkoutId) {
    this.#workoutId = value;
  }

  set exercises(value: ExerciseWithStatsDto[]) {
    this.#exercises = value;
  }

  set lastSessions(value: LastSessionCache) {
    this.#lastSessions = value;
  }

  // Set it last: assigning it re-renders.
  set sets(value: LiftSetDto[]) {
    this.#sets = value;
    if (this.isConnected) {
      this.render();
    }
  }

  // For a change to sets already in the workout, which leaves what is typed alone.
  updateSets(value: LiftSetDto[]): void {
    this.#sets = value;
  }

  focusReps(): void {
    this.$<HTMLInputElement>("input[name='reps']")?.focus();
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    const workoutId = this.#workoutId;
    if (action !== 'add-set' || workoutId === null) {
      return;
    }
    const values = this.formData(form);
    try {
      const exerciseId = Number(values.exerciseId);
      await setFacade.create(workoutId, {
        exerciseId,
        reps: Number(values.reps),
        // A bodyweight exercise's weight input is disabled, so it is not in the form data.
        ...(values.weight === undefined ? {} : { weight: Number(values.weight) }),
        notes: values.notes,
      });
      this.#draft = null;
      this.emit('set-logged', { exerciseId });
    } catch (error) {
      toastError(error);
    }
  }

  override async handleAction(action: string): Promise<void> {
    const workoutId = this.#workoutId;
    const exerciseId = this.#selectedId();
    if (action !== 'add-last-session' || workoutId === null || exerciseId === null || this.#adding) {
      return;
    }
    this.#adding = true;
    this.$<HTMLButtonElement>(`[data-action='add-last-session']`)?.toggleAttribute('disabled', true);
    try {
      await setFacade.addExercises(workoutId, [exerciseId]);
      this.#draft = null;
      this.emit('set-logged', { exerciseId });
    } catch (error) {
      toastError(error);
    } finally {
      this.#adding = false;
      this.$<HTMLButtonElement>(`[data-action='add-last-session']`)?.toggleAttribute('disabled', false);
    }
  }

  override afterRender(): void {
    const select = this.$<HTMLSelectElement>("select[name='exerciseId']");
    const form = this.$<HTMLFormElement>('form');
    if (!select || !form) {
      return;
    }
    // Untrimmed, so a restored field reads exactly as it was typed.
    const keep = (): void => {
      this.#draft = Object.fromEntries(
        Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('select, input')).map((field) => [field.name, field.value]),
      );
    };
    form.addEventListener('input', keep);
    select.addEventListener('change', () => {
      const exerciseId = Number(select.value);
      this.#syncWeight(exerciseId);
      const inWorkout = this.#inWorkout(exerciseId);
      if (inWorkout) {
        this.#prefillFrom(exerciseId);
      }
      void this.#showLastSession(exerciseId, !inWorkout).then(keep);
      keep();
    });
    void this.#showLastSession(Number(select.value), this.#sets?.length === 0 && !this.#draft);
  }

  #selectedId(): ExerciseId | null {
    const select = this.$<HTMLSelectElement>("select[name='exerciseId']");
    return select ? Number(select.value) : null;
  }

  #kindOf(exerciseId: ExerciseId | undefined): ExerciseKind {
    return this.#exercises.find((exercise) => exercise.id === exerciseId)?.kind ?? 'weighted';
  }

  // A disabled input is neither validated nor submitted.
  #syncWeight(exerciseId: ExerciseId): void {
    const kind = this.#kindOf(exerciseId);
    const bodyweight = kind === 'bodyweight';
    const label = this.$("label[for='weight']");
    if (label) {
      label.textContent = weightLabel(kind);
    }
    this.$('.field-weight')?.toggleAttribute('hidden', bodyweight);
    this.$<HTMLInputElement>("input[name='weight']")?.toggleAttribute('disabled', bodyweight);
  }

  #inWorkout(exerciseId: ExerciseId): boolean {
    return this.#sets?.some((set) => set.exerciseId === exerciseId) ?? false;
  }

  async #showLastSession(exerciseId: ExerciseId, prefill: boolean): Promise<void> {
    const workoutId = this.#workoutId;
    if (workoutId === null) {
      return;
    }
    let found = this.#lastSessions.resolved.get(exerciseId);
    if (!found) {
      try {
        found = await this.#lastSessions.lookup(exerciseId, workoutId);
      } catch {
        return;
      }
    }
    if (this.#selectedId() !== exerciseId) {
      return;
    }
    const slot = this.$('.last-session-slot');
    if (slot) {
      slot.innerHTML = String(this.#lastSessionTemplate(exerciseId));
    }
    const first = found.session?.sets[0];
    if (prefill && first) {
      this.#prefill(first);
    }
  }

  #prefillFrom(exerciseId: ExerciseId): void {
    const previous = this.#sets?.filter((set) => set.exerciseId === exerciseId).at(-1);
    if (previous) {
      this.#prefill(previous);
    }
  }

  #prefill(previous: LiftSetDto): void {
    const weight = this.$<HTMLInputElement>("input[name='weight']");
    const reps = this.$<HTMLInputElement>("input[name='reps']");
    if (weight) {
      weight.value = String(previous.weight);
    }
    if (reps) {
      reps.value = String(previous.reps);
    }
  }

  #hint(session: LastSessionDto | null, exercise: ExerciseWithStatsDto | undefined): string {
    if (!session) {
      return 'No history yet';
    }
    const last = `Last · ${formatShortDate(session.performedOn)}`;
    if (exercise?.kind === 'bodyweight') {
      const best = exercise.bestReps === null ? '' : ` · best ${plural(exercise.bestReps, 'rep')}`;
      return `${last}: ${session.sets.map((set) => set.reps).join(' · ')} reps${best}`;
    }
    const sets = session.sets.map((set) => `${set.reps}×${formatNumber(set.weight)}`).join(' · ');
    if (exercise?.kind === 'assisted') {
      const least = exercise.leastWeight === null ? '' : ` · least ${formatKilograms(exercise.leastWeight)}`;
      return `${last}: ${sets} ${UNIT} assist${least}`;
    }
    const best = exercise?.bestWeight ?? null;
    return `${last}: ${sets}${best !== null && best !== 0 ? ` · best ${formatWeight(best)}` : ''}`;
  }

  // Empty until the lookup resolves; then rendered from the cache, so a re-render keeps it.
  #lastSessionTemplate(exerciseId: ExerciseId | undefined): RawHtml {
    const found = exerciseId === undefined ? undefined : this.#lastSessions.resolved.get(exerciseId);
    if (!found) {
      return html``;
    }
    const session = found.session ?? null;
    const count = session?.sets.length ?? 0;
    const hint = this.#hint(
      session,
      this.#exercises.find((exercise) => exercise.id === exerciseId),
    );
    return html`
      <p class="last-session text-light" data-testid="last-session">${hint}</p>
      ${
        exerciseId !== undefined && count > 0 && !this.#inWorkout(exerciseId)
          ? html`<button type="button" class="outline" data-action="add-last-session" data-testid="add-last-session" ${this.#adding ? 'disabled' : ''}>
              Add last session's ${plural(count, 'set')}
            </button>`
          : ''
      }
    `;
  }

  override template(): RawHtml {
    if (!this.#sets) {
      return html``;
    }
    if (this.#exercises.length === 0) {
      return html`
        <section class="vstack gap-2">
          <h2>Add a set</h2>
          <p class="empty">No exercises yet. <a href="/exercises" data-testid="exercises-link">Add the lifts you train</a> to log sets against them.</p>
        </section>
      `;
    }
    const last = this.#sets.at(-1);
    const draft = this.#draft;
    const drafted = draft ? this.#exercises.find((exercise) => String(exercise.id) === draft.exerciseId)?.id : undefined;
    const selected = drafted ?? last?.exerciseId ?? this.#exercises[0]?.id;
    const kind = this.#kindOf(selected);
    const bodyweight = kind === 'bodyweight';

    return html`
      <section class="vstack gap-2">
        <h2>Add a set</h2>
        <article class="card add-form">
          <form data-action="add-set" data-testid="form">
            <div class="fields">
              <div class="field field-exercise">
                <label for="exerciseId">Exercise</label>
                <select id="exerciseId" name="exerciseId" data-testid="exercise">
                  ${this.#exercises.map(
                    (exercise) => html` <option value="${exercise.id}" ${exercise.id === selected ? 'selected' : ''}>${exercise.name}</option> `,
                  )}
                </select>
              </div>
              <div class="field field-num">
                <label for="reps">Reps</label>
                <input id="reps" name="reps" type="number" step="1" min="1" value="${draft?.reps ?? last?.reps ?? ''}" required data-testid="reps" />
              </div>
              <div class="field field-num field-weight" data-testid="weight-field" ${bodyweight ? 'hidden' : ''}>
                <label for="weight">${weightLabel(kind)}</label>
                <input
                  id="weight"
                  name="weight"
                  type="number"
                  step="any"
                  min="0"
                  value="${draft?.weight ?? last?.weight ?? ''}"
                  required
                  data-testid="weight"
                  ${bodyweight ? 'disabled' : ''}
                />
              </div>
              <div class="field field-notes">
                <label for="set-notes">Notes</label>
                <input
                  id="set-notes"
                  name="notes"
                  type="text"
                  maxlength="2000"
                  placeholder="Paused, felt easy"
                  value="${draft?.notes ?? ''}"
                  data-testid="notes"
                />
              </div>
              <button type="submit">Log set</button>
            </div>
          </form>
          <div class="last-session-slot">${this.#lastSessionTemplate(selected)}</div>
        </article>
      </section>
    `;
  }
}

await define('gz-add-set-form', GzAddSetFormComponent, import.meta.url);
