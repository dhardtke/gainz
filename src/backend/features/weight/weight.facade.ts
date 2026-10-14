import type { PutWeighInDto } from '../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import type { DB } from '../../db/db.ts';
import { notFound } from '../../http/errors.ts';
import { requiredNumber } from '../../shared/validate.ts';
import { WeighInRepository } from './internal/weigh-in.repository.ts';
import type { WeighIn } from './ports/weigh-in.ts';

export class WeighInFacade {
  readonly #weighIns: WeighInRepository;

  constructor(weighIns: WeighInRepository) {
    this.#weighIns = weighIns;
  }

  list(since: Iso8601Date | null): WeighIn[] {
    return this.#weighIns.list(since);
  }

  latest(): WeighIn | null {
    return this.#weighIns.latest();
  }

  require(date: Iso8601Date): WeighIn {
    const weighIn = this.#weighIns.get(date);
    if (!weighIn) {
      throw notFound('Weigh-in');
    }
    return weighIn;
  }

  put(date: Iso8601Date, dto: PutWeighInDto): { weighIn: WeighIn; created: boolean } {
    return this.#weighIns.put(date, this.#validatePut(dto).weight);
  }

  delete(date: Iso8601Date): void {
    if (!this.#weighIns.delete(date)) {
      throw notFound('Weigh-in');
    }
  }

  #validatePut(dto: PutWeighInDto): PutWeighInDto {
    return {
      weight: requiredNumber(dto, 'weight', { min: 20, max: 500 }),
    };
  }
}

export function createWeighInFacade(db: DB): WeighInFacade {
  return new WeighInFacade(new WeighInRepository(db));
}
