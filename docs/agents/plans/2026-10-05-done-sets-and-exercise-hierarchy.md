---
date: 2026-10-05T11:53:44.453863+00:00
git_commit: f7b29f2f8a34bfaa732fdf64b06eb1732cc070f8
branch: main
topic: 'Make done sets stand out and tell exercises from sets'
tags: [plan, workouts, sets, gz-set-row, gz-workout-detail, styling]
status: implemented
---

# PLAN: Make done sets stand out and tell exercises from sets

On the workout detail page an exercise (an Oat accordion item) and each of its sets (a
`gz-set-row`) are drawn the same way — a `1px var(--border)` box with `--radius-medium` — so the
container and its contents are hard to tell apart. A done set only gets quieter (disabled inputs on
`--muted`, muted load text, a filled toggle in the blue-gray `--primary`), so it does not stand out
either. This plan turns the sets into divided list rows inside the exercise, marks a done set with
a green `--success` edge, and gives each exercise header its own progress badge that turns into a
success "✓ Done" once all of its sets are done.

## Acceptance Criteria

- Inside an open exercise the sets are no longer bordered boxes: they are rows separated by a 1px
  `var(--border)` divider, running edge to edge inside the accordion item, so the exercise is the
  only box.
- A done set shows a 3px `var(--success)` bar on its leading edge and a `var(--success)` index
  number. A set not done keeps a transparent bar of the same width, so every row's content stays
  aligned. Disabled inputs, the muted load and the toggle's Oat variants are unchanged.
- Each exercise header shows an outline stats badge "N sets · volume" followed by a progress badge:
  an outline "x/y done" while any set is open, a `data-variant="success"` "✓ Done" once every set
  is done. The workout totals and the headers render that progress badge through one helper.
- At ≤ 720px both header badges share the summary's second line, the stripe and the dividers look
  as on desktop, and the page does not scroll sideways at 320px.
- `docs/frontend.md` describes the row and header looks, and its stale "leaves out ×" sentence
  (a done set keeps × disabled since `1590b68`) is corrected.

## Technical Key Decisions and Tradeoffs

1. **Sets are list rows, not boxes:** `.row-view` drops its border and radius; the view's stylesheet
   draws `border-top: 1px solid var(--border)` on `gz-set-row + gz-set-row` and gives `.sets`
   `margin: 0` and drops its `gap`, overriding Oat's `details > *:not(summary) { margin: var(--space-4) }`.
   - Why: identical boxes at both levels are the ambiguity; this also honors the rule against
     nesting cards. Chosen over a `--muted` body behind boxed rows (still nested, and it clashes
     with disabled inputs, which are `--muted` too) and over only a heavier header (rows still look
     like cards).
   - Impact: the row supplies its own horizontal inset (`var(--space-4)`, less the 3px stripe on the start side so the content lines up with the exercise name), since
     the accordion body no longer adds one. The divider belongs to the parent, because the row's
     own rules live in its shadow root and cannot see its siblings.
2. **Done is a `--success` edge, not a muted surface:** `.row-view` gets
   `border-inline-start: 3px solid transparent`; `.row-view.done` sets its color to
   `var(--success)` and colors `.index` with `var(--success)`.
   - Why: buttons may only use Oat's variants, which have no green, and colors are never derived.
     `gz-workout-card`'s `article.done { border-color: var(--success) }` is the precedent. Chosen
     over a "✓ Done" badge inside the row, which repeats the toggle and costs width in a dense row.
   - Impact: CSS only, on the `done` class the row already renders.
3. **The header's progress is its own badge:** `#groupSummary` keeps only "N sets · volume"; a
   `#progressBadge(doneCount, setCount)` helper, replacing `#doneBadge(done, doneCount, setCount)`,
   renders the outline "x/y done" or the success "✓ Done" for both the totals and every header.
   - Why: one look for "done" across the page, and a collapsed exercise shows its state at a glance.
   - Impact: `done` is derived as `setCount > 0 && doneCount === setCount`, which is exactly how the
     backend derives `workout.done`, so the totals no longer need the flag. The header-badge test
     is rewritten.

## Current State

```
gz-workout-detail  (/workouts/:id)
 └─ <section> "Sets"
     └─ .exercises
         ├─ <details name="exercises">          Oat accordion: 1px var(--border), radius-medium
         │   ├─ <summary> name (3 sets · 2/3 done · 1,200 kg) [▲][▼] [Exercise] ⌄
         │   └─ .sets  (Oat margin var(--space-4), gap 0.4rem)
         │       ├─ <gz-set-row> form.row-view          1px var(--border), radius-medium, padding
         │       └─ <gz-set-row> form.row-view.done     same box; load muted, inputs disabled
         └─ <details> …
```

