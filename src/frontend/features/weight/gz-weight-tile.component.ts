import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { formatBodyWeight, todayIso } from '../../ui/format.ts';
import type { WeighInListDto } from '../../../shared/dto/weight.ts';
import { trendHint } from './internal/trend.ts';
import '../../ui/tile/gz-tile.component.ts';

// At the feature's root because the dashboard renders it; `null` is a failed load.
export class GzWeightTileComponent extends GzElement {
  #list: WeighInListDto | null = null;

  set list(value: WeighInListDto | null) {
    this.#list = value;
    if (this.isConnected) {
      this.render();
    }
  }

  override template(): RawHtml {
    const latest = this.#list?.latest ?? null;
    const hint = latest === null ? (this.#list === null ? '' : 'Log your weight') : trendHint(this.#list?.items ?? [], latest, todayIso());
    return html`
      <gz-tile
        label="Body weight"
        href="/weight"
        value="${latest === null ? '–' : formatBodyWeight(latest.weight)}"
        hint="${hint ?? ''}"
        data-testid="tile"
      ></gz-tile>
    `;
  }
}

await define('gz-weight-tile', GzWeightTileComponent, import.meta.url);
