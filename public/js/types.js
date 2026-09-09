/**
 * The shapes the gainz REST API returns, written out for the frontend.
 *
 * These mirror the interfaces in `src/repo.ts` by hand — `public/` is served to
 * the browser as-is and does not reach into the server's source, not even for a
 * type that would be erased. Changing a column there means changing it here;
 * `bun run typecheck` will not catch the drift for you.
 *
 * Nothing imports this module at runtime. Consumers name what they need in an
 * `@import` tag, which lives in a comment the browser never sees.
 */

/**
 * @typedef {object} Exercise
 * @property {number} id
 * @property {string} name
 * @property {string | null} muscle_group
 * @property {string | null} notes
 * @property {string} created_at
 */

/**
 * @typedef {Exercise & {
 *   set_count: number,
 *   workout_count: number,
 *   last_performed_on: string | null,
 *   best_weight: number | null,
 * }} ExerciseWithStats
 */

/**
 * @typedef {object} Workout
 * @property {number} id
 * @property {string} performed_on ISO date, `YYYY-MM-DD`.
 * @property {string | null} title
 * @property {string | null} notes
 * @property {string} created_at
 */

/**
 * @typedef {Workout & {
 *   set_count: number,
 *   exercise_count: number,
 *   total_reps: number,
 *   total_volume: number,
 * }} WorkoutWithStats
 */

/**
 * A workout with its sets. `GET /workouts/:id` and `POST /workouts` return this;
 * `PATCH /workouts/:id` returns the bare `Workout`.
 *
 * @typedef {Workout & { sets: LiftSet[] }} WorkoutWithSets
 */

/**
 * @typedef {object} LiftSet
 * @property {number} id
 * @property {number} workout_id
 * @property {number} exercise_id
 * @property {string} exercise_name
 * @property {number} reps
 * @property {number} weight
 * @property {string | null} notes
 * @property {number} position
 * @property {string} created_at
 */

/**
 * One session on an exercise's progress line.
 *
 * @typedef {object} SessionPoint
 * @property {number} workout_id
 * @property {string} performed_on
 * @property {number} set_count
 * @property {number} total_reps
 * @property {number} total_volume
 * @property {number} top_weight
 * @property {number} est_one_rep_max Epley estimate from the session's best set.
 */

/**
 * @typedef {object} Summary
 * @property {number} workout_count
 * @property {number} set_count
 * @property {number} total_reps
 * @property {number} total_volume
 * @property {number} exercise_count
 * @property {string | null} last_performed_on
 * @property {number} workouts_last_30_days
 * @property {number} volume_last_30_days
 */

/**
 * One page of the training log.
 *
 * @typedef {object} WorkoutPage
 * @property {WorkoutWithStats[]} items
 * @property {number} total every workout, not just this page.
 * @property {number} limit
 * @property {number} offset
 */

/**
 * Everything the exercise detail view plots.
 *
 * @typedef {object} ExerciseProgress
 * @property {Exercise} exercise
 * @property {SessionPoint[]} sessions oldest first.
 * @property {(LiftSet & { performed_on: string }) | null} best_set
 */

/**
 * The body of a create request. The optional fields may be left out entirely —
 * the server normalises a missing value, an empty string and null all to null.
 *
 * @typedef {object} ExerciseInput
 * @property {string} name
 * @property {string | null} [muscle_group]
 * @property {string | null} [notes]
 */

/**
 * The body of `POST /workouts`. Every field is optional: a workout with nothing
 * set is today's empty session.
 *
 * @typedef {object} WorkoutInput
 * @property {string} [performed_on] defaults to today on the server.
 * @property {string | null} [title]
 * @property {string | null} [notes]
 * @property {number} [copy_from_workout_id] copies that workout's sets into the new one.
 */

/**
 * @typedef {object} SetInput
 * @property {number} exercise_id
 * @property {number} reps
 * @property {number} weight
 * @property {string | null} [notes]
 * @property {number} [position] appended to the workout when left out.
 */

export {};
