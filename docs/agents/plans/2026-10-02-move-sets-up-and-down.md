---
date: 2026-10-02T11:13:25.403549+00:00
git_commit: 5f6f80ffd4c1a4ab399ac86aab0637a0827b00fe
branch: main
topic: 'Move sets up and down'
tags: [plan, workouts, sets, gz-set-row, gz-workout-detail, validate]
status: implemented
---

# PLAN: Move sets up and down

Let the user put a workout's sets into any order by moving each set one place up or down. A joined
▲▼ pair in every set row swaps the set with its neighbor through a new, atomic
`POST /api/sets/:id/move` endpoint. Moving is allowed for done and not-done sets alike, and `/move`
becomes the only way a set's position changes — `position` leaves both request DTOs, so new sets
always append.

## Acceptance Criteria

- Every set row in a workout shows a joined ▲/▼ pair in its actions, right after the volume; ▲ is disabled on the first
  row, ▼ on the last.
- Clicking ▲/▼ swaps the set with its neighbor; the list and the row numbers update.
- Moving works for done and not-done sets alike, and past done neighbors.
- `POST /api/sets/:id/move { "direction": "up" | "down" }` runs in one transaction, renumbers the
  workout's sets 1..n in their current order, swaps, and returns the reordered `LiftSetDto[]`.
- Moving the first set up or the last set down is a 200 with the order unchanged (positions are
  only renumbered).
- An unknown set is a 404; a non-numeric id is a 400; a missing or invalid direction is a 400.
- Workouts whose positions tie or have gaps (from "Repeat" or the old explicit create position)
  move correctly.
- `position` is gone from `CreateSetDto` and `EditSetDto`; sending it is ignored. New sets append.
- After a move, focus returns to the same arrow on the moved row (or to the other arrow if that one
  is now disabled), so repeated key presses keep moving it.
- `docs/backend.md` and `docs/frontend.md` describe the move and the done-lock exception.

## Technical Key Decisions and Tradeoffs

1. **A dedicated move endpoint:** `POST /api/sets/:id/move` with `{ "direction": "up" | "down" }`.
   - Why: one request, atomic, correct even when positions tie or have gaps, and exactly the
     interaction asked for. Two client-side `PATCH { position }` requests would not be atomic and
     do nothing when the two positions are equal; a full `PUT …/order` list is more than up/down
     needs and has to deal with stale lists.
   - Impact: `SetRepository.move` inside `db.transaction()`, `SetFacade.move` with validation,
     `SetController.move`, a `/api/sets/:id/move` entry in `set.routes.ts`, a new `MoveSetDto`.
2. **Renumber, then swap:** every move rewrites the workout's positions to 1..n in the current
   `ORDER BY position, id` order, with the moved set and its neighbor swapped.
   - Why: makes ties and gaps disappear on first touch, without a data migration.
   - Impact: a move at an edge is not a no-op in the database — it still normalizes positions —
     but the visible order does not change, so it answers 200 with the list.
3. **Order is not part of the done lock:** any set moves, and its neighbors renumber freely,
   whatever their done state.
   - Why: the lock protects what was performed (exercise, reps, weight, notes, existence); the
     order a session is listed in is not history. A strict lock would forbid renumbering any
     workout that has a done set in it.
   - Impact: `move` performs no done check; `update` and `delete` keep theirs unchanged.
4. **`position` is no longer client-writable:** removed from `CreateSetDto`, `EditSetDto`, the
   translators, the facade validation, the repository's `CreateSet` and its edit `FIELDS`.
   - Why: one reorder path with one rule. Keeping `PATCH { position }` would leave a done set
     movable through `/move` but not through PATCH; the explicit create position is unused by the
     frontend and is the only source of ties apart from "Repeat".
   - Impact: the translators only pick known keys, so a body still carrying `position` is ignored
     like any unknown key. `SetRepository.create` always appends. One visible change: a
     `PATCH { position }` to a done set, formerly a 409, becomes a 200 no-op, because the patch is
     empty once `position` is dropped.
