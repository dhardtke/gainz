import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatDate, formatDelta, formatKilograms, formatNumber, formatVolume } from '../../../ui/format.ts';
import type { SessionPointDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseKind } from '../../../../shared/exercise-kind.ts';

// `up` and `down` color a change as progress and regress, so with `lowerIsBetter` a drop is `up`.
function changeTemplate(current: number, earlier: number | undefined, decimals?: number, lowerIsBetter = false): RawHtml {
  const change = earlier === undefined ? '' : formatDelta(current, earlier);
  const rose = change.startsWith('+');
  const fell = change.startsWith('−');
  const direction = (lowerIsBetter ? fell : rose) ? 'up' : (lowerIsBetter ? rose : fell) ? 'down' : '';
  return html`${formatNumber(current, decimals)} ${change ? html`<span class="${direction}" data-testid="change"> ${change}</span>` : ''}`;
}

interface Column {
  label: string;
  cell: (session: SessionPointDto, earlier: SessionPointDto | undefined) => unknown;
}

const SETS: Column = { label: 'Sets', cell: (session) => session.setCount };
const REPS: Column = { label: 'Reps', cell: (session) => session.totalReps };

const COLUMNS: Record<ExerciseKind, Column[]> = {
  bodyweight: [
    SETS,
    { label: 'Top set', cell: (session) => session.topReps },
    { label: 'Reps', cell: (session, earlier) => changeTemplate(session.totalReps, earlier?.totalReps) },
  ],
  assisted: [
    SETS,
    REPS,
    { label: 'Least assist', cell: (session, earlier) => changeTemplate(session.leastWeight, earlier?.leastWeight, undefined, true) },
    { label: 'Effective volume', cell: (session) => (session.effectiveVolume === null ? '–' : formatVolume(session.effectiveVolume)) },
  ],
  weighted: [
    SETS,
    REPS,
    { label: 'Top set', cell: (session) => formatKilograms(session.topWeight) },
    { label: 'Est. 1RM', cell: (session, earlier) => changeTemplate(session.estOneRepMax, earlier?.estOneRepMax, 1) },
    { label: 'Volume', cell: (session) => formatVolume(session.totalVolume) },
  ],
};

export class GzSessionTableComponent extends GzElement {
  #sessions: SessionPointDto[] = [];

  #kind: ExerciseKind = 'weighted';

  // Only stored: the parent sets it before `sessions`, which renders.
  set kind(value: ExerciseKind) {
    this.#kind = value;
  }

  set sessions(value: SessionPointDto[]) {
    this.#sessions = value;
    if (this.isConnected) {
      this.render();
    }
  }

  #rows(): RawHtml {
    const columns = COLUMNS[this.#kind];
    return html`
      <thead>
        <tr>
          <th scope="col">Date</th>
          ${columns.map((column) => html`<th scope="col" class="num">${column.label}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${[...this.#sessions].reverse().map(
          (session, index, reversed) => html`
            <tr data-testid="session">
              <td class="name nowrap">
                <a href="/workouts/${session.workoutId}" data-testid="workout-link">${formatDate(session.performedOn)}</a>
              </td>
              ${columns.map((column) => html`<td class="num">${column.cell(session, reversed[index + 1])}</td>`)}
            </tr>
          `,
        )}
      </tbody>
    `;
  }

  override template(): RawHtml {
    if (this.#sessions.length === 0) {
      return html`<p class="empty" data-testid="empty">No sets logged for this exercise yet.</p>`;
    }

    return html`
      <article class="card vstack gap-2">
        <h2>Session history</h2>
        <div class="table">
          <table data-testid="table">
            ${this.#rows()}
          </table>
        </div>
      </article>
    `;
  }
}

await define('gz-session-table', GzSessionTableComponent, import.meta.url);
