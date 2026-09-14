import type { RawHtml } from '../../../ui/base.ts';
import { define, GzElement, html, raw } from '../../../ui/base.ts';
import { formatNumber } from '../../../ui/format.ts';

/** Plot area in SVG user units. Only geometry lives in here — never text. */
const W = 600;
const H = 220;
const GRIDLINES = 4;

/** One plotted session. */
export interface ChartPoint {
  /** The x-axis tick, already formatted. */
  label: string;
  value: number;
  /** Extra detail for the point's tooltip. */
  hint?: string;
}

interface ChartScale {
  xFraction: (index: number) => number;
  yFraction: (value: number) => number;
  low: number;
  high: number;
}

/**
 * A minimal line chart drawn as inline SVG.
 *
 * Points are spaced evenly by index rather than by date: for lifting, the
 * question is "how did this session compare to the last one", not how many
 * days sat between them.
 *
 * The axis labels are HTML positioned over the plot, not SVG <text>. Inside a
 * viewBox a font size is measured in user units, so the browser scales the
 * lettering with the chart — tiny on a phone, oversized on a desktop, and
 * never the same size as the surrounding page. Keeping them in HTML lets them
 * inherit the body font like everything else.
 *
 * Usage: `chart.series = [{ label: "5 Jan", value: 82.5, hint: "3 sets" }]`
 */
export class GzChart extends GzElement {
  #series: ChartPoint[] = [];
  #unit = '';

  set series(value: ChartPoint[]) {
    this.#series = Array.isArray(value) ? value.filter((point) => Number.isFinite(point.value)) : [];
    if (this.isConnected) {
      this.render();
    }
  }

  get series(): ChartPoint[] {
    return this.#series;
  }

  set unit(value: string) {
    this.#unit = value;
    if (this.isConnected) {
      this.render();
    }
  }

  /**
   * Positions as fractions of the plot box: 0 is left/top, 1 is right/bottom.
   * Fractions work for both the SVG (multiply by W/H) and the HTML labels
   * (multiply by 100%), so the two always line up.
   */
  #scale(): ChartScale {
    const values = this.#series.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const padding = span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : span * 0.15;
    const low = min - padding;
    const high = max + padding;
    const last = this.#series.length - 1;

    return {
      xFraction: (index) => (last === 0 ? 0.5 : index / last),
      yFraction: (value) => 1 - (value - low) / (high - low),
      low,
      high,
    };
  }

  #gridValues(scale: ChartScale): number[] {
    return Array.from({ length: GRIDLINES + 1 }, (_, step) => scale.low + ((scale.high - scale.low) * step) / GRIDLINES);
  }

  /** At most six labels along the x axis, so they never collide. */
  #xLabelIndexes(): number[] {
    const total = this.#series.length;
    const stride = Math.max(1, Math.ceil(total / 6));
    return this.#series.map((_, index) => index).filter((index) => index % stride === 0 || index === total - 1);
  }

  template(): RawHtml {
    if (this.#series.length === 0) {
      return html`<p class="empty">No sessions logged yet — add a set to start the curve.</p>`;
    }

    const scale = this.#scale();
    const gridValues = this.#gridValues(scale);
    const gridLabels = gridValues.map((value) => formatNumber(value, 1));
    const points = this.#series.map((point, index) => ({
      x: scale.xFraction(index) * W,
      y: scale.yFraction(point.value) * H,
    }));
    const line = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const first = points[0];
    const last = points.at(-1);
    const area = first && last ? `M ${first.x.toFixed(1)},${H} L ${line.replaceAll(' ', ' L ')} L ${last.x.toFixed(1)},${H} Z` : '';

    return html`
      <div class="chart">
        <div class="y-axis">
          <!--
            Every tick is absolutely positioned and so contributes no width.
            This copy of the longest one stays in flow, hidden, to size the
            gutter exactly — no guessed column width to keep in step with the
            font.
          -->
          <span class="sizer">${gridLabels.reduce((a, b) => (b.length > a.length ? b : a), '')}</span>
          ${gridValues.map(
            (value, index) => html` <span class="tick" style="top: ${(scale.yFraction(value) * 100).toFixed(2)}%"> ${gridLabels[index]} </span> `,
          )}
        </div>

        <div class="plot">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Progress over the logged sessions">
            ${gridValues.map((value) => {
              const y = (scale.yFraction(value) * H).toFixed(1);
              return html`<line class="grid" x1="0" y1="${y}" x2="${W}" y2="${y}" />`;
            })}
            <path class="area" d="${area}" />
            ${raw(this.#series.length > 1 ? `<polyline class="line" points="${line}" />` : '')}
          </svg>

          ${this.#series.map((point, index) => {
            const title = `${point.label}: ${formatNumber(point.value)} ${this.#unit}${point.hint ? ` · ${point.hint}` : ''}`;
            return html`
              <span
                class="dot"
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

await define('gz-chart', GzChart, import.meta.url);
