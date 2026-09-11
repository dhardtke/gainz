import { json, noContent, readJsonObject } from '../http.ts';
import type { Repo, WorkoutInput } from '../../db/repos';
import { isPresent, optionalString, pathId, queryInt, requiredDate, requiredInt, today } from '../../shared/validate.ts';
import { readSetBody } from './set.routes.ts';
import type { RouteTable } from './shared.ts';
import { guardAll, MAX_NAME, MAX_NOTES } from './shared.ts';

function readWorkoutBody(body: Record<string, unknown>): WorkoutInput {
  return {
    performed_on: isPresent(body, 'performed_on') ? requiredDate(body, 'performed_on') : today(),
    title: optionalString(body, 'title', MAX_NAME),
    notes: optionalString(body, 'notes', MAX_NOTES),
  };
}

export function workoutRoutes(repo: Repo): RouteTable {
  return {
    '/api/workouts': guardAll({
      GET: (req) => {
        const params = new URL(req.url).searchParams;
        const limit = queryInt(params, 'limit', 50, { min: 1, max: 200 });
        const offset = queryInt(params, 'offset', 0, { min: 0, max: 100000 });
        return json({ items: repo.listWorkouts(limit, offset), total: repo.countWorkouts(), limit, offset });
      },

      POST: async (req) => {
        const body = await readJsonObject(req);
        const workout = repo.createWorkout(readWorkoutBody(body), {
          copyFrom: isPresent(body, 'copy_from_workout_id') ? requiredInt(body, 'copy_from_workout_id', { min: 1 }) : undefined,
        });
        return json({ ...workout, sets: repo.listSets(workout.id) }, 201);
      },
    }),

    '/api/workouts/:id': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'workout');
        return json({ ...repo.requireWorkout(id), sets: repo.listSets(id) });
      },

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'workout');
        const body = await readJsonObject(req);
        const patch: Partial<WorkoutInput> = {};
        if (isPresent(body, 'performed_on')) {
          patch.performed_on = requiredDate(body, 'performed_on');
        }
        if (isPresent(body, 'title')) {
          patch.title = optionalString(body, 'title', MAX_NAME);
        }
        if (isPresent(body, 'notes')) {
          patch.notes = optionalString(body, 'notes', MAX_NOTES);
        }
        return json(repo.updateWorkout(id, patch));
      },

      DELETE: (req) => {
        repo.deleteWorkout(pathId(req.params.id, 'workout'));
        return noContent();
      },
    }),

    '/api/workouts/:id/sets': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'workout');
        repo.requireWorkout(id);
        return json(repo.listSets(id));
      },

      POST: async (req) => {
        const id = pathId(req.params.id, 'workout');
        return json(repo.createSet(id, readSetBody(await readJsonObject(req))), 201);
      },
    }),
  };
}
