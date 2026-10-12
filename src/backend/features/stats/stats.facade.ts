import type { DB } from '../../db/db.ts';
import { StatsRepository } from './internal/stats.repository.ts';
import type { Iso8601Month } from '../../../shared/flavors.ts';
import type { CalendarDay, Summary } from './ports/stats.ts';

export class StatsFacade {
  readonly #stats: StatsRepository;

  constructor(stats: StatsRepository) {
    this.#stats = stats;
  }

  summary(): Summary {
    return this.#stats.summary();
  }

  calendar(month: Iso8601Month): CalendarDay[] {
    return this.#stats.calendar(month);
  }
}

export function createStatsFacade(db: DB): StatsFacade {
  return new StatsFacade(new StatsRepository(db));
}
