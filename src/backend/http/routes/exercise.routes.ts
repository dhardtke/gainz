import { json, noContent, readJsonObject } from '../http.ts';
import type { Repo } from '../../db/repos';
import type { CreateExerciseDto, EditExerciseDto } from '../../../shared/dto';
import { fromCreateExercise, fromEditExercise, toExercise, toExerciseProgress, toExerciseWithStats } from '../dto';
import { isPresent, optionalString, pathId, requiredString } from '../../shared/validate.ts';
import type { RouteTable } from './shared.ts';
import { guardAll, MAX_NAME, MAX_NOTES } from './shared.ts';

function readExerciseBody(body: Record<string, unknown>): CreateExerciseDto {
  return {
    name: requiredString(body, 'name', MAX_NAME),
    muscleGroup: optionalString(body, 'muscleGroup', 60),
    notes: optionalString(body, 'notes', MAX_NOTES),
  };
}

function readEditExerciseBody(body: Record<string, unknown>): EditExerciseDto {
  const dto: EditExerciseDto = {};
  if (isPresent(body, 'name')) {
    dto.name = requiredString(body, 'name', MAX_NAME);
  }
  if (isPresent(body, 'muscleGroup')) {
    dto.muscleGroup = optionalString(body, 'muscleGroup', 60);
  }
  if (isPresent(body, 'notes')) {
    dto.notes = optionalString(body, 'notes', MAX_NOTES);
  }
  return dto;
}

export function exerciseRoutes(repo: Repo): RouteTable {
  return {
    '/api/exercises': guardAll({
      GET: () => json(repo.listExercises().map(toExerciseWithStats)),
      POST: async (req) => json(toExercise(repo.createExercise(fromCreateExercise(readExerciseBody(await readJsonObject(req))))), 201),
    }),

    '/api/exercises/:id': guardAll({
      GET: (req) => json(toExercise(repo.requireExercise(pathId(req.params.id, 'exercise')))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'exercise');
        const patch = readEditExerciseBody(await readJsonObject(req));
        return json(toExercise(repo.updateExercise(id, fromEditExercise(patch))));
      },

      DELETE: (req) => {
        repo.deleteExercise(pathId(req.params.id, 'exercise'));
        return noContent();
      },
    }),

    '/api/exercises/:id/progress': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'exercise');
        return json(toExerciseProgress(repo.requireExercise(id), repo.exerciseProgress(id), repo.exerciseBestSet(id)));
      },
    }),
  };
}
