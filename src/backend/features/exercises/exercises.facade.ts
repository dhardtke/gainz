import type { CreateExerciseDto, EditExerciseDto } from '../../../shared/dto/exercise.ts';
import type { ExerciseId, Iso8601Date } from '../../../shared/flavors.ts';
import type { DB } from '../../db/db.ts';
import { optionalString, requiredString } from '../../shared/validate.ts';
import { translateDtoToCreateExercise, translateDtoToEditExercise } from './internal/exercise.translator.ts';
import { ExerciseRepository } from './internal/exercise.repository.ts';
import type { Exercise, ExerciseWithStats, SessionPoint } from './ports/exercise.ts';
import type { LiftSet } from '../workouts/ports/set.ts';

const MAX_EXERCISE_NAME_LENGTH = 120;
const MAX_EXERCISE_NOTES_LENGTH = 2000;

export class ExerciseFacade {
  readonly #exercises: ExerciseRepository;

  constructor(exercises: ExerciseRepository) {
    this.#exercises = exercises;
  }

  /** @param limit null for every exercise. */
  list(limit: number | null, offset: number): ExerciseWithStats[] {
    return this.#exercises.list(limit, offset);
  }

  count(): number {
    return this.#exercises.count();
  }

  /** The exercise's 0-based place in `list()`'s order. */
  index(id: ExerciseId): number {
    return this.#exercises.index(id);
  }

  require(id: ExerciseId): Exercise {
    return this.#exercises.require(id);
  }

  create(dto: CreateExerciseDto): Exercise {
    return this.#exercises.create(translateDtoToCreateExercise(this.#validateCreate(dto)));
  }

  update(id: ExerciseId, dto: EditExerciseDto): Exercise {
    return this.#exercises.update(id, translateDtoToEditExercise(this.#validateEdit(dto)));
  }

  delete(id: ExerciseId): void {
    this.#exercises.delete(id);
  }

  progress(id: ExerciseId): SessionPoint[] {
    return this.#exercises.progress(id);
  }

  bestSet(id: ExerciseId): (LiftSet & { performed_on: Iso8601Date }) | null {
    return this.#exercises.bestSet(id);
  }

  #validateCreate(dto: CreateExerciseDto): CreateExerciseDto {
    return {
      name: requiredString(dto, 'name', MAX_EXERCISE_NAME_LENGTH),
      muscleGroup: optionalString(dto, 'muscleGroup', 60),
      notes: optionalString(dto, 'notes', MAX_EXERCISE_NOTES_LENGTH),
    };
  }

  #validateEdit(dto: EditExerciseDto): EditExerciseDto {
    const valid: EditExerciseDto = {};
    if (dto.name !== undefined) {
      valid.name = requiredString(dto, 'name', MAX_EXERCISE_NAME_LENGTH);
    }
    if (dto.muscleGroup !== undefined) {
      valid.muscleGroup = optionalString(dto, 'muscleGroup', 60);
    }
    if (dto.notes !== undefined) {
      valid.notes = optionalString(dto, 'notes', MAX_EXERCISE_NOTES_LENGTH);
    }
    return valid;
  }
}

export function createExerciseFacade(db: DB): ExerciseFacade {
  return new ExerciseFacade(new ExerciseRepository(db));
}
