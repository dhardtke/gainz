import type { PutWeighInDto, WeighInDto, WeighInListDto } from '../../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import type { WeighIn } from '../ports/weigh-in.ts';

export function translateToPutWeighInDto(body: Record<string, unknown>): PutWeighInDto {
  return {
    weight: body.weight as number,
  };
}

export function translateToWeighInDto(row: WeighIn): WeighInDto {
  return {
    measuredOn: row.measured_on,
    weight: row.weight,
  };
}

export function translateToWeighInListDto(since: Iso8601Date | null, rows: WeighIn[], latest: WeighIn | null): WeighInListDto {
  return {
    since,
    items: rows.map(translateToWeighInDto),
    latest: latest === null ? null : translateToWeighInDto(latest),
  };
}
