import type { Iso8601Date } from '../flavors.ts';

/** `GET /stats/summary`: the whole log in eight numbers. */
export interface SummaryDto {
  workoutCount: number;
  setCount: number;
  totalReps: number;
  totalVolume: number;
  exerciseCount: number;
  lastPerformedOn: Iso8601Date | null;
  workoutsLast30Days: number;
  volumeLast30Days: number;
}
