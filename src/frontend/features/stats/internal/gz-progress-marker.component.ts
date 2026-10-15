import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { PROGRESSION_LEVELS } from './progression.ts';
import type { ProgressionLevel } from './progression.ts';

const ARROWS: Record<Exclude<ProgressionLevel, 'none'>, string> = {
  up: 'M12 19V5M5 12l7-7 7 7',
  held: 'M5 12h14',
  down: 'M12 5v14M19 12l-7 7-7-7',
};

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
    const arrow =
      level === 'none'
        ? ''
        : html`<svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="${ARROWS[level]}" />
          </svg>`;
    return html`<span class="marker" data-level="${level}" aria-hidden="true">${arrow}</span>`;
  }
}

await define('gz-progress-marker', GzProgressMarkerComponent, import.meta.url);
