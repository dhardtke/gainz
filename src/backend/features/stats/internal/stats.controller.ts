import { json, queryMonth } from '../../../http/http.ts';
import type { StatsFacade } from '../stats.facade.ts';
import { translateToCalendarMonthDto, translateToSummaryDto } from './stats.translator.ts';

export class StatsController {
  readonly #stats: StatsFacade;

  constructor(stats: StatsFacade) {
    this.#stats = stats;
  }

  summary(): Response {
    return json(translateToSummaryDto(this.#stats.summary()));
  }

  calendar(req: Request): Response {
    const month = queryMonth(new URL(req.url).searchParams, 'month');
    return json(translateToCalendarMonthDto(month, this.#stats.calendar(month)));
  }
}
