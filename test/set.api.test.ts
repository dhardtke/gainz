import { describe, expect, test } from "bun:test";
import type { LiftSet } from "../src/repo";
import type { WorkoutDetail } from "./helpers/server";
import { at, body, useServer } from "./helpers/server";

const { api, post, patch, createExercise, createWorkout } = useServer();

describe("sets", () => {
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
});
