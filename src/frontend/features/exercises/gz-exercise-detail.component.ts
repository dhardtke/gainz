import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatDate, formatDelta, formatNumber, formatVolume, relativeDay, UNIT } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { ExerciseDto, ExerciseProgressDto } from '../../../shared/dto/exercise.ts';
import { exerciseFacade } from './exercises.facade.ts';
import type { GzProgressChartComponent } from './internal/gz-progress-chart.component.ts';
import type { GzSessionTableComponent } from './internal/gz-session-table.component.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { GzView } from '../../ui/view.ts';
import './internal/gz-progress-chart.component.ts';
import './internal/gz-session-table.component.ts';
import '../../ui/tile/gz-tile.component.ts';

/** Progress view for a single exercise: tiles, chart and history first, editing collapsed at the bottom. */
export class GzExerciseDetailComponent extends GzView<ExerciseProgressDto> {
  override loadingText = 'Loading progress…';

  override backLink = { href: '/exercises', label: 'Back to all exercises' };

  /**
   * The metric last chosen in the chart, handed back to it after a save re-renders
   * this view and so recreates the chart. Remembered without re-rendering anything.
   */
  #metric: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener('metric-change', (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        this.#metric = event.detail;
      }
    });
  }

  override load(): Promise<ExerciseProgressDto> {
    return exerciseFacade.progress(this.numericAttribute('exercise-id'));
  }

  override async handleAction(action: string): Promise<void> {
    const exercise = this.data?.exercise;
    if (action !== 'delete-exercise' || !exercise || !confirm(`Delete "${exercise.name}"? Only possible while no set uses it.`)) {
      return;
    }
    try {
      await exerciseFacade.delete(exercise.id);
      toast('Exercise deleted', 'success');
      navigate('/exercises');
    } catch (error) {
      // A set still referencing the exercise comes back as a 409 naming the
      // obstacle, so the useful outcome is to stay here and show it.
      toastError(error);
    }
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'save-exercise') {
      return;
    }
    const values = this.formData(form);
    try {
      await exerciseFacade.update(this.numericAttribute('exercise-id'), {
        // `name` is `required`, so an empty one only arrives if the browser's
        // validation was bypassed; the API rejects it either way.
        name: values.name ?? '',
        muscleGroup: values.muscleGroup,
        notes: values.notes,
      });
      toast('Exercise updated', 'success');
      await this.reload();
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    const sessions = this.data?.sessions;
    const chart = this.$<GzProgressChartComponent>('gz-progress-chart');
    const table = this.$<GzSessionTableComponent>('gz-session-table');
    if (!sessions || !chart || !table) {
      return;
    }
    if (this.#metric !== null) {
      chart.metric = this.#metric;
    }
    chart.sessions = sessions;
    table.sessions = sessions;
  }

  #headerTemplate(exercise: ExerciseDto): RawHtml {
    return html`
      <div>
        <p><a href="/exercises">← Exercises</a></p>
        <hgroup>
          <h1>${exercise.name}</h1>
          <p class="text-light">${exercise.muscleGroup ?? 'No muscle group set'}</p>
        </hgroup>
      </div>
    `;
  }

  /**
   * Editing and the destructive Delete, collapsed below the history. It keeps no open state: only
   * a successful save reloads the view, which closes it while the toast confirms the save, and a
   * failed save or a metric switch re-renders nothing.
   */
  #editTemplate(exercise: ExerciseDto): RawHtml {
    return html`
      <details class="edit">
        <summary>Edit exercise</summary>
        <div class="vstack gap-2">
          <form class="vstack gap-2" data-action="save-exercise">
            <div class="fields">
              <div class="field grow">
                <label for="name">Name</label>
                <input id="name" name="name" type="text" maxlength="120" value="${exercise.name}" required />
              </div>
              <div class="field">
                <label for="muscleGroup">Muscle group</label>
                <input id="muscleGroup" name="muscleGroup" type="text" maxlength="60" value="${exercise.muscleGroup ?? ''}" />
              </div>
            </div>
            <div class="field">
              <label for="notes">Notes</label>
              <textarea id="notes" name="notes" maxlength="2000" placeholder="Low bar, belt over 100 kg">${exercise.notes ?? ''}</textarea>
            </div>
            <div class="hstack gap-2">
              <button type="submit">Save</button>
            </div>
          </form>
          <div><button data-variant="danger" data-action="delete-exercise">Delete exercise</button></div>
        </div>
      </details>
    `;
  }

  #summaryTiles({ sessions, bestSet }: ExerciseProgressDto): RawHtml {
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);

    const totalVolume = sessions.reduce((sum, session) => sum + session.totalVolume, 0);
    const delta = latest && previous ? formatDelta(latest.estOneRepMax, previous.estOneRepMax) : '';

    return html`
      <div class="tiles">
        <gz-tile label="Sessions" value="${sessions.length}" hint="${latest ? `last ${relativeDay(latest.performedOn)}` : 'not trained yet'}"></gz-tile>
        <gz-tile
          label="Best set"
          value="${bestSet ? `${formatNumber(bestSet.weight)} ${UNIT} × ${bestSet.reps}` : '–'}"
          hint="${bestSet ? formatDate(bestSet.performedOn) : 'no sets logged'}"
        ></gz-tile>
        <gz-tile
          label="Estimated 1RM"
          value="${latest ? `${formatNumber(latest.estOneRepMax, 1)} ${UNIT}` : '–'}"
          hint="${delta ? `${delta} ${UNIT} vs. previous session` : 'needs two sessions'}"
        ></gz-tile>
        <gz-tile label="Total volume" value="${formatVolume(totalVolume)}" hint="across all sessions"></gz-tile>
      </div>
    `;
  }

  override readyTemplate(progress: ExerciseProgressDto): RawHtml {
    return html`
      <div class="vstack">
        ${this.#headerTemplate(progress.exercise)} ${this.#summaryTiles(progress)}

        <gz-progress-chart></gz-progress-chart>

        <gz-session-table></gz-session-table>

        ${this.#editTemplate(progress.exercise)}
      </div>
    `;
  }
}

await define('gz-exercise-detail', GzExerciseDetailComponent, import.meta.url);
