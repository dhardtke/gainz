import type {
  CreateSetDto,
  CreateWorkoutDto,
  EditWorkoutDto,
  LiftSetDto,
  WorkoutDto,
  WorkoutPageDto,
  WorkoutWithSetsDto,
} from '../../../../shared/dto/index.ts';
import type { WorkoutId } from '../../../../shared/flavors.ts';
import { get, patch, post, remove } from '../../../http/http.ts';

export class WorkoutApi {
  list({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<WorkoutPageDto> {
    return get(`/workouts?limit=${limit}&offset=${offset}`);
  }

  get(id: WorkoutId): Promise<WorkoutWithSetsDto> {
    return get(`/workouts/${id}`);
  }

  create(dto: CreateWorkoutDto): Promise<WorkoutWithSetsDto> {
    return post('/workouts', dto);
  }

  /** Updates the header only — the response carries no `sets`. */
  update(id: WorkoutId, dto: EditWorkoutDto): Promise<WorkoutDto> {
    return patch(`/workouts/${id}`, dto);
  }

  delete(id: WorkoutId): Promise<null> {
    return remove(`/workouts/${id}`);
  }

  createSet(workoutId: WorkoutId, dto: CreateSetDto): Promise<LiftSetDto> {
    return post(`/workouts/${workoutId}/sets`, dto);
  }
}