5. **Validation of `direction` through a new `requiredOneOf` helper** in
   `src/backend/shared/validate.ts`.
   - Why: matches the existing `required*` validators and their 400 messages.
   - Impact: `requiredOneOf(dto, field, values)` returns the narrowed literal type through a type
     guard (no `as` cast, which `no-unsafe-type-assertion` forbids outside translators) and throws
     `badRequest('"direction" must be one of: up, down')` otherwise. Covered in `validate.test.ts`.
   - The repository takes its own `MoveDirection = 'up' | 'down'` rather than importing the wire
     DTO's `SetDirection`, so no repository depends on `src/shared/dto/` (the two literal unions
     are structurally identical, so the facade passes the validated value straight through).
6. **UI: a joined ▲▼ pair in the row's actions, right after the volume.**
   - Why: reuses the existing actions slot on wide and narrow layouts and leaves the row's leading
     toggle, number and exercise untouched.
   - Impact: Oat's `fieldset.group` holds two `outline icon small` buttons — no custom colors.
     Oat gives every `fieldset` a bottom margin and only collapses the shared border for inputs,
     so `gz-set-row.component.css` resets the margin and hides ▲'s inline-end border (mirroring
     Oat's own input rule). `.actions` becomes a `<div>`, since a `<fieldset>` is not valid inside
     a `<span>`; it is styled by class only. `gz-set-row` gains a `last` property (beside
     `index`) so it knows when to disable ▼; ▲ is disabled when `index <= 1` (which also covers
     the NaN fallback of 0). The pair is part of the read view only, so it is absent while the
     row is in edit mode.
7. **Focus restore through a dedicated `set-moved` event**, modeled on `set-logged`.
   - Why: a move reloads the view and re-renders every row, which drops focus; keyboard users
     would have to tab back after each press.
   - Impact: the row emits `set-moved` with `{ id, direction }` instead of `sets-changed`;
     `gz-workout-detail` narrows the event at runtime (like `page-change` in
     `gz-workout-list.component.ts:27-31`, since `CustomEvent.detail` is `any`), reloads, finds the
     row by `data-id` and calls its new `focusMove(direction)`, which focuses that arrow, or the
     other one if it is now disabled.

## Current State

```
gz-workout-detail ──renders──> <gz-set-row data-id data-index> × sets   (API order)
        ▲                               │ toggle-done / edit / duplicate / delete
        │                               ▼
        └── 'sets-changed' → reload ── setFacade ─> PATCH / POST / DELETE

GET /api/workouts/:id ─> SetRepository.list   ORDER BY s.position ASC, s.id ASC
```

- `sets.position INTEGER NOT NULL DEFAULT 0` and the index `idx_sets_workout (workout_id,
  position, id)` already exist (`src/backend/db/migrations/001-initial-schema.sql:28,32`).
- Positions are neither unique nor contiguous: `SetRepository.create` appends at
  `MAX(position) + 1` but accepts any explicit `position >= 0`
  (`src/backend/features/workouts/internal/set.repository.ts:68-71`,
  `src/backend/features/workouts/workouts.facade.ts:114`); "Repeat" copies source positions as they
  are (`src/backend/features/workouts/internal/workout.repository.ts:83-85`).
- `PATCH /api/sets/:id` accepts `position` (`internal/set.translator.ts:22,51-53`), but a done set
  refuses it with 409 like every other field (`set.repository.ts:100-102`, `docs/backend.md:166-171`).
- No frontend code sends `position`; the row number shown is the render index
  (`src/frontend/features/workouts/gz-workout-detail.component.ts:181`).
- The read row is a grid: toggle · index · exercise · load · note · actions
  (`src/frontend/features/workouts/internal/gz-set-row.component.css:5`), with a grid-area layout
  under 720px where `.actions` takes its own line.

```
[✓]  3  Bench Press   80 kg × 5   felt heavy        400  [Edit] [+1] [×]

[✓] 3  Bench Press       80 kg × 5        (≤720px)
       felt heavy
       [Edit] [+1] [×]
```

## Desired End State

```
gz-workout-detail ──renders──> <gz-set-row data-id data-index data-last> × sets
        ▲                               │ move-up / move-down
        │                               ▼
        └── 'set-moved' {id, direction} ── setFacade.move ─> POST /api/sets/:id/move
              → reload → row.focusMove(direction)                 │
                                                                  ▼
                                    SetRepository.move (one transaction)
                                      ids = SELECT id … ORDER BY position, id
                                      swap ids[i] with ids[i ± 1] (if it exists)
                                      UPDATE sets SET position = k WHERE id = ids[k-1]
                                      → list(workout_id)
```

