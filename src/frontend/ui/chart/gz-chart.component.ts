import type { RawHtml } from '../html.ts';
import { define, GzElement } from '../base.ts';
import { html, raw } from '../html.ts';
import { formatNumber } from '../format.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';

const W = 600;
const H = 220;
const GRIDLINES = 4;
const DAY_MS = 86_400_000;

export interface ChartPoint {
  label: string;
  value: number;
  hint?: string;
  /** Spaces the points by date when every point has one. */
  x?: Iso8601Date;
  /** When any point has one, the line and area follow the trend and the dots stay at `value`. */
  trend?: number | null;
}

function dayNumber(date: Iso8601Date): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / DAY_MS;
}

interface ChartScale {
  xFraction: (index: number) => number;
  yFraction: (value: number) => number;
  low: number;
  high: number;
}

// Spaced by index unless every point has a date; labels are HTML so viewBox scaling doesn't resize their text.
export class GzChartComponent extends GzElement {
  #series: ChartPoint[] = [];
  #unit = '';
  #empty = 'No sessions logged yet — add a set to start the curve.';
  #label = 'Progress over the logged sessions';

  set series(value: ChartPoint[]) {
    this.#series = Array.isArray(value) ? value.filter((point) => Number.isFinite(point.value)) : [];
    if (this.isConnected) {
      this.render();
    }
  }

  get series(): ChartPoint[] {
    return this.#series;
  }

  // Only stored, like `empty` and `label`: the parent sets them before `series`, which renders.
  set unit(value: string) {
    this.#unit = value;
  }

  set empty(value: string) {
    this.#empty = value;
  }

  set label(value: string) {
    this.#label = value;
  }

  #trends(): { index: number; value: number }[] {
    return this.#series.flatMap((point, index) => (typeof point.trend === 'number' && Number.isFinite(point.trend) ? [{ index, value: point.trend }] : []));
  }

  #xFraction(): (index: number) => number {
    const last = this.#series.length - 1;
    const days = this.#series.map((point) => (point.x === undefined ? Number.NaN : dayNumber(point.x)));
    if (days.every((day) => Number.isFinite(day))) {
      const first = days[0] ?? 0;
      const span = (days.at(-1) ?? first) - first;
      return (index) => (span === 0 ? 0.5 : ((days[index] ?? first) - first) / span);
    }
    return (index) => (last === 0 ? 0.5 : index / last);
  }

  #scale(): ChartScale {
    const values = [...this.#series.map((point) => point.value), ...this.#trends().map((trend) => trend.value)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const padding = span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : span * 0.15;
    const low = min - padding;
    const high = max + padding;

    return {
      xFraction: this.#xFraction(),
      yFraction: (value) => 1 - (value - low) / (high - low),
      low,
      high,
    };
  }

  #gridValues(scale: ChartScale): number[] {
    return Array.from({ length: GRIDLINES + 1 }, (_, step) => scale.low + ((scale.high - scale.low) * step) / GRIDLINES);
  }

  #xLabelIndexes(): number[] {
    const total = this.#series.length;
    const stride = Math.max(1, Math.ceil(total / 6));
    return this.#series.map((_, index) => index).filter((index) => index % stride === 0 || index === total - 1);
  }

  override template(): RawHtml {
    if (this.#series.length === 0) {
      return html`<p class="empty" data-testid="empty">${this.#empty}</p>`;
    }

    const scale = this.#scale();
    const gridValues = this.#gridValues(scale);
    const gridLabels = gridValues.map((value) => formatNumber(value, 1));
    const trends = this.#trends();
    const through = trends.length > 0 ? trends : this.#series.map((point, index) => ({ index, value: point.value }));
    const points = through.map(({ index, value }) => ({
      x: scale.xFraction(index) * W,
      y: scale.yFraction(value) * H,
    }));
    const line = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const first = points[0];
    const last = points.at(-1);
    const area = first && last ? `M ${first.x.toFixed(1)},${H} L ${line.replaceAll(' ', ' L ')} L ${last.x.toFixed(1)},${H} Z` : '';

    return html`
      <div class="chart">
        <div class="y-axis">
          <!-- A hidden in-flow copy of the longest tick sizes the gutter; ticks are absolute. -->
          <span class="sizer">${gridLabels.reduce((a, b) => (b.length > a.length ? b : a), '')}</span>
          ${gridValues.map(
            (value, index) => html` <span class="tick" style="top: ${(scale.yFraction(value) * 100).toFixed(2)}%"> ${gridLabels[index]} </span> `,
          )}
        </div>

        <div class="plot">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${this.#label}">
            ${gridValues.map((value) => {
              const y = (scale.yFraction(value) * H).toFixed(1);
              return html`<line class="grid" x1="0" y1="${y}" x2="${W}" y2="${y}" />`;
            })}
            <path class="area" d="${area}" />
            ${raw(points.length > 1 ? `<polyline class="line" points="${line}" data-testid="line" />` : '')}
          </svg>

          ${this.#series.map((point, index) => {
            const title = `${point.label}: ${formatNumber(point.value)} ${this.#unit}${point.hint ? ` · ${point.hint}` : ''}`;
            return html`
              <span
                class="dot"
                data-testid="dot"
                style="left: ${(scale.xFraction(index) * 100).toFixed(2)}%; top: ${(scale.yFraction(point.value) * 100).toFixed(2)}%"
                title="${title}"
              ></span>
            `;
          })}
        </div>

        <div class="x-axis">
          ${this.#xLabelIndexes().map(
            (index) => html` <span class="tick" style="left: ${(scale.xFraction(index) * 100).toFixed(2)}%"> ${this.#series[index]?.label} </span> `,
          )}
        </div>
      </div>
    `;
  }
}

await define('gz-chart', GzChartComponent, import.meta.url);
