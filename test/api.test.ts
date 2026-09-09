import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import { openDatabase } from "../src/db";
import { Repo } from "../src/repo";
import { serveOptions } from "../src/server";

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

async function createExercise(name = "Bench Press") {
  const res = await post("/api/exercises", { name });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number; name: string };
}

async function createWorkout(performed_on = "2026-01-05") {
  const res = await post("/api/workouts", { performed_on, title: "Push day" });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number };
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
    expect((await res.json()).error).toContain("not found");
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
    for (const path of ["/css/app.css", "/css/shared.css", "/css/gz-app.css"]) {
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

describe("exercises", () => {
  test("creates and lists exercises", async () => {
    const created = await createExercise("Back Squat");
    expect(created).toMatchObject({ name: "Back Squat" });

    const list = await (await api("/api/exercises")).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Back Squat", set_count: 0, workout_count: 0 });
  });

  test("rejects a blank name", async () => {
    const res = await post("/api/exercises", { name: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("name");
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

    const detail = await (await api(`/api/workouts/${workout.id}`)).json();
    expect(detail.sets).toHaveLength(2);
    expect(detail.sets[0]).toMatchObject({ reps: 8, weight: 60, notes: "warm-up", exercise_name: "Bench Press" });
    expect(detail.sets[1].position).toBeGreaterThan(detail.sets[0].position);
  });

  test("defaults the workout date to today", async () => {
    const res = await post("/api/workouts", {});
    expect(res.status).toBe(201);
    expect((await res.json()).performed_on).toBe(new Date().toISOString().slice(0, 10));
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
    const set = await (
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 })
    ).json();

    const updated = await (await patch(`/api/sets/${set.id}`, { reps: 6, weight: 62.5 })).json();
    expect(updated).toMatchObject({ reps: 6, weight: 62.5 });

    expect((await api(`/api/sets/${set.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await api(`/api/workouts/${workout.id}`)).status).toBe(200);
    expect((await (await api(`/api/workouts/${workout.id}`)).json()).sets).toHaveLength(0);
  });

  test("deleting a workout removes its sets", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    const set = await (
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 })
    ).json();

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
    const copy = await res.json();
    expect(copy.sets).toHaveLength(2);
    expect(copy.sets.map((s: { weight: number }) => s.weight)).toEqual([60, 65]);
  });

  test("lists workouts with roll-up statistics", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 10, weight: 50 });
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 });

    const page = await (await api("/api/workouts")).json();
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
      const workout = await (await post("/api/workouts", { performed_on: date })).json();
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight });
      await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: weight - 5 });
    }

    const progress = await (await api(`/api/exercises/${exercise.id}/progress`)).json();
    expect(progress.exercise).toMatchObject({ name: "Bench Press" });
    expect(progress.sessions).toHaveLength(2);
    expect(progress.sessions[0]).toMatchObject({ performed_on: "2026-01-05", set_count: 2, top_weight: 60 });
    expect(progress.sessions[1].top_weight).toBe(65);
    // Epley: 65 * (1 + 5/30) ~= 75.83
    expect(progress.best_set.weight).toBe(65);
    expect(progress.sessions[1].est_one_rep_max).toBeCloseTo(75.83, 1);
  });
});

describe("stats", () => {
  test("summarises the whole log", async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 10, weight: 40 });

    const summary = await (await api("/api/stats/summary")).json();
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