```
[ ]  1  Bench Press   80 kg × 5   felt heavy   400  [▲̶|▼] [Edit] [+1] [×]    ▲ disabled
[ ]  2  Bench Press   82.5 kg × 5              413  [▲|▼]  [Edit] [+1] [×]
[✓]  3  Back Squat    100 kg × 5               500  [▲|▼̶]  [+1]               ▼ disabled, done

≤720px:
[✓] 3  Bench Press       80 kg × 5
       felt heavy
       [▲|▼] [Edit] [+1] [×]
```

## Abstractions and Code Reuse

- `src/shared/dto/set.ts` — drop `position` from `CreateSetDto` and `EditSetDto`; add
  `SetDirection = 'up' | 'down'` and `MoveSetDto { direction: SetDirection }`
- `src/backend/shared/validate.ts` — add `requiredOneOf`
- `src/backend/features/workouts/`
  - `internal/set.repository.ts` — drop `position` from `CreateSet` and `FIELDS`; `create` always
    appends; new `MoveDirection` type and `move(id, direction): LiftSet[]` in `db.transaction()`
  - `internal/set.translator.ts` — drop `position` from the create/edit translators; add
    `translateToMoveSetDto`
  - `workouts.facade.ts` — `SetFacade.move(id, dto)` validating `direction`; drop `position` from
    `#validateCreate` / `#validateEdit`
  - `internal/set.controller.ts` — `SetController.move`, answering `json(list.map(translateToLiftSetDto))`
  - `set.routes.ts` — `'/api/sets/:id/move': { POST }`
- `src/frontend/features/workouts/`
  - `internal/set.api.ts` — `SetApi.move(id, dto)` posting to `/sets/${id}/move`
  - `workouts.facade.ts` — `SetFacade.move(id, direction)`
  - `internal/gz-set-row.component.ts` — `last` setter, ▲▼ pair, `.actions` as a `<div>`,
    `move-up` / `move-down` actions, `focusMove(direction)`
  - `internal/gz-set-row.component.css` — reset the `fieldset.group` margin and collapse the seam
    between the two buttons (no colors)
  - `gz-workout-detail.component.ts` — render `data-last`, pass `row.last`, listen for
    `set-moved` through a small `isSetMoved(detail)` type guard

Reused as is: `db.transaction()`, `pathId`, `json`, `readJsonObject`, `notFound`/`badRequest`,
`GzElement.emit`, `handleAction`, the `useServer` / `useFetch` / `mount` test helpers, and the
`set()` fixture.

## Logging & Observability

None. The server has no request logging yet (see `TODO.md`).

## Implementation

### Phase 1: Move a set through the API

Dependencies: None

Add the move endpoint with its transaction and validation, and make `position` server-owned by
removing it from the request DTOs.

**Tasks**:

- [x] `src/shared/dto/set.ts`: remove `position` (and its doc comment) from `CreateSetDto` and
      `EditSetDto`; add

  ```ts
  export type SetDirection = 'up' | 'down';

  export interface MoveSetDto {
    /** Toward the start (`up`) or the end (`down`) of the workout. */
    direction: SetDirection;
  }
  ```

- [x] `src/backend/shared/validate.ts`: add

  ```ts
  function isOneOf<V extends string>(values: readonly V[], value: unknown): value is V {
    return typeof value === 'string' && (values as readonly string[]).includes(value);
  }

  /** Only one of the listed strings, compared exactly: no trimming, no case folding. */
  export function requiredOneOf<T extends object, V extends string>(dto: T, field: keyof T & string, values: readonly V[]): V {
    const value: unknown = dto[field];
    if (!isOneOf(values, value)) {
      throw badRequest(`"${field}" must be one of: ${values.join(', ')}`);
    }
    return value;
  }
  ```

- [x] `src/backend/shared/validate.test.ts`: `describe('requiredOneOf')` — returns a listed value;
      rejects an unlisted string, a different case (`'UP'`), a number and a missing field with the
      message above.
