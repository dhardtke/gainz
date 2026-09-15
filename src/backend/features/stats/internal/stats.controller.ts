import { json } from '../../../http/http.ts';
import type { StatsFacade } from '../stats.facade.ts';
import { translateToSummaryDto } from './stats.translator.ts';

export class StatsController {
  readonly #stats: StatsFacade;

  constructor(stats: StatsFacade) {
    this.#stats = stats;
  }

  summary(): Response {
    return json(translateToSummaryDto(this.#stats.summary()));
  }
}
