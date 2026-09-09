/** Thin client for the gainz REST API. No dependencies, just fetch. */

/** @import { Exercise, ExerciseInput, ExerciseProgress, ExerciseWithStats } from "./types.js" */
/** @import { LiftSet, SetInput, Summary, Workout, WorkoutInput, WorkoutPage, WorkoutWithSets } from "./types.js" */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status the HTTP status, or 0 when the request never left.
   * @param {unknown} details whatever the server put in `details`, if anything.
   */
  constructor(message, status, details) {
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
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
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
 * @template T
 * @param {"GET" | "POST" | "PATCH" | "DELETE"} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<T>} the parsed body, or `null` for a 204.
 * @throws {ApiError} on a transport failure or a non-2xx response.
 */
async function request(method, path, body) {
  let response;
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

  if (response.status === 204) return /** @type {T} */ (null);

  const text = await response.text();
  /** @type {any} */
  let data = null;
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

/** @type {<T>(path: string) => Promise<T>} */
const get = (path) => request("GET", path);

/** @type {<T>(path: string, body?: unknown) => Promise<T>} */
const post = (path, body) => request("POST", path, body ?? {});

/** @type {<T>(path: string, body?: unknown) => Promise<T>} */
const patch = (path, body) => request("PATCH", path, body ?? {});

/** @type {(path: string) => Promise<null>} */
const remove = (path) => request("DELETE", path);

export const api = {
  /** @type {() => Promise<Summary>} */
  summary: () => get("/stats/summary"),

  exercises: {
    /** @type {() => Promise<ExerciseWithStats[]>} */
    list: () => get("/exercises"),

    /** @type {(id: number | string) => Promise<Exercise>} */
    get: (id) => get(`/exercises/${id}`),

    /** @type {(id: number | string) => Promise<ExerciseProgress>} */
    progress: (id) => get(`/exercises/${id}/progress`),

    /** @type {(input: ExerciseInput) => Promise<Exercise>} */
    create: (input) => post("/exercises", input),

    /** @type {(id: number | string, patchBody: Partial<ExerciseInput>) => Promise<Exercise>} */
    update: (id, patchBody) => patch(`/exercises/${id}`, patchBody),

    /** @type {(id: number | string) => Promise<null>} */
    remove: (id) => remove(`/exercises/${id}`),
  },

  workouts: {
    /** @type {(page?: { limit?: number, offset?: number }) => Promise<WorkoutPage>} */
    list: ({ limit = 50, offset = 0 } = {}) => get(`/workouts?limit=${limit}&offset=${offset}`),

    /** @type {(id: number | string) => Promise<WorkoutWithSets>} */
    get: (id) => get(`/workouts/${id}`),

    /** @type {(input: WorkoutInput) => Promise<WorkoutWithSets>} */
    create: (input) => post("/workouts", input),

    /**
     * Updates the header only — the response carries no `sets`.
     *
     * @type {(id: number | string, patchBody: Partial<WorkoutInput>) => Promise<Workout>}
     */
    update: (id, patchBody) => patch(`/workouts/${id}`, patchBody),

    /** @type {(id: number | string) => Promise<null>} */
    remove: (id) => remove(`/workouts/${id}`),

    /** @type {(id: number | string, input: SetInput) => Promise<LiftSet>} */
    addSet: (id, input) => post(`/workouts/${id}/sets`, input),
  },

  sets: {
    /** @type {(id: number | string, patchBody: Partial<SetInput>) => Promise<LiftSet>} */
    update: (id, patchBody) => patch(`/sets/${id}`, patchBody),

    /** @type {(id: number | string) => Promise<null>} */
    remove: (id) => remove(`/sets/${id}`),
  },
};
