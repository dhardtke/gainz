import { expect, test } from 'bun:test';
import { progressionLevel } from './progression.ts';
import type { ProgressionLevel } from './progression.ts';

test.each<[number | null, ProgressionLevel]>([
  [null, 'none'],
  [0.025, 'up'],
  [0.0249, 'held'],
  [0, 'held'],
  [-0.0249, 'held'],
  [-0.025, 'down'],
])('progressionLevel(%p) is %p', (value, level) => {
  expect(progressionLevel(value)).toBe(level);
});