- [x] `internal/set.repository.ts`: remove `position` from `CreateSet` and from `FIELDS`; in
      `create`, always compute the appended position (drop `input.position ??`).
- [x] `internal/set.repository.ts`: export `type MoveDirection = 'up' | 'down'` beside `EditSet`,
      and add `move`, with a doc comment saying it renumbers so ties and gaps vanish, and that it
      ignores the done lock because order is not history. Written for `noUncheckedIndexedAccess`
      and `strict-void-return`:

  ```ts
  move(id: LiftSetId, direction: MoveDirection): LiftSet[] {
    return this.#db.transaction(() => {
      const { workout_id: workoutId } = this.require(id);
      const ids = this.#db
        .query<{ id: LiftSetId }, [WorkoutId]>('SELECT id FROM sets WHERE workout_id = ? ORDER BY position ASC, id ASC')
        .all(workoutId)
        .map((row) => row.id);
      const from = ids.indexOf(id);
      const to = direction === 'up' ? from - 1 : from + 1;
      if (to >= 0 && to < ids.length) {
        ids.splice(from, 1);
        ids.splice(to, 0, id);
      }
      const renumber = this.#db.query<unknown, [number, LiftSetId]>('UPDATE sets SET position = ? WHERE id = ?');
      for (const [index, setId] of ids.entries()) {
        renumber.run(index + 1, setId);
      }
      return this.list(workoutId);
    })();
  }
  ```
- [x] `internal/set.translator.ts`: remove `position` from `translateToCreateSetDto`,
      `translateToEditSetDto`, `translateDtoToCreateSet` and `translateDtoToEditSet`; add
      `translateToMoveSetDto(body)` returning `{ direction: body.direction as SetDirection }`.
- [x] `workouts.facade.ts`: remove the `position` lines from `SetFacade.#validateCreate` and
      `#validateEdit`; add

  ```ts
  move(id: LiftSetId, dto: MoveSetDto): LiftSet[] {
    return this.#sets.move(id, requiredOneOf(dto, 'direction', ['up', 'down'] as const));
  }
  ```

  Validation runs first, so a bad direction on an unknown set is a 400, as elsewhere.
- [x] `internal/set.controller.ts`: add

  ```ts
  async move(req: ParamRequest): Promise<Response> {
    const id: LiftSetId = pathId(req.params.id, 'set');
    const dto = translateToMoveSetDto(await readJsonObject(req));
    return json(this.#sets.move(id, dto).map(translateToLiftSetDto));
  }
  ```

- [x] `set.routes.ts`: add `'/api/sets/:id/move': { POST: (req) => controller.move(req) }`.
- [x] `src/backend/features/workouts/set.routes.test.ts`: `describe('move')` with
  - moves a set up and down, and the response lists the new order (three sets, move the last up,
    then the first down; assert ids in order and positions `1, 2, 3`)
  - moving the first set up or the last set down answers 200 with the order unchanged
  - moves a done set, and moves a set past a done neighbor (both via `markDone`)
  - an unknown set is a 404; a non-numeric id is a 400
  - a missing direction, `'sideways'` and `1` are each a 400
  - `GET /api/workouts/:id` returns the moved order afterwards
- [x] `src/backend/features/workouts/workouts.facade.test.ts`: return `db` from `setup()`; add
      `describe('SetFacade.move')` cases: sets whose positions tie (force with
      `db.query('UPDATE sets SET position = 0 WHERE workout_id = ?')`) keep their `id` order on an
      edge move and then swap correctly; sets with gaps (positions `5, 9, 40`) are renumbered
      `1, 2, 3`; an unknown set is a 404 and a bad direction a 400.
- [x] `src/backend/features/workouts/workouts.facade.test.ts`: in "create rounds the weight, …
      appends the set", keep the append assertion; add a test that `create` with a `position`
      property (cast through `as CreateSetDto`) still appends, and that `update` with a `position`
      is ignored (the set keeps its position).
- [x] `src/backend/features/workouts/set.routes.test.ts`: in "refuses to change a done set …",
      nothing to change (it does not send `position`); add a test that `PATCH { position: 9 }`
      answers 200 with the position unchanged, both on a not-done set and on a done one (formerly
      a 409).
