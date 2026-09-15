import { json, noContent, pathId, queryInt, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import type { WorkoutId } from '../../../../shared/flavors.ts';
import type { SetFacade, WorkoutFacade } from '../workouts.facade.ts';
import {
  translateToCreateWorkoutDto,
  translateToEditWorkoutDto,
  translateToWorkoutDto,
  translateToWorkoutPageDto,
  translateToWorkoutWithSetsDto,
} from './workout.translator.ts';
import { translateToCreateSetDto, translateToLiftSetDto } from './set.translator.ts';

export class WorkoutController {
  readonly #workouts: WorkoutFacade;

  readonly #sets: SetFacade;

  constructor(workouts: WorkoutFacade, sets: SetFacade) {
    this.#workouts = workouts;
    this.#sets = sets;
  }

  list(req: Request): Response {
    const params = new URL(req.url).searchParams;
    const limit = queryInt(params, 'limit', 50, { min: 1, max: 200 });
    const offset = queryInt(params, 'offset', 0, { min: 0, max: 100000 });
    return json(translateToWorkoutPageDto(this.#workouts.list(limit, offset), this.#workouts.count(), limit, offset));
  }

  async create(req: Request): Promise<Response> {
    const workout = this.#workouts.create(translateToCreateWorkoutDto(await readJsonObject(req)));
    return json(translateToWorkoutWithSetsDto(workout, this.#sets.list(workout.id)), 201);
  }

  show(req: ParamRequest): Response {
    const id: WorkoutId = pathId(req.params.id, 'workout');
    return json(translateToWorkoutWithSetsDto(this.#workouts.require(id), this.#sets.list(id)));
  }

  async update(req: ParamRequest): Promise<Response> {
    const id: WorkoutId = pathId(req.params.id, 'workout');
    const dto = translateToEditWorkoutDto(await readJsonObject(req));
    return json(translateToWorkoutDto(this.#workouts.update(id, dto)));
  }

  delete(req: ParamRequest): Response {
    this.#workouts.delete(pathId(req.params.id, 'workout'));
    return noContent();
  }

  listSets(req: ParamRequest): Response {
    const id: WorkoutId = pathId(req.params.id, 'workout');
    this.#workouts.require(id);
    return json(this.#sets.list(id).map(translateToLiftSetDto));
  }

  async addSet(req: ParamRequest): Promise<Response> {
    const id: WorkoutId = pathId(req.params.id, 'workout');
    const dto = translateToCreateSetDto(await readJsonObject(req));
    return json(translateToLiftSetDto(this.#sets.create(id, dto)), 201);
  }
}
