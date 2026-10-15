import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatAssistance, formatDate, formatDelta, formatKilograms, formatNumber, formatVolume, plural, relativeDay, UNIT } from '../../ui/format.ts';
import { navigate } from '../../app/router.ts';
import type { ExerciseDto, ExerciseProgressDto } from '../../../shared/dto/exercise.ts';
import { exerciseFacade } from './exercises.facade.ts';
import { muscleGroupOptions, parseMuscleGroup } from './internal/muscle-groups.ts';
import { KIND_LABELS, kindOptions, parseExerciseKind } from './internal/exercise-filter.ts';
import type { GzProgressChartComponent } from './internal/gz-progress-chart.component.ts';
import type { GzSessionTableComponent } from './internal/gz-session-table.component.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { confirmAction } from '../../ui/confirm/confirm.ts';
import { GzView } from '../../ui/view.ts';
import './internal/gz-progress-chart.component.ts';
import './internal/gz-session-table.component.ts';
import '../../ui/tile/gz-tile.component.ts';
import './gz-muscle-group-icon.component.ts';

export class GzExerciseDetailComponent extends GzView<ExerciseProgressDto> {
  override loadingText = 'Loading progress…';

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
    if (action !== 'delete-exercise' || !exercise) {
      return;
    }
    if (!(await confirmAction({ title: `Delete "${exercise.name}"?`, message: 'Only possible while no set uses it.', confirmLabel: 'Delete', danger: true }))) {
      return;
    }
    try {
      await exerciseFacade.delete(exercise.id);
      toast('Exercise deleted', 'success');
      navigate('/exercises');
    } catch (error) {
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
        name: values.name ?? '',
        muscleGroup: parseMuscleGroup(values.muscleGroup),
        notes: values.notes,
        kind: parseExerciseKind(values.kind) ?? 'weighted',
      });
      toast('Exercise updated', 'success');
      await this.reload();
    } catch (error) {
      toastError(error);
    }
  }

  override afterRender(): void {
    const { sessions, exercise } = this.data ?? {};
    const chart = this.$<GzProgressChartComponent>('gz-progress-chart');
    const table = this.$<GzSessionTableComponent>('gz-session-table');
    if (!sessions || !exercise || !chart || !table) {
      return;
    }
    chart.kind = exercise.kind;
    table.kind = exercise.kind;
    if (this.#metric !== null) {
      chart.metric = this.#metric;
    }
    chart.sessions = sessions;
    table.sessions = sessions;
  }

  override titleFor(progress: ExerciseProgressDto): string {
    return progress.exercise.name;
  }

  #headerTemplate(exercise: ExerciseDto): RawHtml {
    const kind = exercise.kind === 'weighted' ? null : KIND_LABELS[exercise.kind];
    return html`
      <hgroup>
        <h1 data-testid="heading">${exercise.name}</h1>
        <p class="text-light" data-testid="muscle-group">
          ${
            exercise.muscleGroup
              ? html`<gz-muscle-group-icon group="${exercise.muscleGroup}"></gz-muscle-group-icon> ${exercise.muscleGroup}${kind === null ? '' : ` · ${kind}`}`
              : (kind ?? 'No muscle group set')
          }
        </p>
      </hgroup>
    `;
  }

  #editTemplate(exercise: ExerciseDto): RawHtml {
    return html`
      <details class="edit" data-testid="edit">
        <summary data-testid="edit-summary">Edit exercise</summary>
        <div class="vstack gap-2">
          <form class="vstack gap-2" data-action="save-exercise" data-testid="edit-form">
            <div class="fields">
              <div class="field grow">
                <label for="name">Name</label>
                <input id="name" name="name" type="text" maxlength="120" value="${exercise.name}" required data-testid="name" />
              </div>
              <div class="field">
                <label for="muscleGroup">Muscle group</label>
                <select id="muscleGroup" name="muscleGroup" class="rich" data-testid="muscleGroup">
                  ${muscleGroupOptions(exercise.muscleGroup)}
                </select>
              </div>
            </div>
            <div class="field">
              <label for="notes">Notes</label>
              <textarea id="notes" name="notes" maxlength="2000" placeholder="Low bar, belt over 100 kg" data-testid="notes">${exercise.notes ?? ''}</textarea>
            </div>
            <div class="field">
              <label for="kind">Type</label>
              <select id="kind" name="kind" data-testid="kind">
                ${kindOptions(exercise.kind)}
              </select>
            </div>
            <div class="hstack gap-2">
              <button type="submit">Save</button>
            </div>
          </form>
          <div><button data-variant="danger" data-action="delete-exercise" data-testid="delete-exercise">Delete exercise</button></div>
        </div>
      </details>
    `;
  }

  #bodyweightTiles({ sessions, bestSet }: ExerciseProgressDto): RawHtml {
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);

    const totalReps = sessions.reduce((sum, session) => sum + session.totalReps, 0);
    const delta = latest && previous ? formatDelta(latest.topReps, previous.topReps) : '';

    return html`
      <div class="tiles" data-testid="tiles">
        <gz-tile
          data-testid="tile"
          label="Sessions"
          value="${sessions.length}"
          hint="${latest ? `last ${relativeDay(latest.performedOn)}` : 'not trained yet'}"
        ></gz-tile>
        <gz-tile
          data-testid="tile"
          label="Best set"
          value="${bestSet ? plural(bestSet.reps, 'rep') : '–'}"
          hint="${bestSet ? formatDate(bestSet.performedOn) : 'no sets logged'}"
        ></gz-tile>
        <gz-tile
          data-testid="tile"
          label="Top set"
          value="${latest ? plural(latest.topReps, 'rep') : '–'}"
          hint="${delta ? `${delta} reps vs. previous session` : 'needs two sessions'}"
        ></gz-tile>
        <gz-tile data-testid="tile" label="Total reps" value="${formatNumber(totalReps)}" hint="across all sessions"></gz-tile>
      </div>
    `;
  }

  #assistedTiles({ sessions, bestSet }: ExerciseProgressDto): RawHtml {
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);

    const effectiveVolume = sessions.reduce((sum, session) => sum + (session.effectiveVolume ?? 0), 0);
    const delta = latest && previous ? formatDelta(latest.leastWeight, previous.leastWeight) : '';

    return html`
      <div class="tiles" data-testid="tiles">
        <gz-tile
          data-testid="tile"
          label="Sessions"
          value="${sessions.length}"
          hint="${latest ? `last ${relativeDay(latest.performedOn)}` : 'not trained yet'}"
        ></gz-tile>
        <gz-tile
          data-testid="tile"
          label="Best set"
          value="${bestSet ? `${formatAssistance(bestSet.weight)} × ${bestSet.reps}` : '–'}"
          hint="${bestSet ? formatDate(bestSet.performedOn) : 'no sets logged'}"
        ></gz-tile>
        <gz-tile
          data-testid="tile"
          label="Least assistance"
          value="${formatKilograms(latest?.leastWeight)}"
          hint="${delta ? `${delta} ${UNIT} vs. previous session` : 'needs two sessions'}"
        ></gz-tile>
        <gz-tile data-testid="tile" label="Effective volume" value="${formatVolume(effectiveVolume)}" hint="across all sessions"></gz-tile>
      </div>
    `;
  }

  #summaryTiles(progress: ExerciseProgressDto): RawHtml {
    if (progress.exercise.kind === 'bodyweight') {
      return this.#bodyweightTiles(progress);
    }
    if (progress.exercise.kind === 'assisted') {
      return this.#assistedTiles(progress);
    }
    const { sessions, bestSet } = progress;
    const latest = sessions.at(-1);
    const previous = sessions.at(-2);

    const totalVolume = sessions.reduce((sum, session) => sum + session.totalVolume, 0);
    const delta = latest && previous ? formatDelta(latest.estOneRepMax, previous.estOneRepMax) : '';

    return html`
      <div class="tiles" data-testid="tiles">
        <gz-tile
          data-testid="tile"
          label="Sessions"
          value="${sessions.length}"
          hint="${latest ? `last ${relativeDay(latest.performedOn)}` : 'not trained yet'}"
        ></gz-tile>
        <gz-tile
          data-testid="tile"
          label="Best set"
          value="${bestSet ? `${formatKilograms(bestSet.weight)} × ${bestSet.reps}` : '–'}"
          hint="${bestSet ? formatDate(bestSet.performedOn) : 'no sets logged'}"
        ></gz-tile>
        <gz-tile
          data-testid="tile"
          label="Estimated 1RM"
          value="${latest ? `${formatNumber(latest.estOneRepMax, 1)} ${UNIT}` : '–'}"
          hint="${delta ? `${delta} ${UNIT} vs. previous session` : 'needs two sessions'}"
        ></gz-tile>
        <gz-tile data-testid="tile" label="Total volume" value="${formatVolume(totalVolume)}" hint="across all sessions"></gz-tile>
      </div>
    `;
  }

  override readyTemplate(progress: ExerciseProgressDto): RawHtml {
    return html`
      <div class="vstack">
        ${this.#headerTemplate(progress.exercise)} ${this.#summaryTiles(progress)}

        <gz-progress-chart data-testid="progress-chart"></gz-progress-chart>

        <gz-session-table data-testid="session-table"></gz-session-table>

        ${this.#editTemplate(progress.exercise)}
      </div>
    `;
  }
}

await define('gz-exercise-detail', GzExerciseDetailComponent, import.meta.url);
