import type { CreateExerciseDto, EditExerciseDto, ExerciseDto, ExerciseProgressDto, ExerciseWithStatsDto } from '../../../shared/dto/index.ts';
import type { ExerciseId } from '../../../shared/flavors.ts';
import { ExerciseApi } from './internal/exercise.api.ts';

export class ExerciseFacade {
  constructor(private readonly api: ExerciseApi) {}

  list(): Promise<ExerciseWithStatsDto[]> {
    return this.api.list();
  }

  get(id: ExerciseId): Promise<ExerciseDto> {
    return this.api.get(id);
  }

  progress(id: ExerciseId): Promise<ExerciseProgressDto> {
    return this.api.progress(id);
  }

  create(dto: CreateExerciseDto): Promise<ExerciseDto> {
    return this.api.create(dto);
  }

  update(id: ExerciseId, dto: EditExerciseDto): Promise<ExerciseDto> {
    return this.api.update(id, dto);
  }

  delete(id: ExerciseId): Promise<null> {
    return this.api.delete(id);
  }
}

export const exerciseFacade = new ExerciseFacade(new ExerciseApi());
