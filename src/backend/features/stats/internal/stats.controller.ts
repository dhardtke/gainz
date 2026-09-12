import { json } from '../../../http/http.ts';
import type { StatsFacade } from '../stats.facade.ts';
import { toSummary } from '../ports/stats.ts';

export class StatsController {
  constructor(private readonly stats: StatsFacade) {}

  summary(): Response {
    return json(toSummary(this.stats.summary()));
  }
}
