---
date: 2026-10-09T13:32:44.828907+00:00
git_commit: 8c1b286959aa250c6f79ada6ad2946893837bbab
branch: main
topic: 'Muscle group icons'
tags: [plan, exercises, workouts, muscle-group, frontend, backend, icons]
status: ready
---

# PLAN: Muscle group icons

Give each of the seven muscle groups its own small icon and show it wherever an exercise's group
is shown or an exercise heads a group: the exercise list cards, the exercise detail header and the
exercise groups on a workout page.

## Acceptance Criteria

- Each of `Chest`, `Back`, `Shoulders`, `Arms`, `Legs`, `Core` and `Full body` has its own
  hand-drawn 24×24 stroke icon in `currentColor`, so it follows both themes.
- Exercise list card: the subtitle reads `[icon] Legs · notes`; the icon is decorative
  (`aria-hidden="true"`).
- Exercise detail header: the subtitle reads `[icon] Legs`; the icon is decorative.
- Workout page: each exercise group's `<summary>` shows the icon before the exercise name, icon
  only, announced as the group (`role="img"`, `aria-label="Legs"`) with an SVG `<title>` as its
  tooltip.
- An exercise without a muscle group shows no icon and leaves no gap, everywhere.
- The `<select>`s, the add-set exercise picker, the set rows and the "incomplete exercises" confirm
  dialog are unchanged.
- `GET /api/workouts/:id` carries `muscleGroup` (one of the seven, or `null`) on every entry of
  `exercises`.
- Every touched page still fits a 320px-wide screen.

## Technical Key Decisions and Tradeoffs

1. **Placement:** the exercise list card, the exercise detail header and the workout exercise
   group heading.
   - Why: those are the places that show a group or head an exercise with room for an icon; an
     `<option>` renders text only, so the `<select>`s cannot hold an SVG.
   - Impact: `WorkoutExerciseDto` gains `muscleGroup: MuscleGroup | null`, read from the
     `exercises` row the workout-exercise query already joins.
2. **Source:** seven hand-drawn inline SVGs, no dependency.
   - Why: no open icon set draws chest, back, shoulders or core; emoji ignore the theme and lack
     most groups; the existing sun, moon and menu icons are inline stroke SVGs already.
   - Impact: the shapes are a first draft, judged in the browser in Phase 1's manual check.
3. **Packaging:** a component `<gz-muscle-group-icon group="…" label="…">` at the root of
   `features/exercises/` (not `internal/`), with its own `.css`.
   - Why: one tag for every caller and the sizing in one stylesheet despite shadow roots; the root
     of a feature is its front door, as with `gz-workout-card`, and workouts already imports
     `exercises.facade.ts` from there.
   - Impact: the drawings sit in a `Record<MuscleGroup, RawHtml>`, so typecheck fails when a group
     lacks one.
4. **Text vs. icon:** text plus a decorative icon on the exercise pages; icon only on the workout
   heading, where `label` makes it `role="img"` with `aria-label` and an SVG `<title>` child.
   - Why: the workout summary already holds name, stats and badge at 320px.
5. **No group:** the component renders nothing and takes no space (`group` missing or not one of
   the seven).
6. **Motifs:** Chest — two pectoral arcs in a front torso outline; Back — V-tapered torso with a
   spine line; Shoulders — neck and rounded deltoid caps; Arms — flexed arm with a bicep bulge;
   Legs — one leg bent at the knee with a foot; Core — a 2×3 grid of small rounded rectangles;
   Full body — a standing figure with arms out.

## Current State

```
src/shared/muscle-group.ts                       MuscleGroup (7 values), MuscleGroupFilter
src/shared/dto/workout.ts:21                     WorkoutExerciseDto { exerciseId, exerciseName, position, sets }
src/backend/features/workouts/
├── ports/workout-exercise.ts                    WorkoutExercise row { workout_id, exercise_id, exercise_name, position }
├── internal/workout-exercise.repository.ts:20   list(): SELECT … e.name AS exercise_name … JOIN exercises e
└── internal/workout.translator.ts:97            translateToWorkoutExerciseDto
src/frontend/features/
├── exercises/
│   ├── gz-exercise-list.component.ts:80         card subtitle: [muscleGroup, notes].join(' · ')
│   └── gz-exercise-detail.component.ts:93       <p class="text-light">${muscleGroup ?? 'No muscle group set'}</p>
└── workouts/
    ├── gz-workout-detail.component.ts:396       <summary><span class="exercise-name">${name}</span> stats badge</summary>
    └── workouts.fixtures.ts:21                  group()
```

