import { define, GzElement, html, raw } from "../base.js";
import { formatNumber } from "../format.js";

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 34, left: 54 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

/**
 * A minimal line chart drawn as inline SVG.
 *
 * Points are spaced evenly by index rather than by date: for lifting, the
 * question is "how did this session compare to the last one", not how many
 * days sat between them.
 *
 * Usage: `chart.series = [{ label: "5 Jan", value: 82.5, hint: "3 sets" }]`
 */
class GzChart extends GzElement {
  static styles = `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
    .grid { stroke: var(--border); stroke-width: 1; }
    .axis-label { fill: var(--text-muted); font-size: 11px; font-family: var(--font); }
    .line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .area { fill: var(--accent); opacity: 0.1; }
    .dot { fill: var(--surface); stroke: var(--accent); stroke-width: 2; }
    .dot-hit { fill: transparent; cursor: pointer; }
    .empty { color: var(--text-muted); text-align: center; padding: 32px 16px; }
  `;

  #series = [];
  #unit = "";

  set series(value) {
    this.#series = Array.isArray(value) ? value.filter((point) => Number.isFinite(Number(point.value))) : [];
    if (this.isConnected) this.render();
  }

  get series() {
    return this.#series;
  }

  set unit(value) {
    this.#unit = value ?? "";
    if (this.isConnected) this.render();
  }

  /** Maps values to a padded y-range so the line never touches the frame. */
  #scale() {
    const values = this.#series.map((point) => Number(point.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const padding = span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : span * 0.15;
    const low = min - padding;
    const high = max + padding;

    return {
      x: (index) =>
        PAD.left + (this.#series.length === 1 ? PLOT_W / 2 : (index / (this.#series.length - 1)) * PLOT_W),
      y: (value) => PAD.top + PLOT_H - ((Number(value) - low) / (high - low)) * PLOT_H,
      low,
      high,
    };
  }

  #gridlines(scale) {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, step) => {
      const value = scale.low + ((scale.high - scale.low) * step) / count;
      const y = scale.y(value);
      return html`
        <line class="grid" x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${WIDTH - PAD.right}" y2="${y.toFixed(1)}" />
        <text class="axis-label" x="${PAD.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">
          ${formatNumber(value, 1)}
        </text>
      `;
    });
  }

  /** Shows at most six x labels so they never collide. */
  #xLabels(scale) {
    const total = this.#series.length;
    const stride = Math.max(1, Math.ceil(total / 6));
    return this.#series.map((point, index) => {
      const isLast = index === total - 1;
      if (index % stride !== 0 && !isLast) return "";
      return html`
        <text class="axis-label" x="${scale.x(index).toFixed(1)}" y="${HEIGHT - PAD.bottom + 18}" text-anchor="middle">
          ${point.label}
        </text>
      `;
    });
  }

  template() {
    if (this.#series.length === 0) {
      return html`<p class="empty">No sessions logged yet — add a set to start the curve.</p>`;
    }

    const scale = this.#scale();
    const coords = this.#series.map((point, index) => [scale.x(index), scale.y(point.value)]);
    const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const baseline = PAD.top + PLOT_H;
    const first = coords[0];
    const last = coords[coords.length - 1];
    const area = `M ${first[0].toFixed(1)},${baseline} L ${line.replaceAll(" ", " L ")} L ${last[0].toFixed(1)},${baseline} Z`;

    return html`
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Progress over the logged sessions">
        ${this.#gridlines(scale)} ${this.#xLabels(scale)}
        <path class="area" d="${area}" />
        ${raw(this.#series.length > 1 ? `<polyline class="line" points="${line}" />` : "")}
        ${this.#series.map((point, index) => {
          const [x, y] = coords[index];
          const title = `${point.label}: ${formatNumber(point.value)} ${this.#unit}${point.hint ? ` · ${point.hint}` : ""}`;
          return html`
            <g>
              <circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" />
              <circle class="dot-hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12">
                <title>${title}</title>
              </circle>
            </g>
          `;
        })}
      </svg>
    `;
  }
}

define("gz-chart", GzChart);
