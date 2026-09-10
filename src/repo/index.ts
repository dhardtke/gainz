/**
 * The database layer. `Repo` is a thin facade over one repository per entity — it exists so the
 * rest of the app keeps a single, flat surface (`repo.listSets(id)`) while the SQL lives in the
 * module it belongs to. All SQL in this project lives under `src/repo/` and nowhere else.
 */
import type { DB } from "../db";
import { type Exercise, ExerciseRepo, type ExerciseInput, type ExerciseWithStats, type SessionPoint } from "./exercises";
import { type LiftSet, SetRepo, type SetInput } from "./sets";
import { StatsRepo } from "./stats";
import { type Workout, WorkoutRepo, type WorkoutInput, type WorkoutWithStats } from "./workouts";

export type { Exercise, ExerciseInput, ExerciseWithStats, LiftSet, SessionPoint, SetInput, Workout, WorkoutInput, WorkoutWithStats };

export class Repo {
  private readonly exercises: ExerciseRepo;
  private readonly workouts: WorkoutRepo;
  private readonly sets: SetRepo;
  private readonly stats: StatsRepo;

  constructor(db: DB) {
    this.exercises = new ExerciseRepo(db);
    this.workouts = new WorkoutRepo(db);
    this.sets = new SetRepo(db, this.workouts, this.exercises);
    this.stats = new StatsRepo(db);
  }

  // ---------------------------------------------------------------- exercises

  listExercises(): ExerciseWithStats[] {
    return this.exercises.list();
  }

  getExercise(id: number): Exercise | null {
    return this.exercises.get(id);
  }

  requireExercise(id: number): Exercise {
    return this.exercises.require(id);
  }

  createExercise(input: ExerciseInput): Exercise {
    return this.exercises.create(input);
  }

  updateExercise(id: number, patch: Partial<ExerciseInput>): Exercise {
    return this.exercises.update(id, patch);
  }

  deleteExercise(id: number): void {
    this.exercises.delete(id);
  }

  exerciseProgress(id: number): SessionPoint[] {
    return this.exercises.progress(id);
  }

  exerciseBestSet(id: number): (LiftSet & { performed_on: string }) | null {
    return this.exercises.bestSet(id);
  }

  // ----------------------------------------------------------------- workouts

  listWorkouts(limit: number, offset: number): WorkoutWithStats[] {
    return this.workouts.list(limit, offset);
  }

  countWorkouts(): number {
    return this.workouts.count();
  }

  getWorkout(id: number): Workout | null {
    return this.workouts.get(id);
  }

  requireWorkout(id: number): Workout {
    return this.workouts.require(id);
  }

  createWorkout(input: WorkoutInput, options?: { copyFrom?: number }): Workout {
    return this.workouts.create(input, options);
  }

  updateWorkout(id: number, patch: Partial<WorkoutInput>): Workout {
    return this.workouts.update(id, patch);
  }

  deleteWorkout(id: number): void {
    this.workouts.delete(id);
  }

  // --------------------------------------------------------------------- sets

  listSets(workoutId: number): LiftSet[] {
    return this.sets.list(workoutId);
  }

  getSet(id: number): LiftSet | null {
    return this.sets.get(id);
  }

  requireSet(id: number): LiftSet {
    return this.sets.require(id);
  }

  createSet(workoutId: number, input: SetInput): LiftSet {
    return this.sets.create(workoutId, input);
  }

  updateSet(id: number, patch: Partial<SetInput>): LiftSet {
    return this.sets.update(id, patch);
  }

  deleteSet(id: number): void {
    this.sets.delete(id);
  }

  // -------------------------------------------------------------------- stats

  summary() {
    return this.stats.summary();
  }
}
