import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { openDatabase } from "../src/db";
import type { Exercise, ExerciseWithStats, LiftSet, SessionPoint, Summary, Workout, WorkoutWithStats } from "../src/repo";
import { Repo } from "../src/repo";
import { serveOptions } from "../src/server";

/** `GET /api/workouts/:id` and `POST /api/workouts`: a workout with its sets. */
interface WorkoutDetail extends Workout {
  sets: LiftSet[];
}

/** One page of `GET /api/workouts`. */
interface WorkoutPage {
  items: WorkoutWithStats[];
  total: number;
  limit: number;
  offset: number;
}

/** `GET /api/exercises/:id/progress`. */
interface Progress {
  exercise: Exercise;
  sessions: SessionPoint[];
  best_set: (LiftSet & { performed_on: string }) | null;
}

/** What the server puts in a 4xx body. */
interface ErrorBody {
  error: string;
}

let db: Database;
let server: Server<undefined>;
let base: string;

beforeEach(() => {
  db = openDatabase(":memory:");
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown): Promise<Response> {
  return api(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Reads a response body as the shape the endpoint documents.
 *
 * Bun types `json()` as `Promise<any>` and offers no generic overload, so the
 * claim has to be asserted somewhere. Here it is asserted once, and each call
 * site names the shape it is claiming.
 */
async function body<T>(res: Response): Promise<T> {
  const parsed: unknown = await res.json();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return parsed as T;
}

/** The element at `index`, failing the test rather than typing as possibly-absent. */
function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an element at index ${index}, but the array holds ${items.length}`);
  }
  return item;
}

async function createExercise(name = "Bench Press"): Promise<Exercise> {
  const res = await post("/api/exercises", { name });
  expect(res.status).toBe(201);
  return body<Exercise>(res);
}

async function createWorkout(performed_on = "2026-01-05"): Promise<WorkoutDetail> {
  const res = await post("/api/workouts", { performed_on, title: "Push day" });
  expect(res.status).toBe(201);
  return body<WorkoutDetail>(res);
}

describe("health and routing", () => {
  test("health endpoint responds", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", app: "gainz" });
  });

  test("unknown api endpoint returns a JSON 404", async () => {
    const res = await api("/api/nope");
    expect(res.status).toBe(404);
    expect((await body<ErrorBody>(res)).error).toContain("not found");
  });

  test("serves the frontend at the root", async () => {
    const res = await api("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("gainz");
  });

  test("rejects directory traversal below public/", async () => {
    const res = await api("/../package.json");
    expect(res.status).toBe(404);
  });

  test("serves the app stylesheets", async () => {
    for (const path of ["/css/app.css", "/css/shared.css", "/components/gz-app/gz-app.css"]) {
      const res = await api(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/css");
    }
  });

  test("serves Pico from node_modules at a fixed vendor path", async () => {
    const res = await api("/vendor/pico.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toContain("Pico CSS");
  });

  test("exposes only the allowlisted vendor file, not node_modules", async () => {
    expect((await api("/vendor/pico.scss")).status).toBe(404);
    expect((await api("/node_modules/@picocss/pico/package.json")).status).toBe(404);
  });
});

describe("typescript modules", () => {
  test("serves a .ts module as JavaScript with its types erased", async () => {
    const res = await api("/js/format.ts");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");

    const body = await res.text();
    expect(body).toContain("export const UNIT");
    // The source annotates every export; none of that may reach the browser.
    expect(body).not.toContain(": string");
    expect(body).not.toContain("| null | undefined");
  });

  test("leaves import specifiers alone, so a URL names a real file", async () => {
    const body = await (await api("/components/gz-chart/gz-chart.ts")).text();
    expect(body).toContain('from "../../js/format.ts"');
  });

  test("serves the entry point index.html names", async () => {
    const page = await (await api("/")).text();
    expect(page).toContain('src="/js/main.ts"');

    const res = await api("/js/main.ts");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toContain("../components/gz-app/gz-app.ts");
  });

  test("erases a types-only module to nothing the browser runs", async () => {
    const body = await (await api("/js/types.ts")).text();
    // Every declaration in types.ts is a type, so nothing survives erasure. The
    // browser never asks for it either — see the type-only import test below.
    expect(body.trim()).toBe("");
  });

  test("strips type-only imports, so types.ts is never fetched at runtime", async () => {
    const body = await (await api("/components/gz-set-row/gz-set-row.ts")).text();
    expect(body).not.toContain("js/types.ts");
  });

  test("keeps the load-bearing top-level await that pairs a module with its CSS", async () => {
    const body = await (await api("/components/gz-chart/gz-chart.ts")).text();
    expect(body).toContain('await define("gz-chart"');
  });

  test("answers HEAD with the headers and no body", async () => {
    const res = await api("/js/format.ts", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toBe("");
  });

  test("returns 404 for a .ts file that does not exist", async () => {
    expect((await api("/js/nope.ts")).status).toBe(404);
  });

  test("refuses to transpile anything outside public/", async () => {
    // Encoded, so the URL parser cannot normalise the traversal away before
    // resolveStaticPath sees it.
    expect((await api("/%2e%2e/src/server.ts")).status).toBe(404);
    expect((await api("/%2e%2e/src/transpile.ts")).status).toBe(404);
  });

  test("reports a module that will not parse", async () => {
    const broken = resolve(import.meta.dir, "..", "public", "js", "__broken.ts");
    await Bun.write(broken, "export const oops: = ;\n");
    try {
      const res = await api("/js/__broken.ts");
      expect(res.status).toBe(500);
      expect(await res.text()).toContain("__broken.ts");
    } finally {
      await unlink(broken);
    }
  });
});

describe("exercises", () => {
  test("creates and lists exercises", async () => {
    const created = await createExercise("Back Squat");
    expect(created).toMatchObject({ name: "Back Squat" });

    const list = await body<ExerciseWithStats[]>(await api("/api/exercises"));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Back Squat", set_count: 0, workout_count: 0 });
  });

  test("rejects a blank name", async () => {
    const res = await post("/api/exercises", { name: "   " });
    expect(res.status).toBe(400);
    expect((await body<ErrorBody>(res)).error).toContain("name");
  });

  test("rejects a duplicate name regardless of case", async () => {
    await createExercise("Deadlift");
    const res = await post("/api/exercises", { name: "deadlift" });
    expect(res.status).toBe(409);
  });

  test("updates only the supplied fields", async () => {
    const exercise = await createExercise();
    const res = await patch(`/api/exercises/${exercise.id}`, { muscle_group: "Chest" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Bench Press", muscle_group: "Chest" });
  });

  test("returns 404 for a missing exercise", async () => {
    expect((await api("/api/exercises/9999")).status).toBe(404);
  });

  test("refuses to delete an exercise that has logged sets", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 });

    const res = await api(`/api/exercises/${exercise.id}`, { method: "DELETE" });
    expect(res.status).toBe(409);
  });

  test("deletes an unused exercise", async () => {
    const exercise = await createExercise();
    expect((await api(`/api/exercises/${exercise.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await api(`/api/exercises/${exercise.id}`)).status).toBe(404);
  });
});

