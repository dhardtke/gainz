import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { LEVELS, PROGRESSION_LEVELS } from './progression.ts';
import type { ProgressionLevel } from './progression.ts';

function parseLevel(value: string | null): ProgressionLevel {
  return PROGRESSION_LEVELS.find((level) => level === value) ?? 'none';
}

class GzProgressMarkerComponent extends GzElement {
  static observedAttributes = ['level'];

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.render();
    }
  }

  override template(): RawHtml {
    const level = parseLevel(this.getAttribute('level'));
    return html`<span class="marker" data-level="${level}" aria-hidden="true">${LEVELS[level].icon}</span>`;
  }
}

await define('gz-progress-marker', GzProgressMarkerComponent, import.meta.url);
