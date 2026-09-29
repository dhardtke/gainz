import { ApiError, errorMessage } from '../../http/errors.ts';
import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatNumber, formatVolume, plural, relativeDay, UNIT } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { ExerciseDto } from '../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
import type { ExerciseId, WorkoutId } from '../../../shared/flavors.ts';
import type { GzSetRowComponent } from './internal/gz-set-row.component.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { exerciseFacade } from '../exercises/exercises.facade.ts';
import { setFacade, workoutFacade } from './workouts.facade.ts';
import './internal/gz-set-row.component.ts';

type WorkoutDetailState = { status: 'loading' } | { status: 'ready'; workout: WorkoutWithSetsDto } | { status: 'error'; message: string };

/** One exercise's totals within the session. */
interface ExerciseTotals {
  id: ExerciseId;
  name: string;
  sets: number;
  reps: number;
  volume: number;
  /** The heaviest weight moved. */
  top: number;
}

const NEW_EXERCISE = '__new__';

/** The logging screen for one session: edit the header, add sets, see totals. */
export class GzWorkoutDetailComponent extends GzElement {
  #workoutId: string | null = null;

  #state: WorkoutDetailState = { status: 'loading' };

  #exercises: ExerciseDto[] = [];

  /**
   * What has been typed into the details form but not saved.
   *
   * The form is always on screen and every logged set re-renders the view, so
   * the template — not the DOM — has to own these values. `null` means "show
   * what the server returned", which is also what a successful save restores.
   */
  #edits: Record<string, string> | null = null;

