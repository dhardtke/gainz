import type { Iso8601Date } from '../flavors.ts';

export interface WeighInDto {
  measuredOn: Iso8601Date;
  /** Kilograms, rounded to 0.01. */
  weight: number;
}

export interface PutWeighInDto {
  weight: number;
}

export interface WeighInListDto {
  /** Null when the request asked for every weigh-in. */
  since: Iso8601Date | null;
  /** Oldest first. */
  items: WeighInDto[];
  /** The newest weigh-in overall, in the range or not. */
  latest: WeighInDto | null;
}
