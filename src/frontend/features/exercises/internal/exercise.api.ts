import type {
  CreateExerciseDto,
  EditExerciseDto,
  ExerciseDto,
  ExercisePageDto,
  ExercisePositionDto,
  ExerciseProgressDto,
} from '../../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import { get, patch, post, remove } from '../../../http/http.ts';

export class ExerciseApi {
  list({ limit, offset }: { limit?: number; offset?: number } = {}): Promise<ExercisePageDto> {
    return get(limit === undefined ? '/exercises' : `/exercises?limit=${limit}&offset=${offset ?? 0}`);
  }

  get(id: ExerciseId): Promise<ExerciseDto> {
    return get(`/exercises/${id}`);
  }

  position(id: ExerciseId): Promise<ExercisePositionDto> {
    return get(`/exercises/${id}/position`);
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
