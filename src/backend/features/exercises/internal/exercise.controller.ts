import { json, noContent, pathId, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import type { ExerciseFacade } from '../exercises.facade.ts';
import {
  translateToCreateExerciseDto,
  translateToEditExerciseDto,
  translateToExerciseDto,
  translateToExerciseProgressDto,
  translateToExerciseWithStatsDto,
} from './exercise.translator.ts';

export class ExerciseController {
  readonly #exercises: ExerciseFacade;

  constructor(exercises: ExerciseFacade) {
    this.#exercises = exercises;
  }

  list(): Response {
    return json(this.#exercises.list().map(translateToExerciseWithStatsDto));
  }

  async create(req: Request): Promise<Response> {
    const dto = translateToCreateExerciseDto(await readJsonObject(req));
    return json(translateToExerciseDto(this.#exercises.create(dto)), 201);
  }

  show(req: ParamRequest): Response {
    return json(translateToExerciseDto(this.#exercises.require(pathId(req.params.id, 'exercise'))));
  }

  async update(req: ParamRequest): Promise<Response> {
    const id: ExerciseId = pathId(req.params.id, 'exercise');
    const dto = translateToEditExerciseDto(await readJsonObject(req));
    return json(translateToExerciseDto(this.#exercises.update(id, dto)));
  }

  delete(req: ParamRequest): Response {
    this.#exercises.delete(pathId(req.params.id, 'exercise'));
    return noContent();
  }

  progress(req: ParamRequest): Response {
    const id: ExerciseId = pathId(req.params.id, 'exercise');
    return json(translateToExerciseProgressDto(this.#exercises.require(id), this.#exercises.progress(id), this.#exercises.bestSet(id)));
  }
}
