import type { RawHtml } from '../html.ts';
import { define, GzElement } from '../base.ts';
import { html } from '../html.ts';

/** A single headline number with a label and optional sub-line. */
class GzTileComponent extends GzElement {
  static observedAttributes = ['label', 'value', 'hint'];

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.render();
    }
  }

  override template(): RawHtml {
    const hint = this.getAttribute('hint');
    return html`
      <article class="card">
        <span class="label">${this.getAttribute('label')}</span>
        <strong class="value">${this.getAttribute('value') ?? '–'}</strong>
        ${hint ? html`<span class="hint">${hint}</span>` : ''}
      </article>
    `;
  }
}

await define('gz-tile', GzTileComponent, import.meta.url);
