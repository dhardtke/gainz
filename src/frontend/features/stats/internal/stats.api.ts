import type { SummaryDto } from '../../../../shared/dto/stats.ts';
import { get } from '../../../http/http.ts';

export class StatsApi {
  summary(): Promise<SummaryDto> {
    return get('/stats/summary');
  }
}
