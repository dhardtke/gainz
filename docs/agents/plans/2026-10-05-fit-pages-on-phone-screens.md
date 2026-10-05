---
date: 2026-10-05T11:29:41.801965+00:00
git_commit: 2c5d4fcca91b3cf9f28b87da1401f361f8eecbcb
branch: main
topic: 'Fit every page on a phone screen'
tags: [plan, frontend, responsive, gz-chart, gz-session-table, gz-set-row, styling]
status: implemented
---

# PLAN: Fit every page on a phone screen

On a phone the exercise detail page scrolls sideways, and the set rows of a workout are clipped.
Measured in headless Edge at 320, 375 and 414px over every route, two pages break, each for a
concrete CSS reason. This plan fixes those causes in the components' own stylesheets, gives the
set row a three-line phone layout, and records the narrow-screen rule in the styling guidelines.

## Acceptance Criteria

- At 320px and 375px wide, no page scrolls sideways: `/`, `/workouts`, `/workouts/:id`,
  `/exercises`, `/exercises/:id`.
- The exercise chart fills its card at any width, keeps its 60:22 shape with a 9rem minimum
  height, and its x-axis date labels do not overlap on a phone.
- The session history table scrolls sideways inside its card, never the page.
- On a phone (≤720px) a set row is three lines: toggle, index and +1/× on the first; weight × reps
  across the full width on the second; notes on the third. Every field shows its whole value
  ("72,5" stays readable at 320px). Done sets keep the same layout, disabled.
- Desktop layouts (>720px) are unchanged.
- `docs/styling-guidelines.md` states the 320px rule and the two pitfalls behind these bugs.

## Technical Key Decisions and Tradeoffs

1. **Set row layout ≤720px:** grid areas `"t i a" / "l l l" / "n n n"`, `.actions` aligned to the
   end, `.load`'s fieldsets and inputs allowed to shrink.
   - Why: fits at 320px with room to spare and stays three lines; the old layout spent ~100px on
     the toggle and index columns beside every line. Shrinking the inputs alone (without the new
     areas) fits but truncates "72,5" to "72" at 375px.
   - Impact: `gz-set-row.component.css` only; no markup change.
2. **Chart sizing:** `.plot` stretches (`justify-self: stretch; min-width: 0`) instead of deriving
   its width from `min-height` through `aspect-ratio`.
   - Why: a grid item with a preferred aspect ratio aligns as `start`, not `stretch`, so its width
     comes from its height; `min-height: 9rem` × 60/22 forces ≈393px at every viewport. That is the
     root cause of the 484px-wide page.
   - Impact: `gz-chart.component.css` only. With a definite width, the height is
     `max(width × 22/60, 9rem)`, as intended.
3. **Chart label thinning:** CSS only. `.chart` becomes an `inline-size` container; below 28rem
   every second x tick counted from the end (`:nth-last-child(even)`) is hidden.
   - Why: no JavaScript, no re-render, follows resizes for free. Counting from the end matters:
     `#xLabelIndexes` (gz-chart.component.ts:92-96) picks every `stride`-th session and always
     appends the last, so the last two ticks can be adjacent sessions (10 sessions → 0,2,4,6,8,9);
     thinning from the start would keep both 8 and 9 and they would collide. From the end, the last
     label always stays and the survivors are at least two strides apart. The stride caps labels at
     six or seven, so halving leaves three or four.
   - Impact: `gz-chart.component.css` only; `gz-chart.component.ts` (`stride`) is unchanged.
4. **Oat's `.table` floor:** `.table { min-width: 0 }` in `ui/shared.css`, with a comment.
   - Why: Oat's `@layer base { .table { min-width: 320px; … } }` is wider than a card's content on a
     phone (viewport − container padding − card padding), so the page scrolled instead of the
     table. Fixing it in the shared sheet covers every future table, not just `gz-session-table`.
   - Impact: unlayered, so it beats Oat's layered rule in every shadow root that adopts `shared.css`.
5. **Verification:** manual, in the browser's device mode at 320px and 375px. No permanent overflow
   script.
   - Why: happy-dom does no layout, so `bun test` cannot catch overflow; a browser-driven checker is
     new tooling the user chose not to add.