Muscle groups are text only:

```
Exercise list card                     Exercise detail          Workout group
┌───────────────────────────────┐      Back Squat               ┌──────────────────────────────────────┐
│ Back Squat                    │      Legs                     │ ▸ Back Squat  5 sets · 2,400 kg  3/5 │
│ Legs · Low bar, belt          │                               └──────────────────────────────────────┘
│ 12 sets · 140 kg best · 2d ago│
└───────────────────────────────┘
```

## Desired End State

```
Exercise list card                     Exercise detail          Workout group
┌───────────────────────────────┐      Back Squat               ┌──────────────────────────────────────┐
│ Back Squat                    │      [🦵] Legs                 │ ▸ [🦵] Back Squat  5 sets · 2,400 kg 3/5│
│ [🦵] Legs · Low bar, belt      │                               │ ▸ Farmer's Walk  3 sets · 900 kg     │
│ 12 sets · 140 kg best · 2d ago│                               └──────────────────────────────────────┘
└───────────────────────────────┘
                                   (no group → no icon, no gap)

Workout group at 320px (the summary already wraps there)
┌──────────────────────────────────┐
│ ▸ [🦵] Back Squat                 │
│   5 sets · 2,400 kg   3/5 done   │
└──────────────────────────────────┘
```

`[🦵]` stands for the group's stroke SVG, not an emoji.

```
gz-exercise-list ──┐
gz-exercise-detail ┼──> features/exercises/gz-muscle-group-icon ──> Record<MuscleGroup, RawHtml>
gz-workout-detail ─┘        (group, label?)
        ▲
        └── WorkoutExerciseDto.muscleGroup <── e.muscle_group in WorkoutExerciseRepository.list
```

## Abstractions and Code Reuse

