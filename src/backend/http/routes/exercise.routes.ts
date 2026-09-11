import { json, noContent, readJsonObject } from '../http.ts';
import type { ExerciseInput, Repo } from '../../db/repo';
import { isPresent, optionalString, pathId, requiredString } from '../../shared/validate.ts';
import type { RouteTable } from './shared.ts';
import { guardAll, MAX_NAME, MAX_NOTES } from './shared.ts';

function readExerciseBody(body: Record<string, unknown>): ExerciseInput {
  return {
    name: requiredString(body, 'name', MAX_NAME),
    muscle_group: optionalString(body, 'muscle_group', 60),
    notes: optionalString(body, 'notes', MAX_NOTES),
  };
}

export function exerciseRoutes(repo: Repo): RouteTable {
  return {
    '/api/exercises': guardAll({
      GET: () => json(repo.listExercises()),
      POST: async (req) => json(repo.createExercise(readExerciseBody(await readJsonObject(req))), 201),
    }),

    '/api/exercises/:id': guardAll({
      GET: (req) => json(repo.requireExercise(pathId(req.params.id, 'exercise'))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'exercise');
        const body = await readJsonObject(req);
        const patch: Partial<ExerciseInput> = {};
        if (isPresent(body, 'name')) {
          patch.name = requiredString(body, 'name', MAX_NAME);
        }
        if (isPresent(body, 'muscle_group')) {
          patch.muscle_group = optionalString(body, 'muscle_group', 60);
        }
        if (isPresent(body, 'notes')) {
          patch.notes = optionalString(body, 'notes', MAX_NOTES);
        }
        return json(repo.updateExercise(id, patch));
      },

      DELETE: (req) => {
        repo.deleteExercise(pathId(req.params.id, 'exercise'));
        return noContent();
      },
    }),

    '/api/exercises/:id/progress': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'exercise');
        return json({
          exercise: repo.requireExercise(id),
          sessions: repo.exerciseProgress(id),
          best_set: repo.exerciseBestSet(id),
        });
      },
    }),
  };
}
