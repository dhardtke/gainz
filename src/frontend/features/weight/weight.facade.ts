import type { ImportWeighInsDto, ImportWeighInsResultDto, PutWeighInDto, WeighInDto, WeighInListDto } from '../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import { WeighInApi } from './internal/weigh-in.api.ts';

export class WeighInFacade {
  readonly #api: WeighInApi;

  constructor(api: WeighInApi) {
    this.#api = api;
  }

  list(since: Iso8601Date | null): Promise<WeighInListDto> {
    return this.#api.list(since);
  }

  get(date: Iso8601Date): Promise<WeighInDto> {
    return this.#api.get(date);
  }

  put(date: Iso8601Date, dto: PutWeighInDto): Promise<WeighInDto> {
    return this.#api.put(date, dto);
  }

  importAll(dto: ImportWeighInsDto): Promise<ImportWeighInsResultDto> {
    return this.#api.importAll(dto);
  }

  delete(date: Iso8601Date): Promise<null> {
    return this.#api.delete(date);
  }
}

export const weighInFacade = new WeighInFacade(new WeighInApi());