- `src/frontend/features/exercises/`
  - `gz-muscle-group-icon.component.ts` - new. `GzMuscleGroupIconComponent extends GzElement`,
    `observedAttributes = ['group', 'label']`, re-renders on change like `gz-tile`. Validates the
    attribute with `parseMuscleGroup` from `internal/muscle-groups.ts`; its `afterRender()` sets
    `hidden` on the host when no `svg` was rendered (`shared.css` already hides `:host([hidden])`
    and comes before the component sheet, so it wins over the component's `display`).
  - `gz-muscle-group-icon.component.css` - new. Inline host, `1.25em` square SVG, vertical
    alignment; no font size.
  - `gz-muscle-group-icon.component.test.ts` - new.
  - `gz-exercise-list.component.ts` - `#card` subtitle renders the icon before the group.
  - `gz-exercise-detail.component.ts` - `#headerTemplate` renders the icon before the group.
- `src/shared/dto/workout.ts` - `WorkoutExerciseDto.muscleGroup`.
- `src/backend/features/workouts/` - `WorkoutExercise.muscle_group`, the `SELECT`, the translator.
- `src/frontend/features/workouts/gz-workout-detail.component.ts` - `#groupTemplate` summary.
- `.idea/inspectionProfiles/Project_Default.xml` - accept `gz-muscle-group-icon` as a known tag,
  as `gz-confirm-dialog` is.

Reused: `GzElement`/`define` and the `html` template from `ui/`, `parseMuscleGroup`, the
`gz-tile` attribute-driven pattern, the inline-SVG conventions of `gz-theme-toggle`
(`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, round caps
and joins).

## Logging & Observability

None.

## Implementation

### Phase 1: Icons on the exercise pages

Dependencies: None

Add the icon component and show it in the exercise list cards and the exercise detail header.

**Tasks**:

- [x] Create `src/frontend/features/exercises/gz-muscle-group-icon.component.ts`: a
      `const ICONS: Record<MuscleGroup, RawHtml>` holding the inner paths of the seven drawings
      (motifs per Key Decision 6), and a `template()` that wraps the chosen one in the shared
      `<svg>` attributes.
      ```ts
      override template(): RawHtml {
        const group = parseMuscleGroup(this.getAttribute('group'));
        if (group === null) {
          return html``;
        }
        const label = this.getAttribute('label');
        const a11y = label ? html`role="img" aria-label="${label}"` : html`aria-hidden="true"`;
        return html`
          <svg data-testid="icon" data-group="${group}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>
            ${label ? html`<title>${label}</title>` : ''}${ICONS[group]}
          </svg>
        `;
      }

      override afterRender(): void {
        this.hidden = this.$('svg') === null;
      }
      ```
      End the module with `await define('gz-muscle-group-icon', GzMuscleGroupIconComponent, import.meta.url)`.
- [x] Create `gz-muscle-group-icon.component.css`: `:host { display: inline-flex; vertical-align: -0.2em; }`
      and `svg { width: 1.25em; height: 1.25em; }` (the `[hidden]` host rule comes from `shared.css`).
- [x] Create `gz-muscle-group-icon.component.test.ts` covering the cases under Automated
      Verification.
- [x] `gz-exercise-list.component.ts` `#card`: build the subtitle so the group is wrapped with its
      icon, e.g. `<div class="text-light">${group ? html`<gz-muscle-group-icon group="${group}"></gz-muscle-group-icon> ${group}` : ''}${separator}${notes}</div>`,
      keeping today's text exactly when there is no group; import the component module. Add
      `data-testid="card"` to the `<article>` and `data-testid="card-subtitle"` to the subtitle
      (`subtitle` is taken by the heading's count).
- [x] `gz-exercise-detail.component.ts` `#headerTemplate`: render
      `<gz-muscle-group-icon group="…"></gz-muscle-group-icon>` before the group name when there is one;
      "No muscle group set" stays plain; add `data-testid="muscle-group"` to the `<p>`; import the
      component module.
- [x] Extend `gz-exercise-list.component.test.ts` and `gz-exercise-detail.component.test.ts` with
      the cases under Automated Verification.
- [x] Add `gz-muscle-group-icon` to the known tags in `.idea/inspectionProfiles/Project_Default.xml`.
- [x] `docs/frontend.md`: describe `gz-muscle-group-icon` in the exercises feature section (near
      :317-339) — a root-level component other features render (with the same one-line reason
      :71 gives for `gz-workout-card`), its `group` and `label` attributes, decorative vs.
      announced, hidden without a valid group — mention it in the `features/exercises/` line of the
      tree at the top, and make "the other five components stay private to their module"
      (:397-399) count six.

**Automated Verification**:

- [x] `gz-muscle-group-icon` renders an `svg` with `data-group` equal to each of the seven groups.
- [x] The seven drawings are pairwise different (compare each `svg`'s `innerHTML`).
- [x] Without `label`, the `svg` has `aria-hidden="true"`, no `role` and no `<title>`.
- [x] With `label="Legs"`, the `svg` has `role="img"`, `aria-label="Legs"` and a `<title>` of
      `Legs`, and no `aria-hidden`.
- [x] A missing, empty or unknown `group` (e.g. `"Neck"`) renders no `svg` and sets `hidden` on
      the host; changing `group` to a valid value afterwards renders the icon and clears `hidden`.
- [x] Exercise list: the `card-subtitle` of a card with `muscleGroup: 'Legs'` and notes holds a
      decorative icon with `data-group="Legs"`, and its trimmed text, whitespace collapsed, reads
      `Legs · <notes>`; a card with `muscleGroup: null` contains no `gz-muscle-group-icon`.
- [x] Exercise detail: `muscle-group` for a `Chest` exercise holds an icon with
      `data-group="Chest"`; for `null` it reads "No muscle group set" with no icon.
- [x] The static-file test that requests the `.css` beside every `gz-*.component.ts` passes for
      the new component.
- [x] `bun test --parallel` passes.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

**Manual Verification**:

- [x] On `/exercises` (after `bun run seed`), each of the seven groups shows a recognizable,
      distinct icon in the card subtitle, aligned with the text, in light and dark mode.
- [x] On an exercise's page, the header shows the icon before the group.
- [x] At 320px width both pages still fit without horizontal scrolling.

### Phase 2: Icons on workout pages

Dependencies: Phase 1

Carry the muscle group on a workout's exercise groups and show the labeled icon in each group's
heading.

**Tasks**:

- [x] `src/shared/dto/workout.ts`: add `muscleGroup: MuscleGroup | null` to `WorkoutExerciseDto`
      after `exerciseName`.
- [x] `src/backend/features/workouts/ports/workout-exercise.ts`: add `muscle_group: MuscleGroup | null`
      to `WorkoutExercise`.
- [x] `src/backend/features/workouts/internal/workout-exercise.repository.ts` `list`: select
      `e.muscle_group` beside `e.name AS exercise_name`.
- [x] `src/backend/features/workouts/internal/workout.translator.ts` `translateToWorkoutExerciseDto`:
      map `muscleGroup: row.muscle_group`.
- [x] `src/backend/features/workouts/workout.routes.test.ts`: add a test that a workout with one
      exercise created with `muscleGroup: 'Chest'` (posted directly to `/api/exercises`) and one
      without returns `muscleGroup: 'Chest'` and `muscleGroup: null` on the two `exercises` entries,
      and that changing the exercise's group via `PATCH /api/exercises/:id` shows in the workout.
- [x] `src/frontend/features/workouts/workouts.fixtures.ts` `group()`: default `muscleGroup: null`,
      as the `exercise()` fixture does; tests that need a group override it.
- [x] `gz-workout-detail.component.ts` `#groupTemplate`: put
      `<gz-muscle-group-icon group="${group.muscleGroup ?? ''}" label="${group.muscleGroup ?? ''}"></gz-muscle-group-icon>`
      inside the `<summary>` before `.exercise-name`; import
      `../exercises/gz-muscle-group-icon.component.ts`.
- [x] `gz-workout-detail.component.css`: give `gz-muscle-group-icon` `flex: none` inside
      `summary`, and in the ≤720px rule (:98-100) change `.exercise-name`'s
      `flex-basis: calc(100% - 2em)` to also subtract the icon's `1.25em` and the summary's flex
      gap, so icon and name share the first line. A hidden icon is `display: none`, adds no gap,
      and the slack goes to the name's `flex: 1 1 auto`.
- [x] `gz-workout-detail.component.test.ts`: add the cases under Automated Verification.
- [x] `docs/backend.md:191`: the `exercises` entries become
      `{ exerciseId, exerciseName, muscleGroup, position, sets }`.
- [x] `docs/frontend.md:117`: rewrite the sentence that says the summary holds "only the exercise
      name, its stats … and a progress badge" so it leads with the group's labeled
      `gz-muscle-group-icon` (none for an exercise without a group).

**Automated Verification**:

- [x] Backend: the new route test sees `muscleGroup: 'Chest'` and `null` on the workout's
      `exercises`, and the updated group after a `PATCH`.
- [x] Workout detail: a group with `muscleGroup: 'Legs'` has a `gz-muscle-group-icon` inside its
      `<summary>`, before `.exercise-name`, whose `svg` has `role="img"` and `aria-label="Legs"`.
- [x] Workout detail: a group with `muscleGroup: null` renders the icon element hidden with no
      `svg`.
- [x] Existing workout detail tests (move buttons, incomplete confirm dialog, progress badge)
      still pass unchanged.
- [x] `bun test --parallel` passes.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

**Manual Verification**:

- [x] On a seeded workout, each exercise group heading shows its group's icon before the name, the
      tooltip names the group on hover, and an exercise without a group shows its name only.
- [x] At 320px the icon and name stay on the first line of the summary, with stats and badge
      wrapping below as before, in light and dark mode.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- After both phases, the user asked for the icons in the muscle group dropdowns too, reversing Key
  Decision 1's "`<select>`s unchanged": all three (the list filter, "Add an exercise" and "Edit
  exercise") became `select.rich`, a customizable select (`appearance: base-select`, in `shared.css`)
  with the icon inside each group's `<option>` and a `<selectedcontent>` for the closed select.
  Chosen over `<ot-dropdown>` to keep the native form, keyboard and accessibility behavior; browsers
  without base-select (Safari, Firefox today) keep the text-only list.

## References

- `docs/agents/plans/2026-10-09-filter-exercises-by-muscle-group.md` — the fixed seven groups
- `src/frontend/app/gz-theme-toggle.component.ts` — inline SVG conventions
- `src/frontend/ui/tile/gz-tile.component.ts` — attribute-driven component pattern
- `docs/styling-guidelines.md` — Oat tokens, no font sizes, 320px rule
- `docs/frontend.md:68-74` — feature root vs. `internal/`
