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

  #bodyweightRows(): RawHtml {
    return html`
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col" class="num">Sets</th>
          <th scope="col" class="num">Top set</th>
          <th scope="col" class="num">Reps</th>
        </tr>
      </thead>
      <tbody>
        ${[...this.#sessions].reverse().map(
          (session, index, reversed) => html`
            <tr data-testid="session">
              <td class="name nowrap">
                <a href="/workouts/${session.workoutId}" data-testid="workout-link">${formatDate(session.performedOn)}</a>
              </td>
              <td class="num">${session.setCount}</td>
              <td class="num">${session.topReps}</td>
              <td class="num">${changeTemplate(session.totalReps, reversed[index + 1]?.totalReps)}</td>
            </tr>
          `,
        )}
      </tbody>
    `;
  }

  #assistedRows(): RawHtml {
    return html`<thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col" class="num">Sets</th>
          <th scope="col" class="num">Reps</th>
          <th scope="col" class="num">Least assist</th>
          <th scope="col" class="num">Effective volume</th>
        </tr>
      </thead>
      <tbody>
        ${[...this.#sessions].reverse().map(
          (session, index, reversed) => html`
            <tr data-testid="session">
              <td class="name nowrap">
                <a href="/workouts/${session.workoutId}" data-testid="workout-link">${formatDate(session.performedOn)}</a>
              </td>
              <td class="num">${session.setCount}</td>
              <td class="num">${session.totalReps}</td>
              <td class="num">${changeTemplate(session.leastWeight, reversed[index + 1]?.leastWeight, undefined, true)}</td>
              <td class="num">${session.effectiveVolume === null ? '–' : formatVolume(session.effectiveVolume)}</td>
            </tr>
          `,
        )}
      </tbody> `;
  }

  #weightedRows(): RawHtml {
    return html`
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col" class="num">Sets</th>
          <th scope="col" class="num">Reps</th>
          <th scope="col" class="num">Top set</th>
          <th scope="col" class="num">Est. 1RM</th>
          <th scope="col" class="num">Volume</th>
        </tr>
      </thead>
      <tbody>
        ${[...this.#sessions].reverse().map(
          (session, index, reversed) => html`
            <tr data-testid="session">
              <td class="name nowrap">
                <a href="/workouts/${session.workoutId}" data-testid="workout-link">${formatDate(session.performedOn)}</a>
              </td>
              <td class="num">${session.setCount}</td>
              <td class="num">${session.totalReps}</td>
              <td class="num">${formatKilograms(session.topWeight)}</td>
              <td class="num">${changeTemplate(session.estOneRepMax, reversed[index + 1]?.estOneRepMax, 1)}</td>
              <td class="num">${formatVolume(session.totalVolume)}</td>
            </tr>
          `,
        )}
      </tbody>
    `;
  }

  #rows(): RawHtml {
    if (this.#kind === 'bodyweight') {
      return this.#bodyweightRows();
    }
    return this.#kind === 'assisted' ? this.#assistedRows() : this.#weightedRows();
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
