import { json, noContent, pathId, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import type { LiftSetId } from '../../../../shared/flavors.ts';
import type { SetFacade } from '../workouts.facade.ts';
import { translateToEditSetDto, translateToLiftSetDto, translateToMoveSetDto } from './set.translator.ts';

export class SetController {
  readonly #sets: SetFacade;

  constructor(sets: SetFacade) {
    this.#sets = sets;
  }

  show(req: ParamRequest): Response {
    return json(translateToLiftSetDto(this.#sets.require(pathId(req.params.id, 'set'))));
  }

  async update(req: ParamRequest): Promise<Response> {
    const id: LiftSetId = pathId(req.params.id, 'set');
    const dto = translateToEditSetDto(await readJsonObject(req));
    return json(translateToLiftSetDto(this.#sets.update(id, dto)));
  }

  async move(req: ParamRequest): Promise<Response> {
    const id: LiftSetId = pathId(req.params.id, 'set');
    const dto = translateToMoveSetDto(await readJsonObject(req));
    return json(this.#sets.move(id, dto).map(translateToLiftSetDto));
  }

  delete(req: ParamRequest): Response {
    this.#sets.delete(pathId(req.params.id, 'set'));
    return noContent();
  }
}
