import type { RawHtml } from '../../ui/html.ts';
import { define } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatBodyWeight, formatShortDate, todayIso, UNIT } from '../../ui/format.ts';
import { toast, toastError } from '../../ui/toast.ts';
import { confirmAction } from '../../ui/confirm/confirm.ts';
import { ApiError } from '../../http/errors.ts';
import { GzView } from '../../ui/view.ts';
import type { WeighInDto, WeighInListDto } from '../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import { weighInFacade } from './weight.facade.ts';
import { GzWeighInRowComponent, WEIGH_IN_DELETED_EVENT, WEIGH_IN_SAVED_EVENT } from './internal/gz-weigh-in-row.component.ts';
import { WEIGH_INS_IMPORTED_EVENT } from './internal/gz-weigh-in-import.component.ts';
import { loadSince, parseRange, RANGES, type RangeKey, rangeFrom, rangePath } from './internal/range.ts';
import { trendHint, trendPoints } from './internal/trend.ts';
import type { GzChartComponent } from '../../ui/chart/gz-chart.component.ts';
import '../../ui/chart/gz-chart.component.ts';

interface WeightData extends WeighInListDto {
  today: Iso8601Date;
  range: RangeKey;
}

function isWeighIn(detail: unknown): detail is WeighInDto {
  return typeof detail === 'object' && detail !== null && 'measuredOn' in detail && 'weight' in detail;
}

export class GzWeightComponent extends GzView<WeightData> {
  override loadingText = 'Loading your weigh-ins…';

