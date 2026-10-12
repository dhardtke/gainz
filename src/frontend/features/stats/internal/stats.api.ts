import type { CalendarMonthDto, SummaryDto } from '../../../../shared/dto/stats.ts';
import type { Iso8601Month } from '../../../../shared/flavors.ts';
import { get } from '../../../http/http.ts';

export class StatsApi {
  summary(): Promise<SummaryDto> {
    return get('/stats/summary');
  }

  calendar(month: Iso8601Month): Promise<CalendarMonthDto> {
    return get(`/stats/calendar?month=${month}`);
  }
}
