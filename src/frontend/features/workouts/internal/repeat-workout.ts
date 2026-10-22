import type { WorkoutDto } from '../../../../shared/dto/workout.ts';
import { navigate } from '../../../app/router.ts';
import { plural, todayIso } from '../../../ui/format.ts';
import { toast, toastError } from '../../../ui/toast.ts';
import { workoutFacade } from '../workouts.facade.ts';

export async function repeatWorkout(workout: Pick<WorkoutDto, 'id' | 'title'>): Promise<void> {
  try {
    const copy = await workoutFacade.create({ performedOn: todayIso(), title: workout.title, copyFromWorkoutId: workout.id });
    toast(`Copied ${plural(copy.exercises.flatMap((group) => group.sets).length, 'set')} into a new session`, 'success');
    navigate(`/workouts/${copy.id}`);
  } catch (error) {
    toastError(error);
  }
}
