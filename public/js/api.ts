/** Thin client for the gainz REST API. No dependencies, just fetch. */

import type { Exercise, ExerciseInput, ExerciseProgress, ExerciseWithStats } from "./types.ts";
import type { LiftSet, SetInput, Summary, Workout, WorkoutInput, WorkoutPage, WorkoutWithSets } from "./types.ts";

export class ApiError extends Error {
  /** The HTTP status, or 0 when the request never left. */
  status: number;
  /** Whatever the server put in `details`, if anything. */
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * The message to show a user for a thrown value.
 *
 * Everything the API client throws is an `ApiError`, but a `catch` binding is
 * `unknown` and a bug in a view would land here too, so fall back to the value
 * itself rather than showing "undefined".
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One request against the API.
 *
 * The response body is whatever the server sent, so `T` is a promise the caller
 * makes rather than one this function keeps — every method on `api` below
 * declares the shape its own endpoint returns, and those declarations are the
 * single place the frontend states what it expects.
 *
 * @returns the parsed body, or `null` for a 204.
 * @throws {ApiError} on a transport failure or a non-2xx response.
 */
async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      // oxlint-disable-next-line unicorn/no-invalid-fetch-options
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError("Could not reach the gainz server", 0, cause);
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(data?.error ?? `Request failed (${response.status})`, response.status, data?.details);
  }
  return data;
}

const get = <T>(path: string): Promise<T> => request<T>("GET", path);

const post = <T>(path: string, body?: unknown): Promise<T> => request<T>("POST", path, body ?? {});

const patch = <T>(path: string, body?: unknown): Promise<T> => request<T>("PATCH", path, body ?? {});

const remove = (path: string): Promise<null> => request<null>("DELETE", path);

export const api = {
  summary: (): Promise<Summary> => get("/stats/summary"),

  exercises: {
    list: (): Promise<ExerciseWithStats[]> => get("/exercises"),

    get: (id: number | string): Promise<Exercise> => get(`/exercises/${id}`),

    progress: (id: number | string): Promise<ExerciseProgress> => get(`/exercises/${id}/progress`),

    create: (input: ExerciseInput): Promise<Exercise> => post("/exercises", input),

    update: (id: number | string, patchBody: Partial<ExerciseInput>): Promise<Exercise> => patch(`/exercises/${id}`, patchBody),

    remove: (id: number | string): Promise<null> => remove(`/exercises/${id}`),
  },

  workouts: {
    list: ({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<WorkoutPage> => get(`/workouts?limit=${limit}&offset=${offset}`),

    get: (id: number | string): Promise<WorkoutWithSets> => get(`/workouts/${id}`),

    create: (input: WorkoutInput): Promise<WorkoutWithSets> => post("/workouts", input),

    /** Updates the header only — the response carries no `sets`. */
    update: (id: number | string, patchBody: Partial<WorkoutInput>): Promise<Workout> => patch(`/workouts/${id}`, patchBody),

    remove: (id: number | string): Promise<null> => remove(`/workouts/${id}`),

    addSet: (id: number | string, input: SetInput): Promise<LiftSet> => post(`/workouts/${id}/sets`, input),
  },

  sets: {
    update: (id: number | string, patchBody: Partial<SetInput>): Promise<LiftSet> => patch(`/sets/${id}`, patchBody),

    remove: (id: number | string): Promise<null> => remove(`/sets/${id}`),
  },
};
