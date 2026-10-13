import type { DB } from '../../db/db.ts';
import { StatsRepository } from './internal/stats.repository.ts';
import type { Iso8601Date, Iso8601Month } from '../../../shared/flavors.ts';
import type { CalendarDay, RecentExercise, Summary } from './ports/stats.ts';

export class StatsFacade {
  readonly #stats: StatsRepository;

  constructor(stats: StatsRepository) {
    this.#stats = stats;
  }

  summary(since: Iso8601Date): Summary {
    return this.#stats.summary(since);
  }

  calendar(month: Iso8601Month): CalendarDay[] {
    return this.#stats.calendar(month);
  }

  recentExercises(since: Iso8601Date): RecentExercise[] {
    return this.#stats.recentExercises(since);
  }
}

export function createStatsFacade(db: DB): StatsFacade {
  return new StatsFacade(new StatsRepository(db));
}
