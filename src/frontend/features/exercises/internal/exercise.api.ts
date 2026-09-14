import type { CreateExerciseDto, EditExerciseDto, ExerciseDto, ExerciseProgressDto, ExerciseWithStatsDto } from '../../../../shared/dto/index.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import { get, patch, post, remove } from '../../../http/http.ts';

export class ExerciseApi {
  list(): Promise<ExerciseWithStatsDto[]> {
    return get('/exercises');
  }

  get(id: ExerciseId): Promise<ExerciseDto> {
    return get(`/exercises/${id}`);
  }

  progress(id: ExerciseId): Promise<ExerciseProgressDto> {
    return get(`/exercises/${id}/progress`);
  }

  create(dto: CreateExerciseDto): Promise<ExerciseDto> {
    return post('/exercises', dto);
  }

  update(id: ExerciseId, dto: EditExerciseDto): Promise<ExerciseDto> {
    return patch(`/exercises/${id}`, dto);
  }

  delete(id: ExerciseId): Promise<null> {
    return remove(`/exercises/${id}`);
  }
}
