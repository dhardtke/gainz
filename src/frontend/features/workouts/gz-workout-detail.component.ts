import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatVolume, plural, relativeDay } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { ExerciseDto } from '../../../shared/dto/exercise.ts';
import type { EditWorkoutDto, MoveDirection, WorkoutExerciseDto, WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import type { ExerciseId } from '../../../shared/flavors.ts';
import type { GzAddSetFormComponent } from './internal/gz-add-set-form.component.ts';
import { GzSetRowComponent } from './internal/gz-set-row.component.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import { exerciseFacade } from '../exercises/exercises.facade.ts';
import { workoutFacade } from './workouts.facade.ts';
import './internal/gz-add-set-form.component.ts';

function isSetLogged(detail: unknown): detail is { exerciseId: number } {
  return typeof detail === 'object' && detail !== null && 'exerciseId' in detail && typeof detail.exerciseId === 'number';
}

function workoutName(workout: WorkoutWithExercisesDto): string {
  return workout.title ?? formatDate(workout.performedOn);
}

interface WorkoutDetailData {
  workout: WorkoutWithExercisesDto;
  exercises: ExerciseDto[];
}

export class GzWorkoutDetailComponent extends GzView<WorkoutDetailData> {
  override loadingText = 'Loading workout…';

  // Unsaved details; every logged set re-renders the form, so the DOM can't hold them.
  #edits: Record<string, string> | null = null;

  // Serialized so Enter and the change it commits save once.
  #saving: Promise<void> = Promise.resolve();

  // `null` for all collapsed, `undefined` until the first load has decided.
  #openExerciseId: ExerciseId | null | undefined = undefined;

  #detailsOpen = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('sets-changed', () => {
      void this.#reloadKeepingFocus();
    });
    this.root.addEventListener('set-logged', (event) => {
      if (event instanceof CustomEvent && isSetLogged(event.detail)) {
        this.#openExerciseId = event.detail.exerciseId;
      }
      void this.reload().then(() => this.$<GzAddSetFormComponent>('gz-add-set-form')?.focusReps());
    });
  }

  async #reloadKeepingFocus(): Promise<void> {
    const active = this.root.activeElement;
    const row = active instanceof GzSetRowComponent ? active : null;
    const rowField = row?.focusedField() ?? null;
    const detailsField = active instanceof HTMLElement && active.closest('form.details') ? active.id : '';
    await this.reload();
    if (row && rowField) {
      this.$<GzSetRowComponent>(`gz-set-row[data-id='${row.dataset.id}']`)?.restoreField(rowField);
    } else if (detailsField) {
      this.$<HTMLElement>(`#${detailsField}`)?.focus();
    }
  }

  override async load(): Promise<WorkoutDetailData> {
    const [workout, { items: exercises }] = await Promise.all([workoutFacade.get(this.numericAttribute('workout-id')), exerciseFacade.list()]);
    return { workout, exercises };
  }

  override async handleAction(action: string, element: HTMLElement): Promise<void> {
    if (action === 'move-exercise-up' || action === 'move-exercise-down') {
      const exerciseId = Number(element.dataset.exerciseId);
      const direction = action === 'move-exercise-up' ? 'up' : 'down';
      try {
        await workoutFacade.moveExercise(this.numericAttribute('workout-id'), exerciseId, direction);
      } catch (error) {
        toastError(error);
        return;
      }
      await this.reload();
      this.#focusMove(exerciseId, direction);
      return;
    }

    if (action !== 'delete-workout' || !confirm('Delete this workout and all of its sets? This cannot be undone.')) {
      return;
    }
    try {
      await workoutFacade.delete(this.numericAttribute('workout-id'));
      toast('Workout deleted', 'success');
      navigate('/workouts');
    } catch (error) {
      toastError(error);
    }
  }

  #focusMove(exerciseId: ExerciseId, direction: MoveDirection): void {
    const arrow = (to: MoveDirection): HTMLButtonElement | null =>
      this.$<HTMLButtonElement>(`[data-action='move-exercise-${to}'][data-exercise-id='${exerciseId}']`);
    const moved = arrow(direction);
    (moved?.disabled === false ? moved : arrow(direction === 'up' ? 'down' : 'up'))?.focus();
  }

  async #saveDetails(form: HTMLFormElement): Promise<void> {
    const workout = this.data?.workout;
    if (!workout || !form.reportValidity()) {
      return;
    }
    const { performedOn = '', title = '', notes = '' } = this.formData(form);
    const changes: EditWorkoutDto = {};
    if (performedOn !== workout.performedOn) {
      changes.performedOn = performedOn;
    }
    if (title !== (workout.title ?? '')) {
      changes.title = title;
    }
    if (notes !== (workout.notes ?? '')) {
      changes.notes = notes;
    }
    if (Object.keys(changes).length === 0) {
      return;
    }
    try {
      await workoutFacade.update(workout.id, changes);
      await this.#reloadKeepingFocus();
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    if (!this.data) {
      return;
    }
    const { workout, exercises } = this.data;
    const sets = workout.exercises.flatMap((group) => group.sets);

    for (const row of this.$$<GzSetRowComponent>('gz-set-row')) {
      row.index = Number(row.dataset.index);
      row.set = sets.find((candidate) => candidate.id === Number(row.dataset.id));
    }

    for (const group of this.$$<HTMLDetailsElement>("details[name='exercises']")) {
      const id = Number(group.dataset.exerciseId);
      // `toggle` does not bubble; the closing group's toggle fires second, so the id survives.
      group.addEventListener('toggle', () => {
        if (group.open) {
          this.#openExerciseId = id;
        } else if (this.#openExerciseId === id) {
          this.#openExerciseId = null;
        }
      });
    }

    const section = this.$<HTMLDetailsElement>('details.details-section');
    section?.addEventListener('toggle', () => {
      this.#detailsOpen = section.open;
    });

    const details = this.$<HTMLFormElement>('form.details');
    details?.addEventListener('input', () => {
      this.#edits = this.formData(details);
    });
    const save = (form: HTMLFormElement): void => {
      this.#saving = this.#saving.then(() => this.#saveDetails(form));
    };
    details?.addEventListener('change', () => {
      save(details);
    });
    // A multi-field form without a submit button ignores Enter.
    details?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        save(details);
      }
    });

    const addSet = this.$<GzAddSetFormComponent>('gz-add-set-form');
    if (addSet) {
      addSet.workoutId = workout.id;
      addSet.exercises = exercises;
      // Logged order: the form starts from the last set it is given.
      addSet.sets = sets.toSorted((a, b) => a.position - b.position || a.id - b.id);
    }
  }

  #openFor(exercises: WorkoutExerciseDto[]): ExerciseId | null {
    if (this.#openExerciseId === undefined) {
      const next = exercises.find((group) => group.sets.some((set) => !set.done)) ?? exercises.at(-1);
      this.#openExerciseId = next?.exerciseId ?? null;
    } else if (this.#openExerciseId !== null && !exercises.some((group) => group.exerciseId === this.#openExerciseId)) {
      this.#openExerciseId = null;
    }
    return this.#openExerciseId;
  }

  override titleFor({ workout }: WorkoutDetailData): string {
    return workoutName(workout);
  }

  #headerTemplate(workout: WorkoutWithExercisesDto): RawHtml {
    return html`
      <hgroup>
        <h1 data-testid="heading">${workoutName(workout)}</h1>
        <p class="text-light" data-testid="subtitle">${formatDate(workout.performedOn)} · ${relativeDay(workout.performedOn)}</p>
      </hgroup>
    `;
  }

  // No `name`, so it stays out of the exercises' exclusive accordion group.
  #detailsTemplate(workout: WorkoutWithExercisesDto): RawHtml {
    const edits = this.#edits ?? {
      performedOn: workout.performedOn,
      title: workout.title ?? '',
      notes: workout.notes ?? '',
    };

    return html`
      <details class="details-section" data-testid="details-section" ${this.#detailsOpen ? 'open' : ''}>
        <summary data-testid="details-summary">Details & notes</summary>
        <div class="vstack gap-2">
          <form class="details vstack gap-2" data-testid="details-form">
            <div class="fields">
              <div class="field">
                <label for="performedOn">Date</label>
                <input id="performedOn" name="performedOn" type="date" value="${edits.performedOn}" required data-testid="performedOn" />
              </div>
              <div class="field grow">
                <label for="title">Title</label>
                <input id="title" name="title" type="text" maxlength="120" value="${edits.title}" data-testid="title" />
              </div>
            </div>
            <div class="field">
              <label for="notes">Session notes</label>
              <textarea id="notes" name="notes" maxlength="2000" placeholder="How did it feel?" data-testid="notes">${edits.notes}</textarea>
            </div>
          </form>
          <div><button data-variant="danger" data-action="delete-workout" data-testid="delete-workout">Delete workout</button></div>
        </div>
      </details>
    `;
  }

  #progressBadge(doneCount: number, setCount: number): RawHtml {
    if (setCount === 0) {
      return html``;
    }
    if (doneCount === setCount) {
      return html`<span class="badge" data-variant="success" data-testid="progress">✓ Done</span>`;
    }
    return html`<span class="badge outline" data-testid="progress">${doneCount}/${setCount} done</span>`;
  }

  #groupSummary(group: WorkoutExerciseDto): string {
    const count = group.sets.length;
    const volume = group.sets.reduce((total, set) => total + set.reps * set.weight, 0);
    return `${plural(count, 'set')} · ${formatVolume(volume)}`;
  }

  #groupTemplate(group: WorkoutExerciseDto, open: ExerciseId | null, first: boolean, last: boolean): RawHtml {
    const { exerciseId: id, exerciseName: name } = group;
    const doneCount = group.sets.filter((set) => set.done).length;
    return html`
      <details name="exercises" data-exercise-id="${id}" data-testid="exercise-group" ${id === open ? 'open' : ''}>
        <summary>
          <span class="exercise-name" data-testid="exercise-name">${name}</span>
          <span class="group-stats text-light" data-testid="group-stats">${this.#groupSummary(group)}</span>
          ${this.#progressBadge(doneCount, group.sets.length)}
        </summary>
        <div class="sets">
          ${group.sets.map((set, index) => html`<gz-set-row data-id="${set.id}" data-index="${index + 1}" data-testid="set-row"></gz-set-row>`)}
        </div>
        <div class="group-actions">
          <fieldset class="group move">
            <button
              class="outline"
              data-action="move-exercise-up"
              data-exercise-id="${id}"
              data-testid="move-up"
              aria-label="Move ${name} up"
              ${first ? 'disabled' : ''}
            >
              ▲
            </button>
            <button
              class="outline"
              data-action="move-exercise-down"
              data-exercise-id="${id}"
              data-testid="move-down"
              aria-label="Move ${name} down"
              ${last ? 'disabled' : ''}
            >
              ▼
            </button>
          </fieldset>
          <a class="button outline" href="/exercises/${id}" data-testid="history-link">Exercise history →</a>
        </div>
      </details>
    `;
  }

  override readyTemplate({ workout }: WorkoutDetailData): RawHtml {
    const sets = workout.exercises.flatMap((group) => group.sets);
    const volume = sets.reduce((total, set) => total + set.reps * set.weight, 0);
    const reps = sets.reduce((total, set) => total + set.reps, 0);
    const exercises = new Set(sets.map((set) => set.exerciseId)).size;
    const doneCount = sets.filter((set) => set.done).length;
    const open = this.#openFor(workout.exercises);

    return html`
      <div class="vstack">
        ${this.#headerTemplate(workout)}

        <div class="summary hstack gap-2" data-testid="summary">
          <span class="text-light" data-testid="totals">
            ${plural(sets.length, 'set')} · ${plural(exercises, 'exercise')} · ${plural(reps, 'rep')} · ${formatVolume(volume)}
          </span>
          ${this.#progressBadge(doneCount, sets.length)}
        </div>

        <section class="vstack gap-2">
          <h2>Sets</h2>
          ${
            sets.length === 0
              ? html`<p class="empty" data-testid="empty">No sets logged for this session yet.</p>`
              : html`<div class="exercises">
                  ${workout.exercises.map((group, index, all) => this.#groupTemplate(group, open, index === 0, index === all.length - 1))}
                </div>`
          }
        </section>

        <gz-add-set-form data-testid="add-set-form"></gz-add-set-form>

        ${this.#detailsTemplate(workout)}
      </div>
    `;
  }
}

await define('gz-workout-detail', GzWorkoutDetailComponent, import.meta.url);