6. **Docs:** one bullet in `docs/styling-guidelines.md`.

## Current State

```
/exercises/:id  — page scrolls sideways (documentElement.scrollWidth 484 on a 375px viewport)
├── gz-chart  .plot { aspect-ratio: 60 / 22; min-height: 9rem }   gz-chart.component.css:38-44
│     width derived from min-height → ≈393px at every viewport
├── gz-chart  .x-axis .tick  up to ~6 labels → "4 Sept11 Sept 18 Sept 25 Sept2 Oct" overlap
└── gz-session-table  <div class="table">   (gz-session-table.component.ts:27)
      Oat: .table { min-width: 320px } → at 320px the scroll box is 320px inside a ~240px card

/workouts/:id  — page width fine, but set rows are clipped by Oat's <details> overflow:hidden
└── gz-set-row  .row-view ≤720px: columns "auto 2rem 1fr", areas "t i l" / ". . n" / ". . a"
      .load (nowrap, inputs 5.5rem) has a 293px min-content in a ~200px column
                                                         gz-set-row.component.css:19-34, 56-83
```

Set row at 375px today (reps field cut off at the card's edge):

```
┌───────────────────────────┐
│ [✓]  1   [72,5    |kg] × [8│
│          [Felt strong.     │
│          [+1] [×]          │
└───────────────────────────┘
```

Chart at 375px today:

```
130,5 ┤                                ●──── (runs past the card and the screen)
 97,5 ┤●
      4 Sept11 Sept 18 Sept 25 Sept2 Oct
```

## Desired End State

Set row ≤720px (verified at 320px in a prototype):

```
┌───────────────────────────┐
│ [✓]  1          [+1] [×]  │
│ [72,5   | kg] × [8 | reps]│
│ [Felt strong.            ]│
└───────────────────────────┘
```

Chart in a narrow card:

```
130,5 ┤                    ●
 97,5 ┤●
      4 Sept     18 Sept     2 Oct
```

Session history: the table scrolls horizontally inside its card; the page does not.

## Abstractions and Code Reuse

No new abstractions. Every change is CSS beside the component it adjusts, nested per the styling
guidelines, plus one rule in the shared sheet.

- `src/frontend/features/exercises/internal/gz-chart.component.css` — `.chart` container type;
  `.plot` stretches; nested `@container` rule thins `.x-axis .tick`.
- `src/frontend/ui/shared.css` — `.table { min-width: 0 }` in the tables section.
- `src/frontend/features/workouts/internal/gz-set-row.component.css` — new ≤720px grid areas;
  `.actions` end-aligned; shrinkable `.load` fieldsets and inputs.
- `docs/styling-guidelines.md` — narrow-screen bullet.

## Logging & Observability

None.

## Implementation

### Phase 1: The exercise detail page fits a phone

Dependencies: None

Stretch the chart to its card, thin its date labels in a narrow card, and stop Oat's table wrapper
from being wider than the card.

**Tasks**:

- [x] `gz-chart.component.css` — make `.chart` a size container: add `container-type: inline-size;`
      to the existing `.chart` rule (its width comes from its parent, so inline-size containment
      changes nothing else).
- [x] `gz-chart.component.css` — in `.plot`, keep `aspect-ratio: 60 / 22` and `min-height: 9rem`
      and add, with a comment saying why:
      ```css
      /* A grid item with an aspect ratio aligns as start and takes its width from its height, which
         min-height would turn into ~393px; stretched, the height follows the width instead. */
      justify-self: stretch;
      min-width: 0;
      ```
- [x] `gz-chart.component.css` — inside `.x-axis { & .tick { … } }`, after the `:first-child` /
      `:last-child` rules, add:
      ```css
      /* A narrow chart has room for about half the labels. Counted from the end, so the latest date
         always stays and never collides with a neighbor the stride appended it beside. */
      @container (max-width: 28rem) {
        &:nth-last-child(even) {
          display: none;
        }
      }
      ```
- [x] `ui/shared.css` — in the `tables` section, add:
      ```css
      /* Oat floors its scrolling .table wrapper at 320px, wider than a card's content on a phone, so
         the page scrolled instead of the table. */
      .table {
        min-width: 0;
      }
      ```

**Automated Verification**:

- [x] `bun run fmt:check` passes
- [x] `bun run lint` passes
- [x] `bun run typecheck` passes
- [x] `bun test --parallel` passes

**Manual Verification** (browser device mode, `bun run start:dev` with seeded data):

- [x] At 320px and 375px, `/exercises/:id` does not scroll sideways; the chart ends inside its card.
- [x] At 320px and 375px the x-axis labels do not overlap, and the latest date is shown, on an
      exercise with an even number of sessions as well as an odd one.
- [x] At 320px the session history table scrolls sideways inside its card.
- [x] On a desktop width the chart and its labels look as before (all labels shown).

### Phase 2: Set rows fit a phone, and the rule is written down

Dependencies: Phase 1 (the docs bullet describes Phase 1's `.table` and `aspect-ratio` fixes)

Give the set row its three-line phone layout and record the narrow-screen rule.

**Tasks**:

- [x] `gz-set-row.component.css` — in the `@media (max-width: 720px)` block, keep
      `grid-template-columns: auto 2rem 1fr` and change the areas, with a comment:
      ```css
      /* The toggle, index and actions share the first line; the load and the note take a full line each. */
      grid-template-areas:
        "t i a"
        "l l l"
        "n n n";
      ```
- [x] `gz-set-row.component.css` — in the same block, change `.actions` from
      `justify-content: flex-start` to `justify-content: flex-end` (it keeps `grid-area: a`).
- [x] `gz-set-row.component.css` — in the same block, let the load shrink to the row:
      ```css
      .load {
        grid-area: l;
        min-width: 0;

        & fieldset {
          flex: 1 1 0;
          min-width: 0;
        }

        & input {
          flex: 1 1 0;
          width: auto;
          min-width: 0;
        }
      }
      ```
      (merge with the existing `.load { grid-area: l; }` rule rather than adding a second one).
- [x] `docs/styling-guidelines.md` — add a bullet after "Selectors nest":
      ```md
      - **Every page fits a 320px-wide screen.** Narrow-screen rules live in the stylesheet of the
        component they adjust, at the existing breakpoints (560px header, 640px open cards, 720px
        forms and set rows), and a wide child shrinks or wraps rather than widening the page. Two traps: Oat's
        `.table` has a 320px `min-width`, which `shared.css` undoes, and a grid item with an
        `aspect-ratio` takes its width from its height unless it is stretched.
      ```

**Automated Verification**:

- [x] `bun run fmt:check` passes
- [x] `bun run lint` passes
- [x] `bun run typecheck` passes
- [x] `bun test --parallel` passes

**Manual Verification** (browser device mode):

- [x] At 320px and 375px a set row shows toggle, index and +1/× on the first line, weight × reps on
      the second, notes on the third; "72,5" and the reps value are fully visible.
- [x] A done set has the same layout with disabled fields.
- [x] At 320px and 375px none of `/`, `/workouts`, `/workouts/:id`, `/exercises`,
      `/exercises/:id` scrolls sideways.
- [x] Above 720px the set row looks as before (one line, volume shown).

## Implementation Notes

- The fixes were prototyped by adopting these rules into the live shadow roots in headless Edge;
  with all of them applied, every route measured `scrollWidth == clientWidth` at 320 and 375px, and
  only the session table overflowed, inside its own scroll box. The prototype thinned ticks with
  `:nth-child(even):not(:last-child)`; review showed that collides when the stride appends the last
  session beside its neighbor, so the plan counts from the end instead.

## References

- `src/frontend/features/exercises/internal/gz-chart.component.css`
- `src/frontend/features/exercises/internal/gz-session-table.component.ts:27`
- `src/frontend/features/workouts/internal/gz-set-row.component.css`
- `src/frontend/ui/shared.css`
- `node_modules/@knadh/oat/oat.min.css` — `@layer base { .table { min-width: 320px; … } }`
- `docs/styling-guidelines.md`
- `docs/agents/plans/2026-10-02-mark-sets-as-done.md`, `docs/agents/plans/2026-10-02-move-sets-up-and-down.md`
  — earlier ≤720px set-row layouts
