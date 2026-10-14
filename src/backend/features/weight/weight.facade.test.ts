import { describe, expect, test } from 'bun:test';
import { openDatabase } from '../../db/db.ts';
import { thrown } from '../../testing.ts';
import { translateToPutWeighInDto } from './internal/weigh-in.translator.ts';
import { createWeighInFacade } from './weight.facade.ts';

describe('WeighInFacade validation', () => {
  test('put rejects a bad weight on a date without a weigh-in', () => {
    const weighIns = createWeighInFacade(openDatabase(':memory:'));
    const err = thrown(() => weighIns.put('2026-10-13', translateToPutWeighInDto({ weight: 'abc' })));
    expect(err.status).toBe(400);
    expect(err.message).toBe('"weight" must be a number');
    expect(weighIns.list(null)).toEqual([]);
  });

  test('require is a 404 for a date without a weigh-in', () => {
    const weighIns = createWeighInFacade(openDatabase(':memory:'));
    expect(thrown(() => weighIns.require('2026-10-13')).status).toBe(404);
  });
});
