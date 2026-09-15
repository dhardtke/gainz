import { json } from '../../../http/http.ts';
import type { StatsFacade } from '../stats.facade.ts';
import { translateToSummaryDto } from './stats.translator.ts';

export class StatsController {
  constructor(private readonly stats: StatsFacade) {}

  summary(): Response {
    return json(translateToSummaryDto(this.stats.summary()));
  }
}