  /**
   * Remembers the last logged set so the next one starts from it.
   *
   * `exerciseId` also holds the "new exercise" sentinel, which is what the
   * select shows on a cold start with no exercises defined yet.
   */
  #draft: { exerciseId: ExerciseId | typeof NEW_EXERCISE | null; weight: string; reps: string } = {
    exerciseId: null,
    weight: '',
    reps: '',
  };
  #focusAfterRender = false;

  static observedAttributes = ['workout-id'];

  attributeChangedCallback(_name: string, oldValue: string | null, value: string | null): void {
    this.#workoutId = value;
    // The initial attribute arrives before connectedCallback, which loads anyway.
    if (this.isConnected && oldValue !== null && oldValue !== value) {
      void this.#load();
    }
  }

  /**
   * The id this view is showing.
   *
   * its route sets the attribute before the element is connected, so
   * attributeChangedCallback has always run by the time anything asks for it.
   * Reading it through here states that invariant once, in the one place that
   * would notice it being broken, instead of at every call site.
   *
   * The attribute mirrors a route parameter `workouts.routes.ts` matches as `(\d+)`, so it is always
   * digits and the conversion cannot produce a NaN.
   */
  get #id(): WorkoutId {
    const id = this.#workoutId;
    if (id === null) {
      throw new Error('gz-workout-detail needs a workout-id attribute');
    }
    return Number(id);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('sets-changed', () => {
      void this.#load();
    });
    this.ready = this.#load();
  }

  async #load(): Promise<void> {
    try {
      const [workout, exercises] = await Promise.all([workoutFacade.get(this.#id), exerciseFacade.list()]);
      this.#exercises = exercises;
      this.#state = { status: 'ready', workout };
      if (this.#draft.exerciseId === null) {
        const lastSet = workout.sets.at(-1);
        this.#draft.exerciseId = lastSet?.exerciseId ?? exercises[0]?.id ?? null;
      }
    } catch (error) {
      this.#state = { status: 'error', message: errorMessage(error) };
      if (!(error instanceof ApiError) || error.status !== 404) {
        toastError(error);
      }
    }
    this.render();
  }

  override async handleAction(action: string, element: HTMLElement): Promise<void> {
    if (action === 'delete-workout') {
      if (!confirm('Delete this workout and all of its sets? This cannot be undone.')) {
        return;
      }
      try {
        await workoutFacade.delete(this.#id);
        toast('Workout deleted', 'success');
        navigate('/workouts');
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === 'repeat-exercise') {
      // Re-log the last set of an exercise the user already did in this session.
      const exerciseId = Number(element.dataset.id);
      if (this.#state.status !== 'ready') {
        return;
      }
      const last = this.#state.workout.sets.filter((set) => set.exerciseId === exerciseId).at(-1);
      if (!last) {
        return;
      }
      try {
        await setFacade.create(this.#id, {
          exerciseId: last.exerciseId,
          reps: last.reps,
          weight: last.weight,
          notes: null,
        });
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    const values = this.formData(form);

    if (action === 'save-workout') {
      try {
        await workoutFacade.update(this.#id, {
          performedOn: values.performedOn,
          title: values.title,
          notes: values.notes,
        });
        this.#edits = null;
        toast('Workout updated', 'success');
        await this.#load();
      } catch (error) {
        toastError(error);
      }
      return;
    }

    if (action === 'add-set') {
      try {
        let exerciseId: string | number = values.exerciseId ?? '';

        if (exerciseId === NEW_EXERCISE) {
          if (!values.newExercise) {
            toast('Give the new exercise a name', 'error');
            return;
          }
          const created = await exerciseFacade.create({ name: values.newExercise });
          exerciseId = created.id;
        }

        await setFacade.create(this.#id, {
          exerciseId: Number(exerciseId),
          reps: Number(values.reps),
          weight: Number(values.weight),
          notes: values.notes,
        });

        this.#draft = { exerciseId: Number(exerciseId), weight: values.weight ?? '', reps: values.reps ?? '' };
        this.#focusAfterRender = true;
        await this.#load();
      } catch (error) {
        toastError(error);
      }
    }
  }

  override afterRender(): void {
    if (this.#state.status !== 'ready') {
      return;
    }
    const workout = this.#state.workout;

    const rows = this.$$<GzSetRowComponent>('gz-set-row');
    for (const row of rows) {
      const set = workout.sets.find((candidate) => candidate.id === Number(row.dataset.id));
      row.exercises = this.#exercises;
      row.index = Number(row.dataset.index);
      row.set = set;
    }

    const details = this.$<HTMLFormElement>("form[data-action='save-workout']");
    details?.addEventListener('input', () => {
      this.#edits = this.formData(details);
    });

    const select = this.$<HTMLSelectElement>("select[name='exerciseId']");
    if (select) {
      select.addEventListener('change', () => {
        this.$('.field-new-exercise')?.toggleAttribute('hidden', select.value !== NEW_EXERCISE);
        this.#prefillFrom(Number(select.value));
      });
    }

    if (this.#focusAfterRender) {
      this.#focusAfterRender = false;
      const field = this.$<HTMLInputElement>(".add-form input[name='weight']");
      field?.focus();
    }
  }

  /** Copies the last set of an exercise into the add-set form. */
  #prefillFrom(exerciseId: ExerciseId): void {
    if (this.#state.status !== 'ready') {
      return;
    }
    const previous = this.#state.workout.sets.filter((set) => set.exerciseId === exerciseId).at(-1);
    if (!previous) {
      return;
    }

    const weight = this.$<HTMLInputElement>(".add-form input[name='weight']");
    const reps = this.$<HTMLInputElement>(".add-form input[name='reps']");
    if (weight) {
      weight.value = String(previous.weight);
    }
    if (reps) {
      reps.value = String(previous.reps);
    }
  }

  #headerTemplate(workout: WorkoutWithSetsDto): RawHtml {
    const edits = this.#edits ?? {
      performedOn: workout.performedOn,
      title: workout.title ?? '',
      notes: workout.notes ?? '',
    };

    return html`
      <div class="hstack justify-between gap-2">
        <hgroup>
          <h1>${workout.title ?? formatDate(workout.performedOn)}</h1>
          <p class="text-light">${formatDate(workout.performedOn)} · ${relativeDay(workout.performedOn)}</p>
        </hgroup>
        <button data-variant="danger" data-action="delete-workout">Delete</button>
      </div>
      <article class="card">
        <form class="vstack gap-2" data-action="save-workout">
          <div class="fields">
            <div class="field">
              <label for="performedOn">Date</label>
              <input id="performedOn" name="performedOn" type="date" value="${edits.performedOn}" required />
            </div>
            <div class="field grow">
              <label for="title">Title</label>
              <input id="title" name="title" type="text" maxlength="120" value="${edits.title}" />
            </div>
          </div>
          <div class="field">
            <label for="notes">Session notes</label>
            <textarea id="notes" name="notes" maxlength="2000" placeholder="How did it feel?">${edits.notes}</textarea>
          </div>
          <div class="hstack gap-2">
            <button type="submit">Save</button>
          </div>
        </form>
      </article>
    `;
  }

  #addSetTemplate(): RawHtml {
    if (this.#exercises.length === 0 && this.#draft.exerciseId === null) {
      // Still offer the form: the inline "new exercise" field covers a cold start.
      this.#draft.exerciseId = NEW_EXERCISE;
    }
    const selected = this.#draft.exerciseId;

    return html`
      <article class="card add-form vstack gap-2">
        <h2>Add a set</h2>
        <form data-action="add-set">
          <div class="fields">
            <div class="field field-exercise">
              <label for="exerciseId">Exercise</label>
              <select id="exerciseId" name="exerciseId">
                ${this.#exercises.map(
                  (exercise) => html` <option value="${exercise.id}" ${exercise.id === selected ? 'selected' : ''}>${exercise.name}</option> `,
                )}
                <option value="${NEW_EXERCISE}" ${selected === NEW_EXERCISE ? 'selected' : ''}>＋ New exercise…</option>
              </select>
            </div>
            <div class="field field-exercise field-new-exercise" ${selected === NEW_EXERCISE ? '' : 'hidden'}>
              <label for="newExercise">New exercise name</label>
              <input id="newExercise" name="newExercise" type="text" maxlength="120" placeholder="Incline Press" />
            </div>
            <div class="field field-num">
              <label for="weight">Weight (${UNIT})</label>
              <input id="weight" name="weight" type="number" step="0.25" min="0" value="${this.#draft.weight}" required />
            </div>
            <div class="field field-num">
              <label for="reps">Reps</label>
              <input id="reps" name="reps" type="number" step="1" min="1" value="${this.#draft.reps}" required />
            </div>
            <div class="field field-notes">
              <label for="set-notes">Notes</label>
              <input id="set-notes" name="notes" type="text" maxlength="2000" placeholder="Paused, felt easy" />
            </div>
            <button type="submit">Log set</button>
          </div>
        </form>
      </article>
    `;
  }

  #breakdown(sets: LiftSetDto[]): ExerciseTotals[] {
    const byExercise = new Map<ExerciseId, ExerciseTotals>();
    for (const set of sets) {
      const entry = byExercise.get(set.exerciseId) ?? {
        id: set.exerciseId,
        name: set.exerciseName,
        sets: 0,
        reps: 0,
        volume: 0,
        top: 0,
      };
      entry.sets += 1;
      entry.reps += set.reps;
      entry.volume += set.reps * set.weight;
      entry.top = Math.max(entry.top, set.weight);
      byExercise.set(set.exerciseId, entry);
    }
    return [...byExercise.values()];
  }

  override template(): RawHtml {
    if (this.#state.status === 'loading') {
      return html`<p aria-busy="true">Loading workout…</p>`;
    }
    if (this.#state.status === 'error') {
      return html`
        <div class="vstack">
          <p class="error-text">${this.#state.message}</p>
          <p><a href="/workouts">Back to all workouts</a></p>
        </div>
      `;
    }

    const { workout } = this.#state;
    const sets = workout.sets;
    const volume = sets.reduce((total, set) => total + set.reps * set.weight, 0);
    const reps = sets.reduce((total, set) => total + set.reps, 0);
    const breakdown = this.#breakdown(sets);

    return html`
      <div class="vstack">
        ${this.#headerTemplate(workout)}

        <div class="totals">
          <span class="badge outline">${plural(sets.length, 'set')}</span>
          <span class="badge outline">${plural(breakdown.length, 'exercise')}</span>
          <span class="badge outline">${plural(reps, 'rep')}</span>
          <span class="badge outline">${formatVolume(volume)} total volume</span>
        </div>

        ${this.#addSetTemplate()}

        <section class="vstack gap-2">
          <h2>Sets</h2>
          ${
            sets.length === 0
              ? html`<p class="empty">No sets logged for this session yet.</p>`
              : html` <div class="sets">${sets.map((set, index) => html`<gz-set-row data-id="${set.id}" data-index="${index + 1}"></gz-set-row>`)}</div> `
          }
        </section>

        ${
          breakdown.length === 0
            ? ''
            : html`
                <article class="card vstack gap-2">
                  <h2>By exercise</h2>
                  <div class="table">
                    <table class="breakdown">
                      <thead>
                        <tr>
                          <th scope="col">Exercise</th>
                          <th scope="col" class="num">Sets</th>
                          <th scope="col" class="num">Reps</th>
                          <th scope="col" class="num">Top set</th>
                          <th scope="col" class="num">Volume</th>
                          <th scope="col"></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${breakdown.map(
                          (entry) => html`
                            <tr>
                              <td class="name"><a href="/exercises/${entry.id}">${entry.name}</a></td>
                              <td class="num">${entry.sets}</td>
                              <td class="num">${entry.reps}</td>
                              <td class="num">${formatNumber(entry.top)} ${UNIT}</td>
                              <td class="num">${formatVolume(entry.volume)}</td>
                              <td class="num">
                                <button class="outline" data-action="repeat-exercise" data-id="${entry.id}">Another set</button>
                              </td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              `
        }
      </div>
    `;
  }
}

await define('gz-workout-detail', GzWorkoutDetailComponent, import.meta.url);
