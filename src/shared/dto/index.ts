/**
 * The single declaration of the gainz wire format, imported by both halves of the app.
 *
 * Everything under `src/shared/dto/` is **types only, on purpose**. Only `src/frontend/` is
 * web-served — `resolveStaticPath` in `src/backend/features/static/internal/paths.ts` refuses
 * anything resolving outside it — so the frontend reaches these declarations with `import type`,
 * which `Bun.Transpiler` erases whole. The browser therefore never asks for the module. A single
 * runtime statement in here would turn that erased import into a 404, and the same holds for the
 * whole of `src/shared/`.
 *
 * The ids and dates in these shapes are the flavored primitives from `../flavors.ts`, so a
 * workout id cannot stand in for an exercise id and a `createdAt` cannot stand in for a
 * `YYYY-MM-DD` date.
 *
 * The backend translates its repository rows into these shapes in each feature's
 * `internal/*.translator.ts`; the
 * rows themselves stay snake_case and never leave the feature that owns the table.
 */
// TODO remove barrel imports
export type { ErrorDto } from './error.ts';
export type { CreateExerciseDto, EditExerciseDto, ExerciseDto, ExerciseProgressDto, ExerciseWithStatsDto, SessionPointDto } from './exercise.ts';
export type { HealthDto } from './meta.ts';
export type { BestSetDto, CreateSetDto, EditSetDto, LiftSetDto } from './set.ts';
export type { SummaryDto } from './stats.ts';
export type { CreateWorkoutDto, EditWorkoutDto, WorkoutDto, WorkoutPageDto, WorkoutWithSetsDto, WorkoutWithStatsDto } from './workout.ts';
