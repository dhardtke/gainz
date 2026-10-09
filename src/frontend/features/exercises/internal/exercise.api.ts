import type {
  CreateExerciseDto,
  EditExerciseDto,
  ExerciseDto,
  ExercisePageDto,
  ExercisePositionDto,
  ExerciseProgressDto,
} from '../../../../shared/dto/exercise.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import type { MuscleGroupFilter } from '../../../../shared/muscle-group.ts';
import { get, patch, post, remove } from '../../../http/http.ts';

function withQuery(path: string, query: URLSearchParams): string {
  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
}

export class ExerciseApi {
  list({ limit, offset, muscleGroup }: { limit?: number; offset?: number; muscleGroup?: MuscleGroupFilter } = {}): Promise<ExercisePageDto> {
    const query = new URLSearchParams();
    if (limit !== undefined) {
      query.set('limit', String(limit));
      query.set('offset', String(offset ?? 0));
    }
    if (muscleGroup !== undefined) {
      query.set('muscleGroup', muscleGroup);
    }
    return get(withQuery('/exercises', query));
  }

  get(id: ExerciseId): Promise<ExerciseDto> {
    return get(`/exercises/${id}`);
  }

  position(id: ExerciseId, muscleGroup?: MuscleGroupFilter): Promise<ExercisePositionDto> {
    return get(withQuery(`/exercises/${id}/position`, new URLSearchParams(muscleGroup === undefined ? {} : { muscleGroup })));
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
