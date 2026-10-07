import type { DB } from '../../db/db.ts';
import { StatsRepository } from './internal/stats.repository.ts';
import type { Summary } from './ports/stats.ts';

export class StatsFacade {
  readonly #stats: StatsRepository;

  constructor(stats: StatsRepository) {
    this.#stats = stats;
  }

  summary(): Summary {
    return this.#stats.summary();
  }
}

export function createStatsFacade(db: DB): StatsFacade {
  return new StatsFacade(new StatsRepository(db));
}
