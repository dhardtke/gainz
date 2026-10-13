import type { CalendarMonthDto, RecentExercisesDto, SummaryDto } from '../../../../shared/dto/stats.ts';
import type { Iso8601Date, Iso8601Month } from '../../../../shared/flavors.ts';
import { get } from '../../../http/http.ts';

export class StatsApi {
  summary(since: Iso8601Date): Promise<SummaryDto> {
    return get(`/stats/summary?since=${since}`);
  }

  calendar(month: Iso8601Month): Promise<CalendarMonthDto> {
    return get(`/stats/calendar?month=${month}`);
  }

  recentExercises(since: Iso8601Date): Promise<RecentExercisesDto> {
    return get(`/stats/exercises?since=${since}`);
  }
}
