import { json, noContent, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import { pathId } from '../../../shared/validate.ts';
import type { SetFacade } from '../workouts.facade.ts';
import { toLiftSet } from '../ports/set.ts';
import { fromEditSet } from './set.mapper.ts';
import { translateToEditSetDto } from './set.translator.ts';

export class SetController {
  constructor(private readonly sets: SetFacade) {}

  show(req: ParamRequest): Response {
    return json(toLiftSet(this.sets.require(pathId(req.params.id, 'set'))));
  }

  async update(req: ParamRequest): Promise<Response> {
    const id = pathId(req.params.id, 'set');
    const patch = translateToEditSetDto(await readJsonObject(req));
    return json(toLiftSet(this.sets.update(id, fromEditSet(patch))));
  }

  delete(req: ParamRequest): Response {
    this.sets.delete(pathId(req.params.id, 'set'));
    return noContent();
  }
}
