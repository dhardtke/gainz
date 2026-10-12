import type { CalendarMonthDto, SummaryDto } from '../../../shared/dto/stats.ts';
import type { Iso8601Month } from '../../../shared/flavors.ts';
import { StatsApi } from './internal/stats.api.ts';

export class StatsFacade {
  readonly #api: StatsApi;

  constructor(api: StatsApi) {
    this.#api = api;
  }

  summary(): Promise<SummaryDto> {
    return this.#api.summary();
  }

  calendar(month: Iso8601Month): Promise<CalendarMonthDto> {
    return this.#api.calendar(month);
  }
}

export const statsFacade = new StatsFacade(new StatsApi());
