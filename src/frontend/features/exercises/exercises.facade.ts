import type {
  CreateExerciseDto,
  EditExerciseDto,
  ExerciseDto,
  ExercisePageDto,
  ExercisePositionDto,
  ExerciseProgressDto,
} from '../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../shared/flavors.ts';
import { ExerciseApi } from './internal/exercise.api.ts';

export class ExerciseFacade {
  readonly #api: ExerciseApi;

  constructor(api: ExerciseApi) {
    this.#api = api;
  }

  /** Every exercise without a `limit`, one page with it. */
  list(page?: { limit?: number; offset?: number }): Promise<ExercisePageDto> {
    return this.#api.list(page);
  }

  get(id: ExerciseId): Promise<ExerciseDto> {
    return this.#api.get(id);
  }

  /** The exercise's 0-based place in the list's name order. */
  position(id: ExerciseId): Promise<ExercisePositionDto> {
    return this.#api.position(id);
  }

  progress(id: ExerciseId): Promise<ExerciseProgressDto> {
    return this.#api.progress(id);
  }

  create(dto: CreateExerciseDto): Promise<ExerciseDto> {
    return this.#api.create(dto);
  }

  update(id: ExerciseId, dto: EditExerciseDto): Promise<ExerciseDto> {
    return this.#api.update(id, dto);
  }

  delete(id: ExerciseId): Promise<null> {
    return this.#api.delete(id);
  }
}

export const exerciseFacade = new ExerciseFacade(new ExerciseApi());
