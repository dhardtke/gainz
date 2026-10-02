import type { CreateSetDto, LiftSetDto } from '../../../../shared/dto/set.ts';
import type {
  CreateWorkoutDto,
  EditWorkoutDto,
  MoveWorkoutExerciseDto,
  WorkoutDto,
  WorkoutPageDto,
  WorkoutWithExercisesDto,
} from '../../../../shared/dto/workout.ts';
import type { ExerciseId, WorkoutId } from '../../../../shared/flavors.ts';
import { get, patch, post, remove } from '../../../http/http.ts';

export class WorkoutApi {
  list({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<WorkoutPageDto> {
    return get(`/workouts?limit=${limit}&offset=${offset}`);
  }

  get(id: WorkoutId): Promise<WorkoutWithExercisesDto> {
    return get(`/workouts/${id}`);
  }

  create(dto: CreateWorkoutDto): Promise<WorkoutWithExercisesDto> {
    return post('/workouts', dto);
  }

  /** Updates the header only — the response carries no `exercises`. */
  update(id: WorkoutId, dto: EditWorkoutDto): Promise<WorkoutDto> {
    return patch(`/workouts/${id}`, dto);
  }

  delete(id: WorkoutId): Promise<null> {
    return remove(`/workouts/${id}`);
  }

  createSet(workoutId: WorkoutId, dto: CreateSetDto): Promise<LiftSetDto> {
    return post(`/workouts/${workoutId}/sets`, dto);
  }

  moveExercise(id: WorkoutId, exerciseId: ExerciseId, dto: MoveWorkoutExerciseDto): Promise<WorkoutWithExercisesDto> {
    return post(`/workouts/${id}/exercises/${exerciseId}/move`, dto);
  }
}
