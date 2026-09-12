import { json, noContent, pathId, queryInt, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import type { SetFacade, WorkoutFacade } from '../workouts.facade.ts';
import { toWorkout, toWorkoutPage, toWorkoutWithSets } from '../ports/workout.ts';
import { toLiftSet } from '../ports/set.ts';
import { translateToCreateWorkoutDto, translateToEditWorkoutDto } from './workout.translator.ts';
import { translateToCreateSetDto } from './set.translator.ts';

export class WorkoutController {
  constructor(
    private readonly workouts: WorkoutFacade,
    private readonly sets: SetFacade,
  ) {}

  list(req: Request): Response {
    const params = new URL(req.url).searchParams;
    const limit = queryInt(params, 'limit', 50, { min: 1, max: 200 });
    const offset = queryInt(params, 'offset', 0, { min: 0, max: 100000 });
    return json(toWorkoutPage(this.workouts.list(limit, offset), this.workouts.count(), limit, offset));
  }

  async create(req: Request): Promise<Response> {
    const workout = this.workouts.create(translateToCreateWorkoutDto(await readJsonObject(req)));
    return json(toWorkoutWithSets(workout, this.sets.list(workout.id)), 201);
  }

  show(req: ParamRequest): Response {
    const id = pathId(req.params.id, 'workout');
    return json(toWorkoutWithSets(this.workouts.require(id), this.sets.list(id)));
  }

  async update(req: ParamRequest): Promise<Response> {
    const id = pathId(req.params.id, 'workout');
    const dto = translateToEditWorkoutDto(await readJsonObject(req));
    return json(toWorkout(this.workouts.update(id, dto)));
  }

  delete(req: ParamRequest): Response {
    this.workouts.delete(pathId(req.params.id, 'workout'));
    return noContent();
  }

  listSets(req: ParamRequest): Response {
    const id = pathId(req.params.id, 'workout');
    this.workouts.require(id);
    return json(this.sets.list(id).map(toLiftSet));
  }

  async addSet(req: ParamRequest): Promise<Response> {
    const id = pathId(req.params.id, 'workout');
    const dto = translateToCreateSetDto(await readJsonObject(req));
    return json(toLiftSet(this.sets.create(id, dto)), 201);
  }
}
