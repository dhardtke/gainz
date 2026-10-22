import type { CreateExerciseDto, EditExerciseDto, ExerciseFilterDto } from '../../../shared/dto/exercise.ts';
import type { ExerciseKind } from '../../../shared/exercise-kind.ts';
import type { ExerciseId, Iso8601Date, WorkoutId } from '../../../shared/flavors.ts';
import type { MuscleGroup } from '../../../shared/muscle-group.ts';
import type { DB } from '../../db/db.ts';
import { optionalOneOf, optionalString, requiredOneOf, requiredString, validatePresent } from '../../shared/validate.ts';
import { translateDtoToCreateExercise, translateDtoToEditExercise, translateDtoToExerciseFilter } from './internal/exercise.translator.ts';
import { ExerciseRepository } from './internal/exercise.repository.ts';
import type { Exercise, ExerciseWithStats, LastSession, SessionPoint } from './ports/exercise.ts';
import type { LiftSet } from '../workouts/ports/set.ts';

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body'] as const satisfies readonly MuscleGroup[];

export const EXERCISE_KINDS = ['weighted', 'bodyweight', 'assisted'] as const satisfies readonly ExerciseKind[];

export const MAX_EXERCISE_NAME_LENGTH = 120;
const MAX_EXERCISE_NOTES_LENGTH = 2000;

export class ExerciseFacade {
  readonly #exercises: ExerciseRepository;

  constructor(exercises: ExerciseRepository) {
    this.#exercises = exercises;
  }

  list(limit: number | null, offset: number, filter: ExerciseFilterDto = {}): ExerciseWithStats[] {
    return this.#exercises.list(limit, offset, translateDtoToExerciseFilter(filter));
  }

  count(filter: ExerciseFilterDto = {}): number {
    return this.#exercises.count(translateDtoToExerciseFilter(filter));
  }

  index(id: ExerciseId, filter: ExerciseFilterDto = {}): number {
    return this.#exercises.index(id, translateDtoToExerciseFilter(filter));
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

  bestSet(id: ExerciseId, kind: ExerciseKind): (LiftSet & { performed_on: Iso8601Date }) | null {
    return this.#exercises.bestSet(id, kind);
  }

  lastSession(id: ExerciseId, exceptWorkout: WorkoutId | null): LastSession | null {
    return this.#exercises.lastSession(id, exceptWorkout);
  }

  #validateCreate(dto: CreateExerciseDto): CreateExerciseDto {
    return {
      name: requiredString(dto, 'name', MAX_EXERCISE_NAME_LENGTH),
      muscleGroup: optionalOneOf(dto, 'muscleGroup', MUSCLE_GROUPS),
      notes: optionalString(dto, 'notes', MAX_EXERCISE_NOTES_LENGTH),
      // Not optionalOneOf, which would take '' and null for absent.
      kind: dto.kind === undefined ? undefined : requiredOneOf(dto, 'kind', EXERCISE_KINDS),
    };
  }

  #validateEdit(dto: EditExerciseDto): EditExerciseDto {
    return validatePresent(dto, {
      name: () => requiredString(dto, 'name', MAX_EXERCISE_NAME_LENGTH),
      muscleGroup: () => optionalOneOf(dto, 'muscleGroup', MUSCLE_GROUPS),
      notes: () => optionalString(dto, 'notes', MAX_EXERCISE_NOTES_LENGTH),
      kind: () => requiredOneOf(dto, 'kind', EXERCISE_KINDS),
    });
  }
}

export function createExerciseFacade(db: DB): ExerciseFacade {
  return new ExerciseFacade(new ExerciseRepository(db));
}
