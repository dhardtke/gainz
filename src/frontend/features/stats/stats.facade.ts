import type { SummaryDto } from '../../../shared/dto/stats.ts';
import { StatsApi } from './internal/stats.api.ts';

export class StatsFacade {
  constructor(private readonly api: StatsApi) {}

  summary(): Promise<SummaryDto> {
    return this.api.summary();
  }
}

export const statsFacade = new StatsFacade(new StatsApi());