- [x] `docs/backend.md`: in the data-model paragraph (line ~154), say that `position` is
      server-owned — appended on create, copied by "Repeat", and changed only by
      `POST /api/sets/:id/move`, which renumbers the workout 1..n in one transaction and swaps the
      set with its neighbor (an edge move is a 200 with the order unchanged).
- [x] `docs/backend.md`: in the done-lock paragraph (line ~166), remove "`position` included"
      and add that moving is the one change a done set takes besides `done`, because order is not
      performed history; a `position` in a PATCH body is ignored like any unknown key.

**Automated Verification**:

- [x] `bun test --parallel src/backend/shared/validate.test.ts` passes
- [x] `bun test --parallel src/backend/features/workouts/set.routes.test.ts` passes
- [x] `bun test --parallel src/backend/features/workouts/workouts.facade.test.ts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

### Phase 2: Move a set in the UI

Dependencies: Phase 1

Add the ▲▼ pair to every set row, wire it to the endpoint, and keep focus on the moved row.

**Tasks**:

- [x] `src/frontend/features/workouts/internal/set.api.ts`: add
      `move(id: LiftSetId, dto: MoveSetDto): Promise<LiftSetDto[]>` using `post(`/sets/${id}/move`, dto)`.
- [x] `src/frontend/features/workouts/workouts.facade.ts`: add
      `SetFacade.move(id: LiftSetId, direction: SetDirection): Promise<LiftSetDto[]>` calling
      `this.#sets.move(id, { direction })`.
- [x] `src/frontend/features/workouts/workouts.facade.test.ts`: add
      `['move()', (): Promise<unknown> => setFacade.move(3, 'up'), 'POST', '/api/sets/3/move']` to the
      "addresses the set by its own id" table, and a test asserting the body `{ direction: 'up' }`.
- [x] `internal/gz-set-row.component.ts`: add a `#last = false` field and a `set last(value: boolean)`
      setter; update the class doc comment to mention moving.
- [x] `internal/gz-set-row.component.ts`: turn `<span class="actions">` into `<div class="actions">`
      (a `<fieldset>` is not valid inside a `<span>`; the CSS targets the class only), and render
      the pair right after `<span class="volume mono">` in it:

  ```ts
  <fieldset class="group move">
    <button class="outline icon small" data-action="move-up" aria-label="Move set up" ${this.#index <= 1 ? 'disabled' : ''}>▲</button>
    <button class="outline icon small" data-action="move-down" aria-label="Move set down" ${this.#last ? 'disabled' : ''}>▼</button>
  </fieldset>
  ```

  Shown for done and not-done sets alike.
- [x] `internal/gz-set-row.component.ts`: in `handleAction`, handle `move-up` / `move-down`:
      `await setFacade.move(set.id, direction)`, then `this.emit('set-moved', { id: set.id, direction })`;
      `toastError` on failure.
- [x] `internal/gz-set-row.component.ts`: add
      `focusMove(direction: SetDirection): void` — focuses `[data-action='move-<direction>']`, or the
      other arrow when that one is disabled.
- [x] `internal/gz-set-row.component.css`: Oat gives every `fieldset` a bottom margin
      (`form.css:181-186`) and `fieldset.group` collapses the shared border only for inputs
      (`form.css:206-208`), so add, with no colors:

  ```css
  .move {
    margin: 0;

    /* Oat joins the corners of grouped buttons but not their shared border, as it does for inputs. */
    & > button:first-child {
      border-inline-end-color: transparent;
    }
  }
  ```

- [x] `gz-workout-detail.component.ts`: render `data-last="${index === sets.length - 1}"` on each
      `gz-set-row`; in `afterRender`, set `row.last = row.dataset.last === 'true'` next to
      `row.index`, before `row.set` — assigning `set` is what renders the row.
