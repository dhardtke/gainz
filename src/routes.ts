import { errorResponse, json, noContent, notFound, readJsonObject } from "./http";
import type { ExerciseInput, Repo, SetInput, WorkoutInput } from "./repo";
import { isPresent, optionalString, pathId, queryInt, requiredDate, requiredInt, requiredNumber, requiredString, today } from "./validate";

/** A request as Bun hands it to a parameterised route handler. */
type ParamRequest = Request & { params: Record<string, string | undefined> };

type Handler = (req: ParamRequest) => Response | Promise<Response>;

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
function guard(handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function guardAll<T extends Record<string, Handler>>(handlers: T): T {
  return Object.fromEntries(Object.entries(handlers).map(([method, handler]) => [method, guard(handler)])) as T;
}

const MAX_NAME = 120;
const MAX_NOTES = 2000;

function readExerciseBody(body: Record<string, unknown>): ExerciseInput {
  return {
    name: requiredString(body, "name", MAX_NAME),
    muscle_group: optionalString(body, "muscle_group", 60),
    notes: optionalString(body, "notes", MAX_NOTES),
  };
}

function readWorkoutBody(body: Record<string, unknown>): WorkoutInput {
  return {
    performed_on: isPresent(body, "performed_on") ? requiredDate(body, "performed_on") : today(),
    title: optionalString(body, "title", MAX_NAME),
    notes: optionalString(body, "notes", MAX_NOTES),
  };
}

function readSetBody(body: Record<string, unknown>): SetInput {
  return {
    exercise_id: requiredInt(body, "exercise_id", { min: 1 }),
    reps: requiredInt(body, "reps", { min: 1, max: 1000 }),
    weight: requiredNumber(body, "weight", { min: 0, max: 100000 }),
    notes: optionalString(body, "notes", MAX_NOTES),
    ...(isPresent(body, "position") ? { position: requiredInt(body, "position", { min: 0 }) } : {}),
  };
}

/**
 * Builds the Bun.serve route table. Everything lives under /api; the frontend
 * is served as static files by the server module.
 */
export function apiRoutes(repo: Repo) {
  return {
    "/api/health": guardAll({
      GET: () => json({ status: "ok", app: "gainz" }),
    }),

    "/api/stats/summary": guardAll({
      GET: () => json(repo.summary()),
    }),

    // -------------------------------------------------------------- exercises

    "/api/exercises": guardAll({
      GET: () => json(repo.listExercises()),
      POST: async (req) => json(repo.createExercise(readExerciseBody(await readJsonObject(req))), 201),
    }),

    "/api/exercises/:id": guardAll({
      GET: (req) => json(repo.requireExercise(pathId(req.params.id, "exercise"))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, "exercise");
        const body = await readJsonObject(req);
        const patch: Partial<ExerciseInput> = {};
        if (isPresent(body, "name")) patch.name = requiredString(body, "name", MAX_NAME);
        if (isPresent(body, "muscle_group")) patch.muscle_group = optionalString(body, "muscle_group", 60);
        if (isPresent(body, "notes")) patch.notes = optionalString(body, "notes", MAX_NOTES);
        return json(repo.updateExercise(id, patch));
      },

      DELETE: (req) => {
        repo.deleteExercise(pathId(req.params.id, "exercise"));
        return noContent();
      },
    }),

    "/api/exercises/:id/progress": guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, "exercise");
        return json({
          exercise: repo.requireExercise(id),
          sessions: repo.exerciseProgress(id),
          best_set: repo.exerciseBestSet(id),
        });
      },
    }),

    // --------------------------------------------------------------- workouts

    "/api/workouts": guardAll({
      GET: (req) => {
        const params = new URL(req.url).searchParams;
        const limit = queryInt(params, "limit", 50, { min: 1, max: 200 });
        const offset = queryInt(params, "offset", 0, { min: 0, max: 100000 });
        return json({ items: repo.listWorkouts(limit, offset), total: repo.countWorkouts(), limit, offset });
      },

      POST: async (req) => {
        const body = await readJsonObject(req);
        const workout = repo.createWorkout(readWorkoutBody(body));
        if (isPresent(body, "copy_from_workout_id")) {
          const sourceId = requiredInt(body, "copy_from_workout_id", { min: 1 });
          repo.requireWorkout(sourceId);
          repo.copySets(sourceId, workout.id);
        }
        return json({ ...workout, sets: repo.listSets(workout.id) }, 201);
      },
    }),

    "/api/workouts/:id": guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, "workout");
        return json({ ...repo.requireWorkout(id), sets: repo.listSets(id) });
      },

      PATCH: async (req) => {
        const id = pathId(req.params.id, "workout");
        const body = await readJsonObject(req);
        const patch: Partial<WorkoutInput> = {};
        if (isPresent(body, "performed_on")) patch.performed_on = requiredDate(body, "performed_on");
        if (isPresent(body, "title")) patch.title = optionalString(body, "title", MAX_NAME);
        if (isPresent(body, "notes")) patch.notes = optionalString(body, "notes", MAX_NOTES);
        return json(repo.updateWorkout(id, patch));
      },

      DELETE: (req) => {
        repo.deleteWorkout(pathId(req.params.id, "workout"));
        return noContent();
      },
    }),

    "/api/workouts/:id/sets": guardAll({
      GET: (req) => {
        const id = pathId(req.params.id, "workout");
        repo.requireWorkout(id);
        return json(repo.listSets(id));
      },

      POST: async (req) => {
        const id = pathId(req.params.id, "workout");
        return json(repo.createSet(id, readSetBody(await readJsonObject(req))), 201);
      },
    }),

    // ------------------------------------------------------------------- sets

    "/api/sets/:id": guardAll({
      GET: (req) => json(repo.requireSet(pathId(req.params.id, "set"))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, "set");
        const body = await readJsonObject(req);
        const patch: Partial<SetInput> = {};
        if (isPresent(body, "exercise_id")) patch.exercise_id = requiredInt(body, "exercise_id", { min: 1 });
        if (isPresent(body, "reps")) patch.reps = requiredInt(body, "reps", { min: 1, max: 1000 });
        if (isPresent(body, "weight")) patch.weight = requiredNumber(body, "weight", { min: 0, max: 100000 });
        if (isPresent(body, "notes")) patch.notes = optionalString(body, "notes", MAX_NOTES);
        if (isPresent(body, "position")) patch.position = requiredInt(body, "position", { min: 0 });
        return json(repo.updateSet(id, patch));
      },

      DELETE: (req) => {
        repo.deleteSet(pathId(req.params.id, "set"));
        return noContent();
      },
    }),

    "/api/*": guard(() => errorResponse(notFound("Endpoint"))),
  };
}
