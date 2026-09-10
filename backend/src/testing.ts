/**
 * Test-only. The harness every *.test.ts under backend/src/ builds its fixtures from;
 * no production module imports it.
 */
import { afterEach, beforeEach, expect } from 'bun:test';
import type { Server } from 'bun';
import type { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db';
import type { Exercise, LiftSet, SessionPoint, Workout, WorkoutWithStats } from './repo';
import { Repo } from './repo';
import { serveOptions } from './server';

/** `GET /api/workouts/:id` and `POST /api/workouts`: a workout with its sets. */
export interface WorkoutDetail extends Workout {
  sets: LiftSet[];
}

/** One page of `GET /api/workouts`. */
export interface WorkoutPage {
  items: WorkoutWithStats[];
  total: number;
  limit: number;
  offset: number;
}

/** `GET /api/exercises/:id/progress`. */
export interface Progress {
  exercise: Exercise;
  sessions: SessionPoint[];
  best_set: (LiftSet & { performed_on: string }) | null;
}

/** What the server puts in a 4xx body. */
export interface ErrorBody {
  error: string;
}

/** The request helpers a test file gets from `useServer()`. */
export interface TestServer {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  post: (path: string, body: unknown) => Promise<Response>;
  patch: (path: string, body: unknown) => Promise<Response>;
  createExercise: (name?: string) => Promise<Exercise>;
  createWorkout: (performed_on?: string) => Promise<WorkoutDetail>;
}

/**
 * Gives the calling test file a real server on port 0 over an in-memory
 * database, torn down and rebuilt around every test.
 *
 * The lifecycle hooks are registered from inside this function rather than at
 * the module's top level, so each file that calls it gets its own hooks and its
 * own database instead of sharing one through the module cache.
 */
export function useServer(): TestServer {
  let db: Database;
  let server: Server<undefined>;
  let base = '';

  beforeEach(() => {
    db = openDatabase(':memory:');
    server = Bun.serve({ port: 0, ...serveOptions(new Repo(db)) });
    base = server.url.origin;
  });

  afterEach(async () => {
    await server.stop(true);
    db.close();
  });

  function api(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${base}${path}`, init);
  }

  function post(path: string, body: unknown): Promise<Response> {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function patch(path: string, body: unknown): Promise<Response> {
    return api(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function createExercise(name = 'Bench Press'): Promise<Exercise> {
    const res = await post('/api/exercises', { name });
    expect(res.status).toBe(201);
    return body<Exercise>(res);
  }

  async function createWorkout(performed_on = '2026-01-05'): Promise<WorkoutDetail> {
    const res = await post('/api/workouts', { performed_on, title: 'Push day' });
    expect(res.status).toBe(201);
    return body<WorkoutDetail>(res);
  }

  return { api, post, patch, createExercise, createWorkout };
}

/** A throwaway directory, made before each test and removed after it. */
export function useTempDir(): () => string {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gainz-'));
  });

  afterEach(() => {
    // Recursive, so the WAL/SHM sidecars of any file database written here go too. Windows releases
    // the handle a moment after close(), so retry rather than fail the test on EBUSY.
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  return () => dir;
}

/**
 * Reads a response body as the shape the endpoint documents.
 *
 * Bun types `json()` as `Promise<any>` and offers no generic overload, so the
 * claim has to be asserted somewhere. Here it is asserted once, and each call
 * site names the shape it is claiming.
 */
export async function body<T>(res: Response): Promise<T> {
  const parsed: unknown = await res.json();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return parsed as T;
}

/** The element at `index`, failing the test rather than typing as possibly-absent. */
export function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an element at index ${index}, but the array holds ${items.length}`);
  }
  return item;
}
