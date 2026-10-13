import type { CalendarMonthDto, RecentExercisesDto, SummaryDto } from '../../../shared/dto/stats.ts';
import type { Iso8601Date, Iso8601Month } from '../../../shared/flavors.ts';
import { StatsApi } from './internal/stats.api.ts';

export class StatsFacade {
  readonly #api: StatsApi;

  constructor(api: StatsApi) {
    this.#api = api;
  }

  summary(since: Iso8601Date): Promise<SummaryDto> {
    return this.#api.summary(since);
  }

  calendar(month: Iso8601Month): Promise<CalendarMonthDto> {
    return this.#api.calendar(month);
  }

  recentExercises(since: Iso8601Date): Promise<RecentExercisesDto> {
    return this.#api.recentExercises(since);
  }
}

export const statsFacade = new StatsFacade(new StatsApi());
