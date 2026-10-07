import type { CreateSetDto, EditSetDto, LiftSetDto } from '../../../shared/dto/set.ts';
import type { CreateWorkoutDto, EditWorkoutDto, MoveDirection, WorkoutDto, WorkoutPageDto, WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import type { ExerciseId, LiftSetId, WorkoutId } from '../../../shared/flavors.ts';
import { SetApi } from './internal/set.api.ts';
import { WorkoutApi } from './internal/workout.api.ts';

export class WorkoutFacade {
  readonly #api: WorkoutApi;

  constructor(api: WorkoutApi) {
    this.#api = api;
  }

  list(page?: { limit?: number; offset?: number }): Promise<WorkoutPageDto> {
    return this.#api.list(page);
  }

  get(id: WorkoutId): Promise<WorkoutWithExercisesDto> {
    return this.#api.get(id);
  }

  create(dto: CreateWorkoutDto): Promise<WorkoutWithExercisesDto> {
    return this.#api.create(dto);
  }

  // The response carries no `exercises`.
  update(id: WorkoutId, dto: EditWorkoutDto): Promise<WorkoutDto> {
    return this.#api.update(id, dto);
  }

  delete(id: WorkoutId): Promise<null> {
    return this.#api.delete(id);
  }

  moveExercise(id: WorkoutId, exerciseId: ExerciseId, direction: MoveDirection): Promise<WorkoutWithExercisesDto> {
    return this.#api.moveExercise(id, exerciseId, { direction });
  }
}

export class SetFacade {
  readonly #workouts: WorkoutApi;

  readonly #sets: SetApi;

  constructor(workouts: WorkoutApi, sets: SetApi) {
    this.#workouts = workouts;
    this.#sets = sets;
  }

  create(workoutId: WorkoutId, dto: CreateSetDto): Promise<LiftSetDto> {
    return this.#workouts.createSet(workoutId, dto);
  }

  update(id: LiftSetId, dto: EditSetDto): Promise<LiftSetDto> {
    return this.#sets.update(id, dto);
  }

  delete(id: LiftSetId): Promise<null> {
    return this.#sets.delete(id);
  }
}

const workoutApi = new WorkoutApi();

export const workoutFacade = new WorkoutFacade(workoutApi);

export const setFacade = new SetFacade(workoutApi, new SetApi());
