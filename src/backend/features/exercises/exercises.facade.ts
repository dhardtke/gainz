import type { CreateExerciseDto, EditExerciseDto } from '../../../shared/dto';
import type { DB } from '../../db/db.ts';
import { isPresent, MAX_NAME, MAX_NOTES, optionalString, requiredString } from '../../shared/validate.ts';
import { translateDtoToCreateExercise, translateDtoToEditExercise } from './internal/exercise.translator.ts';
import { ExerciseRepository } from './internal/exercise.repository.ts';
import type { Exercise, ExerciseWithStats, SessionPoint } from './ports/exercise.ts';
import type { LiftSet } from '../workouts/ports/set.ts';

/**
 * The exercises feature's front door. Controllers hold this rather than the repository, so the SQL,
 * the CreateExercise shape and the nullable get() stay inside the feature. Rows cross the boundary
 * unchanged: mapping a row to a DTO is the controller's job, and the compiler is what enforces it.
 */
export class ExerciseFacade {
  constructor(private readonly exercises: ExerciseRepository) {}

  list(): ExerciseWithStats[] {
    return this.exercises.list();
  }

  require(id: number): Exercise {
    return this.exercises.require(id);
  }

  create(dto: CreateExerciseDto): Exercise {
    return this.exercises.create(translateDtoToCreateExercise(this.validateCreate(dto)));
  }

  update(id: number, dto: EditExerciseDto): Exercise {
    return this.exercises.update(id, translateDtoToEditExercise(this.validateEdit(dto)));
  }

  delete(id: number): void {
    this.exercises.delete(id);
  }

  progress(id: number): SessionPoint[] {
    return this.exercises.progress(id);
  }

  bestSet(id: number): (LiftSet & { performed_on: string }) | null {
    return this.exercises.bestSet(id);
  }

  private validateCreate(dto: CreateExerciseDto): CreateExerciseDto {
    return {
      name: requiredString(dto, 'name', MAX_NAME),
      muscleGroup: optionalString(dto, 'muscleGroup', 60),
      notes: optionalString(dto, 'notes', MAX_NOTES),
    };
  }

  private validateEdit(dto: EditExerciseDto): EditExerciseDto {
    const valid: EditExerciseDto = {};
    if (isPresent(dto, 'name')) {
      valid.name = requiredString(dto, 'name', MAX_NAME);
    }
    if (isPresent(dto, 'muscleGroup')) {
      valid.muscleGroup = optionalString(dto, 'muscleGroup', 60);
    }
    if (isPresent(dto, 'notes')) {
      valid.notes = optionalString(dto, 'notes', MAX_NOTES);
    }
    return valid;
  }
}

export function createExerciseFacade(db: DB): ExerciseFacade {
  return new ExerciseFacade(new ExerciseRepository(db));
}
