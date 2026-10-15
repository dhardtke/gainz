import type {
  CreateExerciseDto,
  EditExerciseDto,
  ExerciseDto,
  ExerciseFilterDto,
  ExerciseLastSessionDto,
  ExercisePageDto,
  ExercisePositionDto,
  ExerciseProgressDto,
} from '../../../../shared/dto/exercise.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import { get, patch, post, remove } from '../../../http/http.ts';

function withQuery(path: string, query: URLSearchParams): string {
  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
}

function setFilter(query: URLSearchParams, { muscleGroup, type, search }: ExerciseFilterDto): URLSearchParams {
  if (muscleGroup !== undefined) {
    query.set('muscleGroup', muscleGroup);
  }
  if (type !== undefined) {
    query.set('type', type);
  }
  if (search !== undefined) {
    query.set('search', search);
  }
  return query;
}

export class ExerciseApi {
  list({ limit, offset, ...filter }: { limit?: number; offset?: number } & ExerciseFilterDto = {}): Promise<ExercisePageDto> {
    const query = new URLSearchParams();
    if (limit !== undefined) {
      query.set('limit', String(limit));
      query.set('offset', String(offset ?? 0));
    }
    return get(withQuery('/exercises', setFilter(query, filter)));
  }

  get(id: ExerciseId): Promise<ExerciseDto> {
    return get(`/exercises/${id}`);
  }

  position(id: ExerciseId, filter: ExerciseFilterDto = {}): Promise<ExercisePositionDto> {
    return get(withQuery(`/exercises/${id}/position`, setFilter(new URLSearchParams(), filter)));
  }

  progress(id: ExerciseId): Promise<ExerciseProgressDto> {
    return get(`/exercises/${id}/progress`);
  }

  lastSession(id: ExerciseId, exceptWorkout?: WorkoutId): Promise<ExerciseLastSessionDto> {
    return get(withQuery(`/exercises/${id}/last-session`, new URLSearchParams(exceptWorkout === undefined ? {} : { exceptWorkout: String(exceptWorkout) })));
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