describe("workouts and sets", () => {
  test("logs sets and returns them with the workout", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();

    await post(`/api/workouts/${workout.id}/sets`, {
      exercise_id: exercise.id,
      reps: 8,
      weight: 60,
      notes: "warm-up",
    });
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 6, weight: 70 });

    const detail = await body<WorkoutDetail>(await api(`/api/workouts/${workout.id}`));
    expect(detail.sets).toHaveLength(2);
    expect(detail.sets[0]).toMatchObject({ reps: 8, weight: 60, notes: "warm-up", exercise_name: "Bench Press" });
    expect(at(detail.sets, 1).position).toBeGreaterThan(at(detail.sets, 0).position);
  });

  test("defaults the workout date to today", async () => {
    const res = await post("/api/workouts", {});
    expect(res.status).toBe(201);
    expect((await body<Workout>(res)).performed_on).toBe(new Date().toISOString().slice(0, 10));
  });

  test("rejects an invalid date", async () => {
    const res = await post("/api/workouts", { performed_on: "05.01.2026" });
    expect(res.status).toBe(400);
  });

  test("rejects non-positive reps and unknown exercises", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();

    expect((await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 0, weight: 60 })).status).toBe(400);
    expect((await post(`/api/workouts/${workout.id}/sets`, { exercise_id: 4242, reps: 5, weight: 60 })).status).toBe(404);
  });

  test("updates and deletes a set", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    const set = await body<LiftSet>(await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 }));

    const updated = await body<LiftSet>(await patch(`/api/sets/${set.id}`, { reps: 6, weight: 62.5 }));
    expect(updated).toMatchObject({ reps: 6, weight: 62.5 });

    expect((await api(`/api/sets/${set.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await api(`/api/workouts/${workout.id}`)).status).toBe(200);
    expect((await body<WorkoutDetail>(await api(`/api/workouts/${workout.id}`))).sets).toHaveLength(0);
  });

  test("deleting a workout removes its sets", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    const set = await body<LiftSet>(await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 }));

    expect((await api(`/api/workouts/${workout.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await api(`/api/sets/${set.id}`)).status).toBe(404);
  });

  test("copies sets from a previous workout", async () => {
    const exercise = await createExercise();
    const source = await createWorkout("2026-01-05");
    await post(`/api/workouts/${source.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 });
    await post(`/api/workouts/${source.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 65 });

    const res = await post("/api/workouts", { performed_on: "2026-01-12", copy_from_workout_id: source.id });
    expect(res.status).toBe(201);
    const copy = await body<WorkoutDetail>(res);
    expect(copy.sets).toHaveLength(2);
    expect(copy.sets.map((s) => s.weight)).toEqual([60, 65]);
  });

  test("copying from a missing workout creates nothing", async () => {
    await createWorkout("2026-01-05");
    const before = (await body<WorkoutPage>(await api("/api/workouts"))).total;

    const res = await post("/api/workouts", { performed_on: "2026-01-12", copy_from_workout_id: 9999 });

    expect(res.status).toBe(404);
    expect((await body<WorkoutPage>(await api("/api/workouts"))).total).toBe(before);
  });

  test("rejects a malformed copy_from_workout_id before writing anything", async () => {
    const before = (await body<WorkoutPage>(await api("/api/workouts"))).total;

    const res = await post("/api/workouts", { performed_on: "2026-01-12", copy_from_workout_id: "nope" });

    expect(res.status).toBe(400);
    expect((await body<WorkoutPage>(await api("/api/workouts"))).total).toBe(before);
  });

  test("lists workouts with roll-up statistics", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 10, weight: 50 });
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 });

    const page = await body<WorkoutPage>(await api("/api/workouts"));
    expect(page).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(page.items[0]).toMatchObject({ set_count: 2, exercise_count: 1, total_reps: 15, total_volume: 800 });
  });

  test("rejects an out-of-range limit", async () => {
    expect((await api("/api/workouts?limit=9999")).status).toBe(400);
  });
});

