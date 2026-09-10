import { describe, expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { HttpError } from "../src/http";
import type { Summary } from "../src/repo";
import { Repo } from "../src/repo";
import { serveOptions } from "../src/server";
import type { ErrorBody } from "./helpers/server";
import { body, useServer } from "./helpers/server";

const { api, post, createExercise, createWorkout } = useServer();

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

  // Called directly rather than over HTTP: `guardAll` wraps the method maps and `guard` the
  // `/api/*` catch-all, so no request can reach the hook through the route table. What is
  // under test is our wiring in `serveOptions`, not Bun's dispatch. The 500 branch logs one
  // `Unhandled error: Error: boom` line to stderr on the way past.
  test("renders errors through Bun.serve's error hook", () => {
    const db = openDatabase(":memory:");
    try {
      const { error } = serveOptions(new Repo(db));

      expect(error(new HttpError(418, "teapot")).status).toBe(418);
      expect(error(new Error("boom")).status).toBe(500);
    } finally {
      db.close();
    }
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
