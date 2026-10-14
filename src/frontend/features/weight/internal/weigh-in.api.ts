import type { ImportWeighInsDto, ImportWeighInsResultDto, PutWeighInDto, WeighInDto, WeighInListDto } from '../../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import { get, post, put, remove } from '../../../http/http.ts';

export class WeighInApi {
  list(since: Iso8601Date | null): Promise<WeighInListDto> {
    return get(since === null ? '/weigh-ins' : `/weigh-ins?since=${since}`);
  }

  get(date: Iso8601Date): Promise<WeighInDto> {
    return get(`/weigh-ins/${date}`);
  }

  put(date: Iso8601Date, dto: PutWeighInDto): Promise<WeighInDto> {
    return put(`/weigh-ins/${date}`, dto);
  }

  importAll(dto: ImportWeighInsDto): Promise<ImportWeighInsResultDto> {
    return post('/weigh-ins/import', dto);
  }

  delete(date: Iso8601Date): Promise<null> {
    return remove(`/weigh-ins/${date}`);
  }
}
