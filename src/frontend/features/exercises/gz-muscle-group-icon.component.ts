import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import type { MuscleGroup } from '../../../shared/muscle-group.ts';
import { parseMuscleGroup } from './internal/muscle-groups.ts';

const BODY = html`
  <circle cx="12" cy="3" r="2.2" />
  <path
    d="M10.6 6C9.6 6.3 8.4 6.4 7.4 6.6 6.1 6.9 5.5 7.8 5.4 9L4.7 14A.85.85 0 0 0 6.4 14.2L7.3 10.4Q7.6 9.6 7.9 10.4L8.3 13.8 8.8 21.9A1.1 1.1 0 0 0 11 21.9L11.4 16.6Q12 15.6 12.6 16.6L13 21.9A1.1 1.1 0 0 0 15.2 21.9L15.7 13.8 16.1 10.4Q16.4 9.6 16.7 10.4L17.6 14.2A.85.85 0 0 0 19.3 14L18.6 9C18.5 7.8 17.9 6.9 16.6 6.6 15.6 6.4 14.4 6.3 13.4 6Q12 6.6 10.6 6Z"
  />
`;

// The region each group trains, filled inside the outlined body.
const REGIONS: Record<MuscleGroup, RawHtml> = {
  Chest: html`<path
    d="M8 7.4C9.2 7.1 10.4 7 11.4 7V9.6C11.4 10.4 10.6 10.7 9.8 10.6 8.9 10.5 8.2 10 8 9.3ZM16 7.4C14.8 7.1 13.6 7 12.6 7V9.6C12.6 10.4 13.4 10.7 14.2 10.6 15.1 10.5 15.8 10 16 9.3Z"
  />`,
  Back: html`<path
    d="M8 7.3H16C16.2 7.3 16.3 7.5 16.2 7.7L15.5 11C15.4 11.4 15.2 11.7 14.8 12L12.6 13.5C12.2 13.8 11.8 13.8 11.4 13.5L9.2 12C8.8 11.7 8.6 11.4 8.5 11L7.8 7.7C7.7 7.5 7.8 7.3 8 7.3Z"
  />`,
  Shoulders: html`<path
    d="M7.4 6.6C6.1 6.9 5.5 7.8 5.4 9L5.3 9.7C6.5 10 7.6 9.5 8.1 8.5 8.4 7.8 8.1 7 7.4 6.6ZM16.6 6.6C17.9 6.9 18.5 7.8 18.6 9L18.7 9.7C17.5 10 16.4 9.5 15.9 8.5 15.6 7.8 15.9 7 16.6 6.6Z"
  />`,
  Arms: html`<path
    d="M5.4 9 4.7 14A.85.85 0 0 0 6.4 14.2L7.4 10.2C7.5 9.2 7.1 8.4 6.4 8.1 5.9 8.2 5.5 8.5 5.4 9ZM18.6 9 19.3 14A.85.85 0 0 1 17.6 14.2L16.6 10.2C16.5 9.2 16.9 8.4 17.6 8.1 18.1 8.2 18.5 8.5 18.6 9Z"
  />`,
  Legs: html`<path d="M8.3 13.8 8.8 21.9A1.1 1.1 0 0 0 11 21.9L11.4 16.6Q12 15.6 12.6 16.6L13 21.9A1.1 1.1 0 0 0 15.2 21.9L15.7 13.8Q12 14.4 8.3 13.8Z" />`,
  Core: html`<rect x="9.4" y="10.9" width="5.2" height="2.7" rx="1" />`,
  'Full body': BODY,
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
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        ${a11y}
      >
        ${label ? html`<title>${label}</title>` : ''}${BODY}
        <g class="region">${REGIONS[group]}</g>
      </svg>
    `;
  }

  override afterRender(): void {
    this.hidden = this.$('svg') === null;
  }
}

await define('gz-muscle-group-icon', GzMuscleGroupIconComponent, import.meta.url);
