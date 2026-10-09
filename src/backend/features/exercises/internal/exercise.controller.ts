import { json, noContent, optionalQueryInt, optionalQueryOneOf, pathId, queryInt, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import type { MuscleGroup } from '../../../../shared/muscle-group.ts';
import { type ExerciseFacade, MUSCLE_GROUPS } from '../exercises.facade.ts';
import {
  translateToCreateExerciseDto,
  translateToEditExerciseDto,
  translateToExerciseDto,
  translateToExercisePageDto,
  translateToExercisePositionDto,
  translateToExerciseProgressDto,
} from './exercise.translator.ts';

export class ExerciseController {
  readonly #exercises: ExerciseFacade;

  constructor(exercises: ExerciseFacade) {
    this.#exercises = exercises;
  }

  list(req: Request): Response {
    const params = new URL(req.url).searchParams;
    const limit = optionalQueryInt(params, 'limit', { min: 1, max: 200 });
    const offset = queryInt(params, 'offset', 0, { min: 0, max: 100000 });
    const muscleGroup = this.#muscleGroup(params);
    return json(
      translateToExercisePageDto(this.#exercises.list(limit, offset, muscleGroup), this.#exercises.count(muscleGroup), this.#exercises.count(), limit, offset),
    );
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

  position(req: ParamRequest): Response {
    const muscleGroup = this.#muscleGroup(new URL(req.url).searchParams);
    return json(translateToExercisePositionDto(this.#exercises.index(pathId(req.params.id, 'exercise'), muscleGroup)));
  }

  progress(req: ParamRequest): Response {
    const id: ExerciseId = pathId(req.params.id, 'exercise');
    return json(translateToExerciseProgressDto(this.#exercises.require(id), this.#exercises.progress(id), this.#exercises.bestSet(id)));
  }

  /** `undefined` for every exercise, `null` for those without a group. */
  #muscleGroup(params: URLSearchParams): MuscleGroup | null | undefined {
    const filter = optionalQueryOneOf(params, 'muscleGroup', [...MUSCLE_GROUPS, 'none']);
    return filter === null ? undefined : filter === 'none' ? null : filter;
  }
}
