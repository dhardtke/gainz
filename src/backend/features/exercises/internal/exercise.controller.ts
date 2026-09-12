import { json, noContent, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import { pathId } from '../../../shared/validate.ts';
import type { ExerciseFacade } from '../exercises.facade.ts';
import { toExercise, toExerciseProgress, toExerciseWithStats } from '../ports/exercise.ts';
import { fromCreateExercise, fromEditExercise } from './exercise.mapper.ts';
import { translateToCreateExerciseDto, translateToEditExerciseDto } from './exercise.translator.ts';

export class ExerciseController {
  constructor(private readonly exercises: ExerciseFacade) {}

  list(): Response {
    return json(this.exercises.list().map(toExerciseWithStats));
  }

  async create(req: Request): Promise<Response> {
    const input = fromCreateExercise(translateToCreateExerciseDto(await readJsonObject(req)));
    return json(toExercise(this.exercises.create(input)), 201);
  }

  show(req: ParamRequest): Response {
    return json(toExercise(this.exercises.require(pathId(req.params.id, 'exercise'))));
  }

  async update(req: ParamRequest): Promise<Response> {
    const id = pathId(req.params.id, 'exercise');
    const patch = translateToEditExerciseDto(await readJsonObject(req));
    return json(toExercise(this.exercises.update(id, fromEditExercise(patch))));
  }

  delete(req: ParamRequest): Response {
    this.exercises.delete(pathId(req.params.id, 'exercise'));
    return noContent();
  }

  progress(req: ParamRequest): Response {
    const id = pathId(req.params.id, 'exercise');
    return json(toExerciseProgress(this.exercises.require(id), this.exercises.progress(id), this.exercises.bestSet(id)));
  }
}
