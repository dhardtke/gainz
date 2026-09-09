import { define, GzElement, html } from "../../js/base.js";

/** A single headline number with a label and optional sub-line. */
class GzStatTile extends GzElement {
  static observedAttributes = ["label", "value", "hint"];

  attributeChangedCallback() {
    if (this.isConnected) {
      this.render();
    }
  }

  template() {
    const hint = this.getAttribute("hint");
    return html`
      <article>
        <span class="label">${this.getAttribute("label")}</span>
        <strong class="value">${this.getAttribute("value") ?? "–"}</strong>
        ${hint ? html`<span class="hint">${hint}</span>` : ""}
      </article>
    `;
  }
}

await define("gz-stat-tile", GzStatTile);
