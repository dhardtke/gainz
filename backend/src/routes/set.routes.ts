import { json, noContent, readJsonObject } from '../http';
import type { Repo, SetInput } from '../repo';
import { isPresent, optionalString, pathId, requiredInt, requiredNumber } from '../validate';
import type { RouteTable } from './shared';
import { guardAll, MAX_NOTES } from './shared';

/** Exported because `POST /api/workouts/:id/sets` creates sets too, and lives in workout.routes.ts. */
export function readSetBody(body: Record<string, unknown>): SetInput {
  return {
    exercise_id: requiredInt(body, 'exercise_id', { min: 1 }),
    reps: requiredInt(body, 'reps', { min: 1, max: 1000 }),
    weight: requiredNumber(body, 'weight', { min: 0, max: 100000 }),
    notes: optionalString(body, 'notes', MAX_NOTES),
    ...(isPresent(body, 'position') ? { position: requiredInt(body, 'position', { min: 0 }) } : {}),
  };
}

export function setRoutes(repo: Repo): RouteTable {
  return {
    '/api/sets/:id': guardAll({
      GET: (req) => json(repo.requireSet(pathId(req.params.id, 'set'))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'set');
        const body = await readJsonObject(req);
        const patch: Partial<SetInput> = {};
        if (isPresent(body, 'exercise_id')) {
          patch.exercise_id = requiredInt(body, 'exercise_id', { min: 1 });
        }
        if (isPresent(body, 'reps')) {
          patch.reps = requiredInt(body, 'reps', { min: 1, max: 1000 });
        }
        if (isPresent(body, 'weight')) {
          patch.weight = requiredNumber(body, 'weight', { min: 0, max: 100000 });
        }
        if (isPresent(body, 'notes')) {
          patch.notes = optionalString(body, 'notes', MAX_NOTES);
        }
        if (isPresent(body, 'position')) {
          patch.position = requiredInt(body, 'position', { min: 0 });
        }
        return json(repo.updateSet(id, patch));
      },

      DELETE: (req) => {
        repo.deleteSet(pathId(req.params.id, 'set'));
        return noContent();
      },
    }),
  };
}
