import { json, noContent, optionalQueryInt, optionalQueryOneOf, optionalQueryString, pathId, queryInt, readJsonObject } from '../../../http/http.ts';
import type { ParamRequest } from '../../../http/routing.ts';
import type { ExerciseFilterDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import { EXERCISE_KINDS, type ExerciseFacade, MAX_EXERCISE_NAME_LENGTH, MUSCLE_GROUPS } from '../exercises.facade.ts';
import {
  translateToCreateExerciseDto,
  translateToEditExerciseDto,
  translateToExerciseDto,
  translateToExerciseLastSessionDto,
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
    const filter = this.#filter(params);
    return json(translateToExercisePageDto(this.#exercises.list(limit, offset, filter), this.#exercises.count(filter), this.#exercises.count(), limit, offset));
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
    const filter = this.#filter(new URL(req.url).searchParams);
    return json(translateToExercisePositionDto(this.#exercises.index(pathId(req.params.id, 'exercise'), filter)));
  }

  progress(req: ParamRequest): Response {
    const id: ExerciseId = pathId(req.params.id, 'exercise');
    const exercise = this.#exercises.require(id);
    return json(translateToExerciseProgressDto(exercise, this.#exercises.progress(id), this.#exercises.bestSet(id, exercise.kind)));
  }

  lastSession(req: ParamRequest): Response {
    const id: ExerciseId = pathId(req.params.id, 'exercise');
    const exceptWorkout: WorkoutId | null = optionalQueryInt(new URL(req.url).searchParams, 'exceptWorkout', { min: 1, max: Number.MAX_SAFE_INTEGER });
    return json(translateToExerciseLastSessionDto(this.#exercises.lastSession(id, exceptWorkout)));
  }

  #filter(params: URLSearchParams): ExerciseFilterDto {
    const filter: ExerciseFilterDto = {};
    const muscleGroup = optionalQueryOneOf(params, 'muscleGroup', [...MUSCLE_GROUPS, 'none']);
    if (muscleGroup !== null) {
      filter.muscleGroup = muscleGroup;
    }
    const type = optionalQueryOneOf(params, 'type', EXERCISE_KINDS);
    if (type !== null) {
      filter.type = type;
    }
    const search = optionalQueryString(params, 'search', MAX_EXERCISE_NAME_LENGTH);
    if (search !== null) {
      filter.search = search;
    }
    return filter;
  }
}
