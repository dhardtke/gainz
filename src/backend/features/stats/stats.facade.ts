import type { DB } from '../../db/db.ts';
import { StatsRepository } from './internal/stats.repository.ts';
import type { Summary } from './ports/stats.ts';

/**
 * The stats feature's front door. One method today, because one endpoint asks for it; the point of
 * the module is that the repository behind it is named nowhere else. `StatsController` holds it.
 */
export class StatsFacade {
  constructor(private readonly stats: StatsRepository) {}

  summary(): Summary {
    return this.stats.summary();
  }
}

export function createStatsFacade(db: DB): StatsFacade {
  return new StatsFacade(new StatsRepository(db));
}