- [x] `gz-workout-detail.component.ts`: add a module-level type guard

  ```ts
  function isSetMoved(detail: unknown): detail is { id: number; direction: SetDirection } {
    return typeof detail === 'object' && detail !== null && 'id' in detail && typeof detail.id === 'number' && 'direction' in detail && (detail.direction === 'up' || detail.direction === 'down');
  }
  ```

  and in `connectedCallback` listen for `set-moved`:
  `if (event instanceof CustomEvent && isSetMoved(event.detail)) { const { id, direction } = event.detail; void this.reload().then(() => this.$<GzSetRowComponent>(`gz-set-row[data-id='${id}']`)?.focusMove(direction)); }`.
- [x] `internal/gz-set-row.component.test.ts`: set `row.last` in `mountRow` (default `false`) and
      add tests:
  - the action lists now start with `move-up`, `move-down` (update both existing action-list
    tests, done and not done)
  - ▲ is disabled on index 1 and ▼ when `last` is true; both enabled in the middle
  - clicking ▼ sends `POST /api/sets/7/move` with `{ direction: 'down' }` and emits `set-moved`
    with `{ id: 7, direction: 'down' }`, not `sets-changed`
  - a done set can be moved
  - `focusMove('up')` on the first row focuses ▼; `focusMove('down')` in the middle focuses ▼
- [x] `gz-workout-detail.component.test.ts`: add tests:
  - only the last row's ▼ and the first row's ▲ are disabled
  - clicking the third row's ▲ posts the move, reloads (`GET /api/workouts/3` answered with the
    swapped order), renders the rows in the new order, and leaves focus on the moved row's ▲ (now
    row 2)
  - clicking the second row's ▲ moves it to row 1, where ▲ is disabled, so focus lands on its ▼
  - a `set-moved` event whose `detail` is malformed does not reload
- [x] `docs/frontend.md`: after the `gz-set-row` done-toggle paragraph (line ~71), describe the ▲▼
      pair in `.actions` (a `fieldset.group`, disabled at the edges, shown on done rows too), the
      `set-moved` event and the detail view's reload plus `focusMove()` that keeps keyboard focus
      on the moved row.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/workouts/workouts.facade.test.ts` passes
- [x] `bun test --parallel src/frontend/features/workouts/internal/gz-set-row.component.test.ts` passes
- [x] `bun test --parallel src/frontend/features/workouts/gz-workout-detail.component.test.ts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [ ] On a workout page (`bun run start:dev`, after `bun run seed`), ▲▼ sit at the start of each
      row's actions as a joined pair, look right in light and dark themes, and the first ▲ and the
      last ▼ are disabled.
- [ ] At a narrow width (≤720px), the pair sits on the actions line and nothing overflows.
- [ ] Pressing Enter/Space on ▲ repeatedly with the keyboard walks a set to the top without
      re-tabbing, then focus lands on its ▼.
- [ ] A done set and an open set can be swapped with each other; the "x/y done" badge is unchanged.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- The facade tests send a stray `position` (and a bad `direction`) without the `as CreateSetDto`
  cast the plan suggested: a non-literal object passes the excess-property check, and the bad
  direction uses `@ts-expect-error`, so no `no-unsafe-type-assertion` exception is needed.
- The update test sends `{ reps: 6, position: 9 }` so it shows the position is dropped from a real
  edit, not just from an otherwise empty patch.
- One full-suite run failed `dev.routes.test.ts > pushes a change to a connected client`: its file
  watcher reported an unrelated, untouched CSS file. It passed on every rerun, so it is a flaky
  watcher event, not caused by this change.
- User feedback: the done toggle and ▲▼ should be the same size as +1. All three dropped Oat's
  `icon small` classes and are plain (`outline`) buttons, so they take Oat's default button
  padding, font and height, with no custom sizing CSS.

## References

- `docs/agents/plans/2026-10-02-mark-sets-as-done.md` — the done lock this plan carves moving out of
- `src/backend/features/workouts/internal/set.repository.ts`
- `src/backend/features/workouts/internal/workout.repository.ts` — `create` as the
  `db.transaction()` example and the "Repeat" position copy
- `src/frontend/features/workouts/internal/gz-set-row.component.ts`
- `src/frontend/features/workouts/gz-workout-detail.component.ts` — `set-logged` as the model for
  `set-moved`
- `node_modules/@knadh/oat/css/form.css:196` — `fieldset.group`
- `docs/backend.md:147-171`, `docs/frontend.md:71-77`
