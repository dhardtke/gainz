import type { RawHtml } from '../html.ts';
import { define, GzElement } from '../base.ts';
import { html } from '../html.ts';

class GzTileComponent extends GzElement {
  static observedAttributes = ['label', 'value', 'hint', 'href'];

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.render();
    }
  }

  override template(): RawHtml {
    const hint = this.getAttribute('hint');
    const href = this.getAttribute('href');
    const label = this.getAttribute('label');
    return html`
      <article class="card ${href ? 'linked' : ''}">
        ${href ? html`<a class="label" href="${href}" data-testid="label">${label}</a>` : html`<span class="label" data-testid="label">${label}</span>`}
        <strong class="value" data-testid="value">${this.getAttribute('value') ?? '–'}</strong>
        ${hint ? html`<span class="hint" data-testid="hint">${hint}</span>` : ''}
      </article>
    `;
  }
}

await define('gz-tile', GzTileComponent, import.meta.url);
