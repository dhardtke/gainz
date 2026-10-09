import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import type { MuscleGroup } from '../../../shared/muscle-group.ts';
import { parseMuscleGroup } from './internal/muscle-groups.ts';

const ICONS: Record<MuscleGroup, RawHtml> = {
  Chest: html`
    <path d="M5 4c2.5 1 4.5 1.5 7 1.5S16.5 5 19 4l1 7c-.5 4-2 7-4 9H8c-2-2-3.5-5-4-9z" />
    <path d="M7 10c1 2.5 4 2.5 5 .5 1 2 4 2 5-.5" />
  `,
  Back: html`
    <path d="M3 5l4-1h10l4 1-4 9-1 6H8l-1-6z" />
    <path d="M12 6v12" />
    <path d="M8 8.5c1 1.5 2 2 3 2M16 8.5c-1 1.5-2 2-3 2" />
  `,
  Shoulders: html`
    <path d="M10 3v4M14 3v4" />
    <path d="M10 7H8a5 5 0 0 0-5 5v8M14 7h2a5 5 0 0 1 5 5v8" />
    <path d="M3 13c2 1 4 .5 5-1.5M21 13c-2 1-4 .5-5-1.5" />
  `,
  Arms: html`
    <path d="M4 19h11a4 4 0 0 0 4-4V6a2 2 0 0 0-2-2h-3v4l1 3c-1.5-3-6-4-9-2l-2 2z" />
    <path d="M9 14c1.5 1 3.5 1 5 0" />
  `,
  Legs: html`<path d="M10 3l5 7.5-3 7.5h5a2 2 0 0 1 2 2v1H8v-3l2.5-7L5 4" />`,
  Core: html`
    <rect x="6" y="3" width="5" height="5" rx="1.5" />
    <rect x="13" y="3" width="5" height="5" rx="1.5" />
    <rect x="6" y="9.5" width="5" height="5" rx="1.5" />
    <rect x="13" y="9.5" width="5" height="5" rx="1.5" />
    <rect x="6" y="16" width="5" height="5" rx="1.5" />
    <rect x="13" y="16" width="5" height="5" rx="1.5" />
  `,
  'Full body': html`
    <circle cx="12" cy="4" r="2" />
    <path d="M12 7v7M4 8l8 1 8-1M12 14l-4 7M12 14l4 7" />
  `,
};

class GzMuscleGroupIconComponent extends GzElement {
  static observedAttributes = ['group', 'label'];

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.render();
    }
  }

  override template(): RawHtml {
    const group = parseMuscleGroup(this.getAttribute('group'));
    if (group === null) {
      return html``;
    }
    const label = this.getAttribute('label');
    const a11y = label ? html`role="img" aria-label="${label}"` : html`aria-hidden="true"`;
    return html`
      <svg
        data-testid="icon"
        data-group="${group}"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ${a11y}
      >
        ${label ? html`<title>${label}</title>` : ''}${ICONS[group]}
      </svg>
    `;
  }

  override afterRender(): void {
    this.hidden = this.$('svg') === null;
  }
}

await define('gz-muscle-group-icon', GzMuscleGroupIconComponent, import.meta.url);
