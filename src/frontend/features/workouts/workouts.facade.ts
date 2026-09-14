import type {
  CreateSetDto,
  CreateWorkoutDto,
  EditSetDto,
  EditWorkoutDto,
  LiftSetDto,
  WorkoutDto,
  WorkoutPageDto,
  WorkoutWithSetsDto,
} from '../../../shared/dto/index.ts';
import type { LiftSetId, WorkoutId } from '../../../shared/flavors.ts';
import { SetApi } from './internal/set.api.ts';
import { WorkoutApi } from './internal/workout.api.ts';

export class WorkoutFacade {
  constructor(private readonly api: WorkoutApi) {}

  list(page?: { limit?: number; offset?: number }): Promise<WorkoutPageDto> {
    return this.api.list(page);
  }

  get(id: WorkoutId): Promise<WorkoutWithSetsDto> {
    return this.api.get(id);
  }

  create(dto: CreateWorkoutDto): Promise<WorkoutWithSetsDto> {
    return this.api.create(dto);
  }

  /** Updates the header only — the response carries no `sets`. */
  update(id: WorkoutId, dto: EditWorkoutDto): Promise<WorkoutDto> {
    return this.api.update(id, dto);
  }

  delete(id: WorkoutId): Promise<null> {
    return this.api.delete(id);
  }
}

export class SetFacade {
  constructor(
    private readonly workouts: WorkoutApi,
    private readonly sets: SetApi,
  ) {}

  create(workoutId: WorkoutId, dto: CreateSetDto): Promise<LiftSetDto> {
    return this.workouts.createSet(workoutId, dto);
  }

  update(id: LiftSetId, dto: EditSetDto): Promise<LiftSetDto> {
    return this.sets.update(id, dto);
  }

  delete(id: LiftSetId): Promise<null> {
    return this.sets.delete(id);
  }
}

const workoutApi = new WorkoutApi();

export const workoutFacade = new WorkoutFacade(workoutApi);

export const setFacade = new SetFacade(workoutApi, new SetApi());
