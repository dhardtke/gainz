import type { RawHtml } from './base.ts';
import { define, GzElement, html } from './base.ts';

/** A single headline number with a label and optional sub-line. */
class GzStatTile extends GzElement {
  static observedAttributes = ['label', 'value', 'hint'];

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.render();
    }
  }

  template(): RawHtml {
    const hint = this.getAttribute('hint');
    return html`
      <article>
        <span class="label">${this.getAttribute('label')}</span>
        <strong class="value">${this.getAttribute('value') ?? '–'}</strong>
        ${hint ? html`<span class="hint">${hint}</span>` : ''}
      </article>
    `;
  }
}

await define('gz-stat-tile', GzStatTile, import.meta.url);
