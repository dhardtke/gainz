import type { ImportWeighInsDto, PutWeighInDto, WeighInDto } from '../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import type { DB } from '../../db/db.ts';
import { badRequest, notFound } from '../../http/errors.ts';
import { isRealDate, requiredNumber } from '../../shared/validate.ts';
import { WeighInRepository } from './internal/weigh-in.repository.ts';
import type { WeighIn } from './ports/weigh-in.ts';

const MIN_WEIGHT = 20;
const MAX_WEIGHT = 500;
const MAX_IMPORT = 10000;

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

  importAll(dto: ImportWeighInsDto): { created: number; replaced: number } {
    return this.#weighIns.putAll(this.#validateImport(dto).items.map((item) => ({ measured_on: item.measuredOn, weight: item.weight })));
  }

  delete(date: Iso8601Date): void {
    if (!this.#weighIns.delete(date)) {
      throw notFound('Weigh-in');
    }
  }

  #validatePut(dto: PutWeighInDto): PutWeighInDto {
    return {
      weight: requiredNumber(dto, 'weight', { min: MIN_WEIGHT, max: MAX_WEIGHT }),
    };
  }

  #validateImport(dto: ImportWeighInsDto): ImportWeighInsDto {
    const items: unknown = dto.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_IMPORT) {
      throw badRequest(`"items" must be a list of 1 to ${MAX_IMPORT} weigh-ins`);
    }
    const dates = new Set<Iso8601Date>();
    return {
      items: (items as unknown[]).map((item, index) => {
        const weighIn = this.#validateImportItem(item, `items[${index}]`);
        if (dates.has(weighIn.measuredOn)) {
          throw badRequest(`"items" must not repeat the date ${weighIn.measuredOn}`);
        }
        dates.add(weighIn.measuredOn);
        return weighIn;
      }),
    };
  }

  #validateImportItem(item: unknown, field: string): WeighInDto {
    if (typeof item !== 'object' || item === null) {
      throw badRequest(`"${field}" must be an object`);
    }
    const { measuredOn, weight }: { measuredOn?: unknown; weight?: unknown } = item;
    if (typeof measuredOn !== 'string' || !isRealDate(measuredOn)) {
      throw badRequest(`"${field}.measuredOn" must be a date in YYYY-MM-DD format`);
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      throw badRequest(`"${field}.weight" on ${measuredOn} must be a number between ${MIN_WEIGHT} and ${MAX_WEIGHT}`);
    }
    return { measuredOn, weight: Math.round(weight * 100) / 100 };
  }
}

export function createWeighInFacade(db: DB): WeighInFacade {
  return new WeighInFacade(new WeighInRepository(db));
}
