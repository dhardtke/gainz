/**
 * The single declaration of the gainz wire format, imported by both halves of the app.
 *
 * Everything under `src/shared/dto/` is **types only, on purpose**. Only `src/frontend/` is
 * web-served — `resolveStaticPath` in `src/backend/paths.ts` refuses anything resolving outside
 * it — so the frontend reaches these declarations with `import type`, which `Bun.Transpiler`
 * erases whole. The browser therefore never asks for the module. A single runtime statement in
 * here would turn that erased import into a 404, which is why `index.test.ts` pins the rule.
 *
 * The backend translates its repository rows into these shapes in `src/backend/http/dto/`; the
 * rows themselves stay snake_case and stay inside `src/backend/db/`.
 */
export type { ErrorDto } from './error.ts';
export type { CreateExerciseDto, EditExerciseDto, ExerciseDto, ExerciseProgressDto, ExerciseWithStatsDto, SessionPointDto } from './exercise.ts';
export type { BestSetDto, CreateSetDto, EditSetDto, LiftSetDto } from './set.ts';
export type { SummaryDto } from './stats.ts';
export type { CreateWorkoutDto, EditWorkoutDto, WorkoutDto, WorkoutPageDto, WorkoutWithSetsDto, WorkoutWithStatsDto } from './workout.ts';
