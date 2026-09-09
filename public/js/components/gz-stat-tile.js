import { define, GzElement, html } from "../base.js";

/** A single headline number with a label and optional sub-line. */
class GzStatTile extends GzElement {
  static observedAttributes = ["label", "value", "hint"];

  static styles = `
    :host { display: block; }
    .tile {
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 600; }
    .value { font-size: 1.5rem; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
    .hint { font-size: 0.82rem; color: var(--text-muted); }
  `;

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  template() {
    const hint = this.getAttribute("hint");
    return html`
      <div class="tile">
        <span class="label">${this.getAttribute("label")}</span>
        <strong class="value">${this.getAttribute("value") ?? "–"}</strong>
        ${hint ? html`<span class="hint">${hint}</span>` : ""}
      </div>
    `;
  }
}

define("gz-stat-tile", GzStatTile);
