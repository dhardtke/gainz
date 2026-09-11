/** `GET /stats/summary`: the whole log in eight numbers. */
export interface SummaryDto {
  workoutCount: number;
  setCount: number;
  totalReps: number;
  totalVolume: number;
  exerciseCount: number;
  lastPerformedOn: string | null;
  workoutsLast30Days: number;
  volumeLast30Days: number;
}