```
┌──────────────────────────────────────────────────────────────┐
│ Bench Press   (3 sets · 2/3 done · 1,200 kg)    ▲▼ Exercise ⌄ │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [■✓■] 1  [80] kg × [5] reps  [felt easy]  400 kg  +1 × │  │  done: only quieter
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [ ✓ ] 2  [80] kg × [5] reps  [Notes    ]  400 kg  +1 × │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- `src/frontend/features/workouts/internal/gz-set-row.component.css:3-12` — the row's box.
- `src/frontend/features/workouts/internal/gz-set-row.component.css:40-42` — the only done rule.
- `src/frontend/features/workouts/gz-workout-detail.component.css:40-44` — `.sets` layout.
- `src/frontend/features/workouts/gz-workout-detail.component.ts:274-292` — `#doneBadge` and
  `#groupSummary`; `:294-314` — `#groupTemplate`; `:333` — the totals' done badge.
- `node_modules/@knadh/oat/css/accordion.css` — the item's border and the body's margin.

## Desired End State

```
Desktop
┌──────────────────────────────────────────────────────────────┐
│ Bench Press   (3 sets · 1,200 kg) (2/3 done)    ▲▼ Exercise ⌄ │
├──────────────────────────────────────────────────────────────┤
┃ [■✓■] 1  [80] kg × [5] reps  [felt easy]  400 kg  +1  ×      │  ┃ = 3px var(--success), green "1"
├──────────────────────────────────────────────────────────────┤  ← 1px var(--border) divider
┃ [■✓■] 2  [80] kg × [5] reps  [         ]  400 kg  +1  ×      │
├──────────────────────────────────────────────────────────────┤
│ [ ✓ ] 3  [80] kg × [5] reps  [Notes    ]  400 kg  +1  ×      │  not done: transparent bar
└──────────────────────────────────────────────────────────────┘
│ Back Squat    (3 sets · 1,500 kg) (✓ Done)      ▲▼ Exercise ⌄ │  (✓ Done) = success badge
└──────────────────────────────────────────────────────────────┘

Phone (≤ 720px)
┌──────────────────────────────────┐
│ Bench Press                    ⌄ │
│ (3 sets · 1,200 kg) (2/3 done)   │
│ ▲▼ Exercise                      │
├──────────────────────────────────┤
┃ [■✓■] 1                  +1  ×   │
┃ [  80  ] kg × [  5  ] reps       │
┃ [felt easy                   ]   │
├──────────────────────────────────┤
│ [ ✓ ] 3                  +1  ×   │
│ [  80  ] kg × [  5  ] reps       │
│ [Notes                       ]   │
└──────────────────────────────────┘

Totals (unchanged look): (3 sets) (2 exercises) (15 reps) (1,300 kg total volume) (2/3 done)
```

## Abstractions and Code Reuse

- `src/frontend/features/workouts/internal/`
  - `gz-set-row.component.css` — `.row-view` loses its border box, gains the transparent start
    border and inline padding; `.row-view.done` colors that border and `.index` with `--success`.
  - `gz-set-row.component.test.ts` — asserts the `done` class the CSS hangs on.
- `src/frontend/features/workouts/`
  - `gz-workout-detail.component.css` — `.sets` margin and gap reset, the divider between rows.
  - `gz-workout-detail.component.ts`
    - `#progressBadge` — replaces `#doneBadge`; used by the totals and `#groupTemplate`.
    - `#groupSummary` — "N sets · volume" only.
  - `gz-workout-detail.component.test.ts` — the header-badge test.
- `docs/frontend.md` — the header and row paragraphs.

No new tokens, classes named after Oat components, or button colors. `gz-workout-card`'s
`--success` border is the pattern reused for the row.

## Logging & Observability

No changes; this is styling and markup only.

## Implementation

### Phase 1: Sets as divided rows with a done stripe

Dependencies: None

Make the exercise the only box and mark done sets with a green leading edge.

**Tasks**:

- [x] `src/frontend/features/workouts/internal/gz-set-row.component.css`: in `.row-view`, replace
      `border: 1px solid var(--border)` and `border-radius: var(--radius-medium)` with
      `border-inline-start: 3px solid transparent`, and change the padding to
      `padding: 0.5rem var(--space-4) 0.5rem calc(var(--space-4) - 3px)`, so the stripe plus the
      start padding equals the summary's `var(--space-4)` and the row content lines up with the
      exercise name. Update the file's header comment ("a dense row, …, marked
      green once done").
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.css`: extend the done rule,
      nested per the styling guidelines:
      ```css
      .row-view.done {
        border-inline-start-color: var(--success);

        & .index {
          color: var(--success);
        }

        & .load {
          color: var(--muted-foreground);
        }
      }
      ```
- [x] `src/frontend/features/workouts/gz-workout-detail.component.css`: `.sets` gets `margin: 0`
      (beating Oat's `details > *:not(summary)` margin: Oat's rule is in `@layer components`, ours is unlayered) and drops its
      `gap`; add the divider:
      ```css
      .sets {
        display: flex;
        flex-direction: column;
        /* Edge to edge: the rows are the accordion item's lines, not boxes inside it. */
        margin: 0;

        & > gz-set-row + gz-set-row {
          border-top: 1px solid var(--border);
        }
      }
      ```
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.test.ts`: a done set renders
      `form.row-view.done`; a set not done renders `form.row-view` without `done`.
