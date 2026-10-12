import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatDate, formatDelta, formatNumber, formatVolume, UNIT } from '../../../ui/format.ts';
import type { SessionPointDto } from '../../../../shared/dto/exercise.ts';

function changeTemplate(current: number, earlier: number | undefined, decimals?: number): RawHtml {
  const change = earlier === undefined ? '' : formatDelta(current, earlier);
  const direction = change.startsWith('+') ? 'up' : change.startsWith('−') ? 'down' : '';
  return html`${formatNumber(current, decimals)} ${change ? html`<span class="${direction}" data-testid="change"> ${change}</span>` : ''}`;
}

export class GzSessionTableComponent extends GzElement {
  #sessions: SessionPointDto[] = [];

  #bodyweight = false;

  // Only stored: the parent sets it before `sessions`, which renders.
  set bodyweight(value: boolean) {
    this.#bodyweight = value;
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
              <td class="num">${formatNumber(session.topWeight)} ${UNIT}</td>
              <td class="num">${changeTemplate(session.estOneRepMax, reversed[index + 1]?.estOneRepMax, 1)}</td>
              <td class="num">${formatVolume(session.totalVolume)}</td>
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
            ${this.#bodyweight ? this.#bodyweightRows() : this.#weightedRows()}
          </table>
        </div>
      </article>
    `;
  }
}

await define('gz-session-table', GzSessionTableComponent, import.meta.url);
