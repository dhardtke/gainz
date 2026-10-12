export type ProgressionLevel = 'up' | 'held' | 'down' | 'none';

export const PROGRESSION_LEVELS: readonly ProgressionLevel[] = ['up', 'held', 'down', 'none'];

export const PROGRESSION_THRESHOLD = 0.025;

export const LEVELS: Record<ProgressionLevel, { icon: string; label: string }> = {
  up: { icon: '▲', label: 'progressed' },
  held: { icon: '■', label: 'held' },
  down: { icon: '▼', label: 'regressed' },
  none: { icon: '', label: 'nothing to compare' },
};

export function progressionLevel(value: number | null): ProgressionLevel {
  if (value === null) {
    return 'none';
  }
  if (value >= PROGRESSION_THRESHOLD) {
    return 'up';
  }
  return value <= -PROGRESSION_THRESHOLD ? 'down' : 'held';
}