- [x] `docs/frontend.md`: in the `gz-set-row` paragraph, say the sets are rows divided by a
      `--border` line inside their exercise rather than boxes of their own, and that a done row
      shows a `--success` bar on its leading edge and a `--success` index. Correct "leaves out ×"
      to: a done row keeps its fields and × in place, disabled, keeps +1, and mutes its load.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/workouts/internal/gz-set-row.component.test.ts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] In light and dark theme, an open exercise reads as one box of divided lines; done rows carry
      a green bar and a green number, and every row's content lines up with the others.
- [x] At 320px wide the rows keep the stripe and dividers and the page does not scroll sideways.
- [x] The last row's stripe is not visibly clipped by the accordion item's rounded bottom corner.

### Phase 2: Progress badge in the exercise header

Dependencies: None

Show each exercise's progress as its own badge, success-colored once every set is done.

**Tasks**:

- [x] `src/frontend/features/workouts/gz-workout-detail.component.ts`: replace
      `#doneBadge(done, doneCount, setCount)` with `#progressBadge(doneCount, setCount)`:
      ```ts
      /** Progress through some sets: "x/y done", "✓ Done" once all are, or nothing without any. */
      #progressBadge(doneCount: number, setCount: number): RawHtml {
        if (setCount === 0) {
          return html``;
        }
        if (doneCount === setCount) {
          return html`<span class="badge" data-variant="success">✓ Done</span>`;
        }
        return html`<span class="badge outline">${doneCount}/${setCount} done</span>`;
      }
      ```
      `readyTemplate` calls `this.#progressBadge(doneCount, sets.length)`.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.ts`: `#groupSummary` returns
      `` `${plural(count, 'set')} · ${formatVolume(volume)}` `` (doc comment: "3 sets · 1,200 kg");
      `#groupTemplate` renders `${this.#progressBadge(doneCount, group.sets.length)}` right after
      the stats badge, computing `doneCount` from `group.sets`.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.css`: update the comment above
      `summary` ("the name, a stats and a progress badge, and actions") and the ≤ 720px one ("the
      badges and the actions take a line each"). The existing `.badge` rules already apply to both.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.test.ts`: add a helper next to
      `totals()`:
      ```ts
      function headerBadges(view: HTMLElement, exerciseId: number): (string | null)[] {
        return Array.from(groupOf(view, exerciseId).querySelectorAll('summary .badge')).map((badge) => badge.textContent);
      }
      ```
      and rewrite "sums up each group in its header's badge" (same `withSets` fixture,
      `done: item.exerciseId === 2`, so the workout stays not done): exercise 1's badges are a stats
      badge starting `'2 sets · '` without "done", then `'0/2 done'`, and
      `groupOf(view, 1).querySelector("summary .badge[data-variant='success']")` is null; exercise
      2's are `'1 set · …'` then `'✓ Done'`, and
      `find(groupOf(view, 2), "summary .badge[data-variant='success']").textContent` is `'✓ Done'`
      (`find` takes a `ParentNode`; `text` reads a host's shadow root, so it does not fit here). The totals tests stay
      as they are and must still pass.
- [x] `docs/frontend.md`: the header paragraph (around L89-90) describes an outline stats badge
      "N sets · volume" followed by the progress badge — outline "x/y done", success "✓ Done" once
      all sets are. The totals sentence (around L128-130) says the totals render the same badge,
      derived from the sets ("✓ Done" once every set is done) rather than from the workout's flag.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/workouts/gz-workout-detail.component.test.ts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] With every exercise collapsed, the finished ones show a green "✓ Done" and the others an
      outline "x/y done"; checking an exercise's last set turns its badge green.
- [x] At 320px wide both badges sit on the summary's second line without overflowing.
- [x] Just above the breakpoint (about 730-800px wide), where the header is still one line, a long
      exercise name truncates with an ellipsis instead of pushing the badges or actions out.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/plans/2026-10-02-mark-sets-as-done.md` — the done state, toggle and badges
- `docs/agents/plans/2026-10-02-group-sets-by-exercise.md` — the accordion grouping
- `docs/agents/plans/2026-10-05-fit-pages-on-phone-screens.md` — the 720px row layout
- `docs/styling-guidelines.md` — Oat first, button variants, nesting, 320px
- `node_modules/@knadh/oat/css/accordion.css`, `badge.css` — the item box and the success badge
