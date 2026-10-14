import { expect } from 'bun:test';
import type { WeighInDto } from '../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import { body, type TestServer } from '../../testing.ts';

export async function putWeighIn(put: TestServer['put'], measuredOn: Iso8601Date, weight: number): Promise<WeighInDto> {
  const res = await put(`/api/weigh-ins/${measuredOn}`, { weight });
  expect([200, 201]).toContain(res.status);
  return body<WeighInDto>(res);
}