describe("progress", () => {
  test("aggregates one line per session and reports the best set", async () => {
    const exercise = await createExercise();

    for (const [date, weight] of [
      ["2026-01-05", 60],
      ["2026-01-12", 65],
    ] as const) {
      const workout = await body<WorkoutDetail>(await post("/api/workouts", { performed_on: date }));
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight });
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: weight - 5 });
    }

    const progress = await body<Progress>(await api(`/api/exercises/${exercise.id}/progress`));
    expect(progress.exercise).toMatchObject({ name: "Bench Press" });
    expect(progress.sessions).toHaveLength(2);
    expect(progress.sessions[0]).toMatchObject({ performed_on: "2026-01-05", set_count: 2, top_weight: 60 });
    expect(at(progress.sessions, 1).top_weight).toBe(65);
    // Epley: 65 * (1 + 5/30) ~= 75.83
    expect(progress.best_set?.weight).toBe(65);
    expect(at(progress.sessions, 1).est_one_rep_max).toBeCloseTo(75.83, 1);
  });
});

describe("stats", () => {
  test("summarises the whole log", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 10, weight: 40 });

    const summary = await body<Summary>(await api("/api/stats/summary"));
    expect(summary).toMatchObject({
      workout_count: 1,
      set_count: 1,
      total_reps: 10,
      total_volume: 400,
      exercise_count: 1,
      last_performed_on: "2026-01-05",
    });
  });
});

describe("request bodies", () => {
  test("rejects malformed JSON", async () => {
    const res = await api("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  test("rejects a non-object body", async () => {
    const res = await post("/api/exercises", ["Bench Press"]);
    expect(res.status).toBe(400);
  });
});
