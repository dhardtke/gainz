import { json, noContent, readJsonObject } from '../http.ts';
import type { Repo } from '../../db/repos';
import type { CreateSetDto, EditSetDto } from '../../../shared/dto';
import { fromEditSet, toLiftSet } from '../dto';
import { isPresent, optionalString, pathId, requiredInt, requiredNumber } from '../../shared/validate.ts';
import type { RouteTable } from './shared.ts';
import { guardAll, MAX_NOTES } from './shared.ts';

/** Exported because `POST /api/workouts/:id/sets` creates sets too, and lives in workout.routes.ts. */
export function readSetBody(body: Record<string, unknown>): CreateSetDto {
  return {
    exerciseId: requiredInt(body, 'exerciseId', { min: 1 }),
    reps: requiredInt(body, 'reps', { min: 1, max: 1000 }),
    weight: requiredNumber(body, 'weight', { min: 0, max: 100000 }),
    notes: optionalString(body, 'notes', MAX_NOTES),
    ...(isPresent(body, 'position') ? { position: requiredInt(body, 'position', { min: 0 }) } : {}),
  };
}

function readEditSetBody(body: Record<string, unknown>): EditSetDto {
  const dto: EditSetDto = {};
  if (isPresent(body, 'exerciseId')) {
    dto.exerciseId = requiredInt(body, 'exerciseId', { min: 1 });
  }
  if (isPresent(body, 'reps')) {
    dto.reps = requiredInt(body, 'reps', { min: 1, max: 1000 });
  }
  if (isPresent(body, 'weight')) {
    dto.weight = requiredNumber(body, 'weight', { min: 0, max: 100000 });
  }
  if (isPresent(body, 'notes')) {
    dto.notes = optionalString(body, 'notes', MAX_NOTES);
  }
  if (isPresent(body, 'position')) {
    dto.position = requiredInt(body, 'position', { min: 0 });
  }
  return dto;
}

export function setRoutes(repo: Repo): RouteTable {
  return {
    '/api/sets/:id': guardAll({
      GET: (req) => json(toLiftSet(repo.requireSet(pathId(req.params.id, 'set')))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'set');
        const patch = readEditSetBody(await readJsonObject(req));
        return json(toLiftSet(repo.updateSet(id, fromEditSet(patch))));
      },

      DELETE: (req) => {
        repo.deleteSet(pathId(req.params.id, 'set'));
        return noContent();
      },
    }),
  };
}
