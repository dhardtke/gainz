import type { Iso8601Date } from '../../../../shared/flavors.ts';

export interface WeighIn {
  measured_on: Iso8601Date;
  weight: number;
}
