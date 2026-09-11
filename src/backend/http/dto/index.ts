/**
 * The translation between the repository rows of `src/backend/db/` and the wire format declared
 * in `src/shared/dto/`. One file per entity, mirroring `db/repos/`, and this index is what the
 * route files import.
 *
 * Every mapper names every field. A spread of a row would compile and would quietly ship the
 * snake_case columns alongside the camelCase ones, and nothing in the type system would notice.
 */
export { fromCreateExercise, fromEditExercise, toExercise, toExerciseProgress, toExerciseWithStats, toSessionPoint } from './exercise.ts';
export { fromCreateSet, fromEditSet, toBestSet, toLiftSet } from './set.ts';
export { toSummary } from './stats.ts';
export { fromCreateWorkout, fromEditWorkout, toWorkout, toWorkoutPage, toWorkoutWithSets, toWorkoutWithStats } from './workout.ts';