  #rangeToken = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener(WEIGH_IN_SAVED_EVENT, (event) => {
      if (event instanceof CustomEvent && isWeighIn(event.detail)) {
        const saved = event.detail;
        this.#keepingFocus(() => {
          this.#showItems((items) => items.map((item) => (item.measuredOn === saved.measuredOn ? saved : item)));
        });
      }
    });
    this.root.addEventListener(WEIGH_IN_DELETED_EVENT, (event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        const date = event.detail;
        this.#keepingFocus(() => {
          this.#showItems((items) => items.filter((item) => item.measuredOn !== date));
        });
      }
    });
    this.root.addEventListener(WEIGH_INS_IMPORTED_EVENT, () => {
      void this.reload();
    });
  }

  override async load(): Promise<WeightData> {
    const today = todayIso();
    const range = parseRange(location.search);
    return { ...(await weighInFacade.list(loadSince(range, today))), today, range };
  }

  override handleAction(action: string, element: HTMLElement): void {
    const range = RANGES.find((candidate) => candidate.key === element.dataset.range);
    if (action === 'range' && range && range.key !== this.data?.range) {
      void this.#showRange(range.key);
    }
  }

  // In place rather than navigate(), which would remount the page and drop the form's input.
  async #showRange(range: RangeKey): Promise<void> {
    const token = ++this.#rangeToken;
    const today = todayIso();
    let list: WeighInListDto;
    try {
      list = await weighInFacade.list(loadSince(range, today));
    } catch (error) {
      toastError(error);
      return;
    }
    if (token !== this.#rangeToken || !this.data) {
      return;
    }
    history.pushState(null, '', rangePath(range));
    this.show({ ...list, today, range });
  }

  // `latest` follows the items, unless the deleted one was the last loaded: then only the server knows it.
  #showItems(change: (items: WeighInDto[]) => WeighInDto[]): void {
    const data = this.data;
    if (!data) {
      return;
    }
    const items = change(data.items);
    const newest = items.at(-1) ?? null;
    const latestGone = data.latest !== null && !items.some((item) => item.measuredOn === data.latest?.measuredOn);
    if (latestGone && newest === null) {
      void this.reload();
      return;
    }
    const latest = latestGone || (newest !== null && data.latest !== null && newest.measuredOn >= data.latest.measuredOn) ? newest : data.latest;
    this.show({ ...data, items, latest });
  }

  #keepingFocus(rerender: () => void): void {
    const active = this.root.activeElement;
    const row = active instanceof GzWeighInRowComponent ? active : null;
    const field = row?.focusedField() ?? null;
    rerender();
    if (row && field) {
      this.$<GzWeighInRowComponent>(`gz-weigh-in-row[data-date='${row.dataset.date}']`)?.restoreField(field);
    }
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    const data = this.data;
    if (action !== 'log' || !data || !form.reportValidity()) {
      return;
    }
    const values = this.formData(form);
    const date: Iso8601Date = values.date ?? '';
    const weight = Number(values.weight);

    let existing: WeighInDto | null;
    try {
      existing = await this.#current(data, date);
    } catch (error) {
      toastError(error);
      return;
    }
    if (
      existing &&
      !(await confirmAction({
        title: 'Replace weigh-in?',
        message: `${formatShortDate(date)} · ${formatBodyWeight(existing.weight)} → ${formatBodyWeight(weight)}`,
        confirmLabel: 'Replace',
      }))
    ) {
      return;
    }
    try {
      await weighInFacade.put(date, { weight });
    } catch (error) {
      toastError(error);
      return;
    }
    toast(existing ? 'Weigh-in replaced' : 'Weigh-in logged', 'success');
    await this.reload();
  }

  // The loaded items answer for their range; an older date asks the server, where a 404 means none.
  async #current(data: WeightData, date: Iso8601Date): Promise<WeighInDto | null> {
    if (data.since === null || date >= data.since) {
      return data.items.find((item) => item.measuredOn === date) ?? null;
    }
    try {
      return await weighInFacade.get(date);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  override afterRender(): void {
    const chart = this.$<GzChartComponent>('gz-chart');
    if (chart && this.data) {
      chart.unit = UNIT;
      chart.label = 'Body weight over time';
      chart.empty = 'No weigh-ins in this range.';
      chart.series = trendPoints(this.data.items, rangeFrom(this.data.range, this.data.today)).map((point) => ({
        x: point.date,
        label: formatShortDate(point.date),
        value: point.value,
        trend: point.average,
        hint: point.average === null ? undefined : `7-day average ${formatBodyWeight(point.average)}`,
      }));
    }
    for (const row of this.$$<GzWeighInRowComponent>('gz-weigh-in-row')) {
      row.weighIn = this.data?.items.find((item) => item.measuredOn === row.dataset.date);
    }
  }

  #subtitle({ items, latest, today }: WeightData): RawHtml {
    if (!latest) {
      return html`Log your first weigh-in to start the trend.`;
    }
    return html`<strong>${formatBodyWeight(latest.weight)}</strong> · ${trendHint(items, latest, today)}`;
  }

  #trendTemplate(data: WeightData): RawHtml {
    return html`
      <article class="card vstack gap-2">
        <div class="hstack justify-between gap-2 trend-head">
          <h2>Trend</h2>
          <div class="range-switch">
            ${RANGES.map(
              (candidate) => html`
                <button
                  class="${candidate.key === data.range ? '' : 'outline'}"
                  data-action="range"
                  data-range="${candidate.key}"
                  data-testid="range-${candidate.key}"
                  aria-pressed="${candidate.key === data.range}"
                >
                  ${candidate.label}
                </button>
              `,
            )}
          </div>
        </div>
        <gz-chart data-testid="chart"></gz-chart>
        <p class="text-light">Dots are single weigh-ins; the line is their 7-day average.</p>
      </article>
    `;
  }

  #formTemplate(data: WeightData): RawHtml {
    return html`
      <article class="card">
        <form data-action="log" data-testid="log-form">
          <h2>Log a weigh-in</h2>
          <div class="fields">
            <div class="field">
              <label for="date">Date</label>
              <input id="date" name="date" type="date" value="${data.today}" max="${data.today}" required data-testid="date" />
            </div>
            <div class="field">
              <label for="weight">Weight (${UNIT})</label>
              <input id="weight" name="weight" type="number" step="any" min="20" max="500" value="${data.latest?.weight ?? ''}" required data-testid="weight" />
            </div>
            <button type="submit" data-testid="log">Log</button>
          </div>
        </form>
      </article>
    `;
  }

  #shown({ items, range, today }: WeightData): WeighInDto[] {
    const from = rangeFrom(range, today);
    return from === null ? items : items.filter((item) => item.measuredOn >= from);
  }

  #historyTemplate(items: WeighInDto[]): RawHtml {
    return html`
      <section class="vstack gap-2">
        <h2>History</h2>
        ${
          items.length === 0
            ? html`<p class="empty" data-testid="history-empty">No weigh-ins yet. Log one above.</p>`
            : html`<div data-testid="history">
                ${items.toReversed().map((item) => html`<gz-weigh-in-row data-date="${item.measuredOn}"></gz-weigh-in-row>`)}
              </div>`
        }
      </section>
    `;
  }

  override readyTemplate(data: WeightData): RawHtml {
    return html`
      <div class="vstack">
        <hgroup>
          <h1>Weight</h1>
          <p class="text-light" data-testid="subtitle">${this.#subtitle(data)}</p>
        </hgroup>
        ${this.#formTemplate(data)} ${this.#trendTemplate(data)}
        <gz-weigh-in-import></gz-weigh-in-import>
        ${this.#historyTemplate(this.#shown(data))}
      </div>
    `;
  }
}

await define('gz-weight', GzWeightComponent, import.meta.url);
