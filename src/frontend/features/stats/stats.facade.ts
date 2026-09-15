import type { SummaryDto } from '../../../shared/dto/stats.ts';
import { StatsApi } from './internal/stats.api.ts';

export class StatsFacade {
  readonly #api: StatsApi;

  constructor(api: StatsApi) {
    this.#api = api;
  }

  summary(): Promise<SummaryDto> {
    return this.#api.summary();
  }
}

export const statsFacade = new StatsFacade(new StatsApi());
