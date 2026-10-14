import { json, noContent, optionalQueryDate, pathDate, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import type { WeighInFacade } from '../weight.facade.ts';
import { translateToPutWeighInDto, translateToWeighInDto, translateToWeighInListDto } from './weigh-in.translator.ts';

export class WeighInController {
  readonly #weighIns: WeighInFacade;

  constructor(weighIns: WeighInFacade) {
    this.#weighIns = weighIns;
  }

  list(req: Request): Response {
    const since = optionalQueryDate(new URL(req.url).searchParams, 'since');
    return json(translateToWeighInListDto(since, this.#weighIns.list(since), this.#weighIns.latest()));
  }

  get(req: ParamRequest): Response {
    return json(translateToWeighInDto(this.#weighIns.require(pathDate(req.params.date))));
  }

  async put(req: ParamRequest): Promise<Response> {
    const date = pathDate(req.params.date);
    const dto = translateToPutWeighInDto(await readJsonObject(req));
    const { weighIn, created } = this.#weighIns.put(date, dto);
    return json(translateToWeighInDto(weighIn), created ? 201 : 200);
  }

  delete(req: ParamRequest): Response {
    this.#weighIns.delete(pathDate(req.params.date));
    return noContent();
  }
}
