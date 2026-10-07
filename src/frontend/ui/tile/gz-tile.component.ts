import type { RawHtml } from '../html.ts';
import { define, GzElement } from '../base.ts';
import { html } from '../html.ts';

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
        <span class="label" data-testid="label">${this.getAttribute('label')}</span>
        <strong class="value" data-testid="value">${this.getAttribute('value') ?? '–'}</strong>
        ${hint ? html`<span class="hint" data-testid="hint">${hint}</span>` : ''}
      </article>
    `;
  }
}

await define('gz-tile', GzTileComponent, import.meta.url);
