import { json, noContent, readJsonObject } from '../http.ts';
import type { Repo } from '../../db/repos';
import type { CreateWorkoutDto, EditWorkoutDto } from '../../../shared/dto';
import { fromCreateSet, fromCreateWorkout, fromEditWorkout, toLiftSet, toWorkout, toWorkoutPage, toWorkoutWithSets } from '../dto';
import { isPresent, optionalString, pathId, queryInt, requiredDate, requiredInt } from '../../shared/validate.ts';
import { readSetBody } from './set.routes.ts';
import type { RouteTable } from './shared.ts';
import { guardAll, MAX_NAME, MAX_NOTES } from './shared.ts';

function readWorkoutBody(body: Record<string, unknown>): CreateWorkoutDto {
  return {
    ...(isPresent(body, 'performedOn') ? { performedOn: requiredDate(body, 'performedOn') } : {}),
    title: optionalString(body, 'title', MAX_NAME),
    notes: optionalString(body, 'notes', MAX_NOTES),
    ...(isPresent(body, 'copyFromWorkoutId') ? { copyFromWorkoutId: requiredInt(body, 'copyFromWorkoutId', { min: 1 }) } : {}),
  };
}

function readEditWorkoutBody(body: Record<string, unknown>): EditWorkoutDto {
  const dto: EditWorkoutDto = {};
  if (isPresent(body, 'performedOn')) {
    dto.performedOn = requiredDate(body, 'performedOn');
  }
  if (isPresent(body, 'title')) {
    dto.title = optionalString(body, 'title', MAX_NAME);
  }
  if (isPresent(body, 'notes')) {
    dto.notes = optionalString(body, 'notes', MAX_NOTES);
  }
  return dto;
}

export function workoutRoutes(repo: Repo): RouteTable {
  return {
    '/api/workouts': guardAll({
      GET: (req) => {
        const params = new URL(req.url).searchParams;
        const limit = queryInt(params, 'limit', 50, { min: 1, max: 200 });
        const offset = queryInt(params, 'offset', 0, { min: 0, max: 100000 });
        return json(toWorkoutPage(repo.listWorkouts(limit, offset), repo.countWorkouts(), limit, offset));
      },

      POST: async (req) => {
        const dto = readWorkoutBody(await readJsonObject(req));
        // `copyFromWorkoutId` belongs to the request but not to `WorkoutInput` — the repository
        // takes it as a separate argument, so the handler reads it rather than the mapper.
        const workout = repo.createWorkout(fromCreateWorkout(dto), { copyFrom: dto.copyFromWorkoutId });
        return json(toWorkoutWithSets(workout, repo.listSets(workout.id)), 201);
      },
    }),

    '/api/workouts/:id': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'workout');
        return json(toWorkoutWithSets(repo.requireWorkout(id), repo.listSets(id)));
      },

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'workout');
        const patch = readEditWorkoutBody(await readJsonObject(req));
        return json(toWorkout(repo.updateWorkout(id, fromEditWorkout(patch))));
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
        return json(repo.listSets(id).map(toLiftSet));
      },

      POST: async (req) => {
        const id = pathId(req.params.id, 'workout');
        return json(toLiftSet(repo.createSet(id, fromCreateSet(readSetBody(await readJsonObject(req))))), 201);
      },
    }),
  };
}
