import { json, noContent, readJsonObject } from '../../http/http.ts';
import type { SetFacade, WorkoutFacade } from './workouts.facade.ts';
import { toWorkout, toWorkoutPage, toWorkoutWithSets } from './ports/workout.ts';
import { toLiftSet } from './ports/set.ts';
import { fromCreateWorkout, fromEditWorkout } from './internal/workout.mapper.ts';
import { translateToCreateWorkoutDto, translateToEditWorkoutDto } from './internal/workout.translator.ts';
import { fromCreateSet } from './internal/set.mapper.ts';
import { translateToCreateSetDto } from './internal/set.translator.ts';
import { pathId, queryInt } from '../../shared/validate.ts';
import type { RouteTable } from '../../http/routing.ts';
import { guardAll } from '../../http/routing.ts';

export function workoutRoutes(workouts: WorkoutFacade, sets: SetFacade): RouteTable {
  return {
    '/api/workouts': guardAll({
      GET: (req) => {
        const params = new URL(req.url).searchParams;
        const limit = queryInt(params, 'limit', 50, { min: 1, max: 200 });
        const offset = queryInt(params, 'offset', 0, { min: 0, max: 100000 });
        return json(toWorkoutPage(workouts.list(limit, offset), workouts.count(), limit, offset));
      },

      POST: async (req) => {
        const dto = translateToCreateWorkoutDto(await readJsonObject(req));
        // `copyFromWorkoutId` belongs to the request but not to `WorkoutInput` — the repository
        // takes it as a separate argument, so the handler reads it rather than the mapper.
        const workout = workouts.create(fromCreateWorkout(dto), { copyFrom: dto.copyFromWorkoutId });
        return json(toWorkoutWithSets(workout, sets.list(workout.id)), 201);
      },
    }),

    '/api/workouts/:id': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'workout');
        return json(toWorkoutWithSets(workouts.require(id), sets.list(id)));
      },

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'workout');
        const patch = translateToEditWorkoutDto(await readJsonObject(req));
        return json(toWorkout(workouts.update(id, fromEditWorkout(patch))));
      },

      DELETE: (req) => {
        workouts.delete(pathId(req.params.id, 'workout'));
        return noContent();
      },
    }),

    '/api/workouts/:id/sets': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'workout');
        workouts.require(id);
        return json(sets.list(id).map(toLiftSet));
      },

      POST: async (req) => {
        const id = pathId(req.params.id, 'workout');
        return json(toLiftSet(sets.create(id, fromCreateSet(translateToCreateSetDto(await readJsonObject(req))))), 201);
      },
    }),
  };
}
