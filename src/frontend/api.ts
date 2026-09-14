/** Thin client for the gainz REST API. No dependencies, just fetch. */

import type {
  CreateExerciseDto,
  CreateSetDto,
  CreateWorkoutDto,
  EditExerciseDto,
  EditSetDto,
  EditWorkoutDto,
  ExerciseDto,
  ExerciseProgressDto,
  ExerciseWithStatsDto,
  LiftSetDto,
  SummaryDto,
  WorkoutDto,
  WorkoutPageDto,
  WorkoutWithSetsDto,
} from '../shared/dto';
import type { ExerciseId, LiftSetId, WorkoutId } from '../shared/flavors.ts';

export class ApiError extends Error {
  /** The HTTP status, or 0 when the request never left. */
  status: number;
  /** Whatever the server put in `details`, if anything. */
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = 'ApiError';
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
 * @returns the parsed body, or `null` when there is no body — a 204, say.
 * @throws {ApiError} on a transport failure or a non-2xx response.
 */
async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      // oxlint-disable-next-line unicorn/no-invalid-fetch-options
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError('Could not reach the gainz server', 0, cause);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text === '' ? null : JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    // The shape being narrowed toward is `ErrorDto`, but it is narrowed rather than claimed:
    // every other endpoint's DTO is asserted below, and an error body is the one response the
    // client cannot assume arrived well-formed — a 502 from a proxy carries no JSON at all.
    const errorBody = typeof data === 'object' && data !== null ? data : {};
    const message = 'error' in errorBody && typeof errorBody.error === 'string' ? errorBody.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, 'details' in errorBody ? errorBody.details : undefined);
  }

  // The methods on `api` below declare what each endpoint returns. This is the
  // one place that declaration is asserted rather than proven — validating it
  // would mean a schema library, and this app deliberately has none.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the server contract boundary
  return data as T;
}

const get = <T>(path: string): Promise<T> => request<T>('GET', path);

const post = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body ?? {});

const patch = <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body ?? {});

const remove = (path: string): Promise<null> => request<null>('DELETE', path);

// TODO split up object into separate services
export const api = {
  summary: (): Promise<SummaryDto> => get('/stats/summary'),

  exercises: {
    list: (): Promise<ExerciseWithStatsDto[]> => get('/exercises'),

    get: (id: ExerciseId): Promise<ExerciseDto> => get(`/exercises/${id}`),

    progress: (id: ExerciseId): Promise<ExerciseProgressDto> => get(`/exercises/${id}/progress`),

    create: (input: CreateExerciseDto): Promise<ExerciseDto> => post('/exercises', input),

    update: (id: ExerciseId, patchBody: EditExerciseDto): Promise<ExerciseDto> => patch(`/exercises/${id}`, patchBody),

    remove: (id: ExerciseId): Promise<null> => remove(`/exercises/${id}`),
  },

  workouts: {
    list: ({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<WorkoutPageDto> => get(`/workouts?limit=${limit}&offset=${offset}`),

    get: (id: WorkoutId): Promise<WorkoutWithSetsDto> => get(`/workouts/${id}`),

    create: (input: CreateWorkoutDto): Promise<WorkoutWithSetsDto> => post('/workouts', input),

    /** Updates the header only — the response carries no `sets`. */
    update: (id: WorkoutId, patchBody: EditWorkoutDto): Promise<WorkoutDto> => patch(`/workouts/${id}`, patchBody),

    remove: (id: WorkoutId): Promise<null> => remove(`/workouts/${id}`),

    addSet: (id: WorkoutId, input: CreateSetDto): Promise<LiftSetDto> => post(`/workouts/${id}/sets`, input),
  },

  sets: {
    update: (id: LiftSetId, patchBody: EditSetDto): Promise<LiftSetDto> => patch(`/sets/${id}`, patchBody),

    remove: (id: LiftSetId): Promise<null> => remove(`/sets/${id}`),
  },
};
