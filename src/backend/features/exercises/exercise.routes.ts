import { json, noContent, readJsonObject } from '../../http/http.ts';
import type { ExerciseRepository } from './internal/exercise.repository.ts';
import { pathId } from '../../shared/validate.ts';
import type { RouteTable } from '../../http/routing.ts';
import { guardAll } from '../../http/routing.ts';
import { toExercise, toExerciseProgress, toExerciseWithStats } from './ports/exercise.ts';
import { fromCreateExercise, fromEditExercise } from './internal/exercise.mapper.ts';
import { translateToEditExerciseDto, translateToCreateExerciseDto } from './internal/exercise.translator.ts';

export function exerciseRoutes(exercises: ExerciseRepository): RouteTable {
  return {
    '/api/exercises': guardAll({
      GET: () => json(exercises.list().map(toExerciseWithStats)),
      POST: async (req) => json(toExercise(exercises.create(fromCreateExercise(translateToCreateExerciseDto(await readJsonObject(req))))), 201),
    }),

    '/api/exercises/:id': guardAll({
      GET: (req) => json(toExercise(exercises.require(pathId(req.params.id, 'exercise')))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'exercise');
        const patch = translateToEditExerciseDto(await readJsonObject(req));
        return json(toExercise(exercises.update(id, fromEditExercise(patch))));
      },

      DELETE: (req) => {
        exercises.delete(pathId(req.params.id, 'exercise'));
        return noContent();
      },
    }),

    '/api/exercises/:id/progress': guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, 'exercise');
        return json(toExerciseProgress(exercises.require(id), exercises.progress(id), exercises.bestSet(id)));
      },
    }),
  };
}
