---
date: 2026-10-09T11:38:25.614694+00:00
git_commit: d1c0d58e63577f07004c0520309b5482471263d8
branch: main
topic: 'Sticky set progress strip on the workout page'
tags: [plan, frontend, gz-workout-detail, gz-header, progress, styling]
status: ready
---

# PLAN: Sticky set progress strip on the workout page

The workout page (`/workouts/:id`) shows how far a session has come only as an outline "x/y done"
badge in its summary line, which scrolls away as soon as you open an exercise further down. This
plan puts a slim, one-line progress strip at the top of the view — "7/12 sets", a bar, "58%" — that
sticks directly below the header while the page scrolls, and replaces that badge.

## Acceptance Criteria

- `gz-workout-detail` renders a progress strip as the first element of its view, above the title:
  one line holding the label, a native `<progress value="x" max="y">` filling the remaining width,
  and the percentage.
- The strip is a floating `--card` box with `--radius-medium` and Oat's `--shadow-medium`, in the
  content column, about 2rem tall: one line of body text with `--space-1` block and `--space-3`
  inline padding.
- The strip sticks directly below the sticky header while the page scrolls; content scrolls behind it.
- The label reads `x/y sets`; once every set is done it reads `✓ y/y sets` and the bar's fill is
  `--success`, otherwise it is Oat's `--primary`.
- The percentage is `Math.floor(x * 100 / y)`, so it shows 100% only when every set is done; label
  and percentage do not wrap and use tabular numerals.
- The `<progress>` carries `aria-label="x of y sets done"`.
- Toggling a set updates the strip without a request (the existing `set-updated` re-render), and the
  bar slides from its previous value to the new one with Oat's width transition in Chromium (Chrome,
  Edge, Android — the browsers the app targets). Firefox, whose `::-moz-progress-bar` has no
  transition, jumps. The first render of the view shows the value without sliding, and under
  `prefers-reduced-motion: reduce` the bar never slides.
- A workout without sets renders no strip.
- The strip follows the sets, not the workout's `done` flag, and stays (read-only) on a done workout.
- The summary line no longer has the outline "x/y done" badge; the workout-level success "✓ Done"
  badge and the per-exercise badges are unchanged.
- The header has a fixed height, `--header-height: calc(3.75rem + 1px)` in `ui/app.css` — the height
  it already has at every width — and the strip's `top` is that token, so it lines up at every width
  down to 320px.
- On the workout page, a field focused by the view (e.g. `restoreField` after a re-render) is not
  scrolled underneath the header and strip.
- `bun test --parallel`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass;
  `docs/frontend.md` describes the strip, the header-height token and the removed badge.

## Technical Key Decisions and Tradeoffs

1. **Page:** only the single workout view, `gz-workout-detail`.
   - Why: it is the only place sets are marked done.
   - Impact: no change to the list or the cards.
2. **Placement:** a sticky strip in the view's own shadow root, its first child.
   - Why: progress stays in sight while logging sets deep in a long workout.
   - Impact: the view must know where the header ends.
3. **Header height:** a fixed `--header-height` token on `:root` in `ui/app.css`; `gz-header`'s
   `:host` takes it as its `block-size`, border included.
   - Why: pure CSS — no `ResizeObserver` writing styles, no new slot mechanism in `app/`.
   - Impact: the header can no longer grow. It is one line, and already the same height at every
     width: `gz-theme-toggle` gives its button a `2.75rem` minimum everywhere "so the header it sets
     the height of matches on desktop and phone", plus the nav's 2 × `--space-2` padding and the 1px
     border — `calc(3.75rem + 1px)`. The nav keeps its padding, so its content fills the box exactly
     and nothing needs re-centering.
4. **Look:** a floating card in the content column, not a full-bleed band.
   - Why: matches the grouped surfaces (white cards on gray) and needs no `100vw` tricks, which would
     fight `scrollbar-gutter: stable`.
   - Impact: Oat's tokens as they are — `--card`, `--radius-medium`, `--shadow-medium`, `--success`.
5. **Slim, one line:** label · bar · percentage in one flex row, Oat's `0.5rem` `--bar-height`.
   - Why: take as little vertical space as possible.
   - Impact: the label is the short `x/y sets`; the full sentence lives in the `aria-label`.
6. **States:** none at 0 sets; `--primary` fill while in progress; `--success` fill and a ✓ at 100%.
   - Why: green means "complete" everywhere else in the app.
   - Impact: the fill color is set on Oat's `::-webkit-progress-value` and `::-moz-progress-bar`
     under a `.complete` class.
7. **Badge removal:** the summary's outline "x/y done" badge goes; its tests move to the strip.
   - Why: two counters for one number.
   - Impact: `#setProgressBadge` is deleted.
8. **Scroll padding:** `ui/app.css` sets
   `:root:has(gz-workout-detail) { scroll-padding-top: calc(var(--header-height) + 3rem) }`.
   - Why: the view is light DOM (slotted in `gz-app`), so `:has()` in the document sees it; focused
     fields are then scrolled into view below the header and strip, not under them.
   - Impact: only the workout page is affected.
9. **Animated bar across re-renders:** `render()` replaces the shadow root's markup, so every render
   is a new `<progress>`. The view remembers the value it last showed in `#barValue` and renders the
   new bar at that value; `afterRender()` then forces a style and layout pass
   (`void bar.offsetWidth`) and sets `bar.value` to the real count, so Oat's
   `transition: width var(--transition)` on `::-webkit-progress-value` runs from the old width.
   - Why: the view keeps its one render path; the alternative, patching the strip in place instead
     of re-rendering, would split the template.
   - Impact: a few lines in the view; `#barValue` starts `null`, so the first render uses the real
     count and nothing slides on load. The `aria-label`, label and percentage always show the real
     count; only the bar's `value` lags for that one synchronous step.

## Current State

```
gz-app (shadow root)
├── gz-header            :host sticky, top 0, z-index 10, --card, --border bottom; height from content
└── <main class="container">
    ├── gz-breadcrumbs   Workouts › Push day
    └── <slot> → gz-workout-detail (light DOM child of gz-app)
         └── .vstack
              ├── <hgroup> h1 + date line
              ├── .summary  "12 sets · 3 exercises · 96 reps · 4,320 kg" [7/12 done] [✓ Done]
              ├── <section> h2 Sets + <details name="exercises"> per exercise
              ├── gz-add-set-form
              ├── Mark workout done / Reopen workout
              └── <details> Details & notes
```

- `#setProgressBadge` (`gz-workout-detail.component.ts:330`) renders the outline summary badge;
  `readyTemplate` (`:408`) computes `sets` and `doneCount`.
- A set toggle emits `set-updated`, and the view swaps the set in and re-renders without a request
  (`:59`).
- Oat styles `<progress>` (`node_modules/@knadh/oat/css/progress.css`): full width, `--bar-height`,
  `--radius-full`, `--muted` track, `--primary` value with `transition: width var(--transition)`
  (WebKit/Blink only; Firefox's `::-moz-progress-bar` has none). Every render makes a new element,
  so today nothing would transition.
- `gz-header`'s height is already fixed in practice: `gz-theme-toggle.component.css` gives its
  button `min-height: 2.75rem` at every width.

## Desired End State

```
┌──────────────────────────────────────────────┐
│ ▣ gainz          Dashboard  Workouts  …   ☾  │  gz-header, block-size: var(--header-height)
└──────────────────────────────────────────────┘
   Workouts › Push day           (gz-app's breadcrumbs, above the view; scroll away)
   ╭────────────────────────────────────────────╮
   │ 7/12 sets  ██████████████░░░░░░░░░░   58% │  sticky, top: var(--header-height)
   ╰────────────────────────────────────────────╯
   Push day                      (scrolls behind the strip)
   Thu, Oct 9 · today
   12 sets · 3 exercises · 96 reps · 4,320 kg   [✓ Done]
   ▸ Bench press   4 sets · 1,200 kg   [2/4 done]
   …
```

Before it sticks the strip sits right below the breadcrumbs, above the title (it is the view's first
child). States:

```
0 sets       (no strip)

None done    ╭────────────────────────────────────────────╮
             │ 0/12 sets  ░░░░░░░░░░░░░░░░░░░░░░░░░░   0% │
             ╰────────────────────────────────────────────╯

All done     ╭────────────────────────────────────────────╮
             │ ✓ 12/12 sets ████████████████████████ 100%│   fill --success
             ╰────────────────────────────────────────────╯

320px        ╭──────────────────────────────╮
             │ 7/12 sets ████████░░░░░  58%│
             ╰──────────────────────────────╯
```

Markup:

```html
<!-- `complete` is added to the strip's class once every set is done. -->
<div class="progress-strip" data-testid="progress-strip">
  <span class="label" data-testid="progress-label">7/12 sets</span>
  <!-- `value` starts at the last value shown; afterRender() slides it to `data-value`. -->
  <progress value="6" data-value="7" max="12" aria-label="7 of 12 sets done" data-testid="progress-bar"></progress>
  <span class="percent text-light" data-testid="progress-percent">58%</span>
</div>
```

Numbers use `font-variant-numeric: tabular-nums` in the strip's own CSS rather than the monospace
`.mono` utility.

## Abstractions and Code Reuse

- Oat's `<progress>` styling as-is; only the fill color at 100% is overridden, with `--success`.
- Oat tokens: `--card`, `--radius-medium`, `--shadow-medium`, `--space-*`, `--success`,
  `--muted-foreground` via `.text-light`.
- `plural`/`html` from `ui/` where useful; no new component — the strip is a few lines of markup in
  the view, which already holds the counts.

- `src/frontend/ui/app.css` - add `--header-height` and the workout page's `scroll-padding-top`
- `src/frontend/app/gz-header.component.css` - `:host` gets `box-sizing: border-box` and
  `block-size: var(--header-height)`
- `src/frontend/features/workouts/gz-workout-detail.component.ts`
  - `#progressStrip(doneCount, setCount)` - new; empty for 0 sets
  - `#barValue` - new; the bar value last shown, `null` before the first render
  - `afterRender` - slides the new bar from `#barValue` to the real count
  - `#setProgressBadge` - removed
  - `readyTemplate` - renders the strip first, drops the summary badge
- `src/frontend/features/workouts/gz-workout-detail.component.css` - `.progress-strip` rules
- `src/frontend/features/workouts/gz-workout-detail.component.test.ts` - summary badge tests move to
  the strip; new strip tests
- `docs/frontend.md` - describe the strip, the token, the scroll padding; drop the summary badge

## Logging & Observability

None; this is a frontend display change.

## Implementation

Dependencies: None.

Header height token, the sticky strip, the badge removal, tests and docs in one vertical slice.

**Tasks**:

- [ ] `ui/app.css`: declare the token in the existing `:root` block, after the palette:
      ```css
      /* gz-header's fixed height, border included; sticky page chrome sits below it. */
      --header-height: calc(3.75rem + 1px);
      ```
- [ ] `ui/app.css`: add the workout page's scroll padding:
      ```css
      /* The workout page's progress strip sticks below the header. */
      :root:has(gz-workout-detail) {
        scroll-padding-top: calc(var(--header-height) + 3rem);
      }
      ```
- [ ] `app/gz-header.component.css`: add `box-sizing: border-box; block-size: var(--header-height);`
      to `:host`; `nav` keeps its padding and alignment.
- [ ] `gz-workout-detail.component.ts`: add `#progressStrip(doneCount: number, setCount: number): RawHtml`
      returning `html\`\`` for 0 sets, otherwise the markup above, with `complete` on the strip when
      `doneCount === setCount`, the label `${doneCount}/${setCount} sets` (prefixed `✓ ` when complete),
      the `aria-label` `${doneCount} of ${setCount} sets done`, and the percentage
      `${Math.floor((doneCount * 100) / setCount)}%` (multiplied first, so 29/100 is not 28.999…).
- [ ] `gz-workout-detail.component.ts`: in `readyTemplate`, render `${this.#progressStrip(doneCount, sets.length)}`
      as the `.vstack`'s first child, before the header template; remove `${this.#setProgressBadge(…)}`
      from `.summary` and delete `#setProgressBadge`.
- [ ] `gz-workout-detail.component.ts`: animate the bar across re-renders. Add
      `#barValue: number | null = null`; `#progressStrip` renders `value="${this.#barValue ?? doneCount}"`
      (label, percentage and `aria-label` keep the real count) and the real count in a
      `data-value` attribute. At the end of `afterRender()`:
      ```ts
      const bar = this.$<HTMLProgressElement>('progress');
      if (bar) {
        const target = Number(bar.dataset.value);
        if (bar.value !== target) {
          // A fresh element: lay out the old width first, so the transition has a start.
          void bar.offsetWidth;
          bar.value = target;
        }
      }
      this.#barValue = bar ? Number(bar.dataset.value) : null;
      ```
      A workout without sets resets `#barValue` to `null`, so its first set appears without sliding
      from a stale value.
- [ ] `gz-workout-detail.component.css`: style the strip:
      ```css
      .progress-strip {
        position: sticky;
        top: var(--header-height);
        z-index: 1;
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-1) var(--space-3);
        border-radius: var(--radius-medium);
        background-color: var(--card);
        box-shadow: var(--shadow-medium);
        font-variant-numeric: tabular-nums;

        & .label,
        & .percent {
          flex: none;
          white-space: nowrap;
        }

        & .label {
          font-weight: 600;
        }

        & progress {
          flex: 1 1 auto;
          min-width: 0;
        }

        &.complete progress {
          &::-webkit-progress-value {
            background-color: var(--success);
          }

          &::-moz-progress-bar {
            background-color: var(--success);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          & progress::-webkit-progress-value {
            transition: none;
          }
        }
      }
      ```
      Keep the `z-index` below the header's `10`.
- [ ] `gz-workout-detail.component.test.ts`: replace the summary badge tests — `counts the sets done
      so far`, `shows a done workout as done, beside its set progress`, `shows a workout whose sets are
      all done, but which is not, as not done`, `shows no done badge or finish button for a workout
      without sets` — with strip assertions, keeping their workout-badge and finish-button checks:
  - [ ] in progress (1 of 3 done): label `1/3 sets`, `<progress>` `value` 1 and `max` 3,
        `aria-label` `1 of 3 sets done`, percentage `33%`, no `complete` class
  - [ ] all done (3 of 3): label `✓ 3/3 sets`, percentage `100%`, `complete` class
  - [ ] none done: label `0/3 sets`, percentage `0%`
  - [ ] the percentage floors: 2 of 3 done shows `66%` (rounding would give 67), built with `withSets`
  - [ ] a done workout with sets skipped still shows `2/3 sets`, beside the success "✓ Done" badge
  - [ ] no strip for a workout without sets
  - [ ] the strip is the view's first element, before the heading
  - [ ] the summary holds no `progress` badge any more
- [ ] `gz-workout-detail.component.test.ts`: in `applies an updated set without a reload`, also
      assert the strip's label becomes `1/3 sets` and the new `<progress>`'s `value` ends at 1.
- [ ] `gz-workout-detail.component.test.ts`: on the first render of a workout with 1 of 3 done, the
      bar's `value` is 1 straight away, with no slide from 0.
- [ ] `docs/frontend.md`: in the `gz-workout-detail` overview (from the top: …) put the sticky
      progress strip first and drop "followed by the progress badges" from the summary line; rewrite
      the paragraph that begins "`gz-workout-detail` ends its summary line" so it describes the strip
      (one line, label · bar · floored percentage, `--success` fill and ✓ at 100%, follows the sets
      not the workout flag, absent without sets, sticks at `--header-height`, the `:has()` scroll
      padding, and how `#barValue` lets the freshly rendered bar slide from its old value in Chromium
      but not in Firefox or under reduced motion) and keeps the workout-level success "✓ Done" badge; in the header paragraph, say the
      header's height is the fixed `--header-height` from `app.css` so page chrome can stick below it.

**Automated Verification**:

- [ ] `bun test --parallel src/frontend/features/workouts/gz-workout-detail.component.test.ts` passes
- [ ] `bun test --parallel` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

**Manual Verification**:

- [ ] At desktop width and at 320px, in light and dark, the header looks unchanged (brand, links or
      hamburger, theme toggle vertically centered, nothing clipped)
- [ ] On a workout with sets, the strip sits above the title, and on scrolling sticks flush below the
      header with no gap or overlap, content passing behind it
- [ ] In Chrome or Edge, toggling a set slides the bar to its new width and updates the label and
      percentage at once; marking the last set done turns the fill green and adds the ✓; opening the
      workout shows the bar at its value without a slide
- [ ] With reduced motion turned on in the OS (or emulated in DevTools), the bar jumps instead of
      sliding
- [ ] At 320px the strip stays one line, the bar keeps a visible width, and the page does not scroll
      horizontally
- [ ] Editing a set field near the top of a long workout and committing it leaves the field visible
      below the strip, not under it

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/frontend.md` — `gz-workout-detail`, the header, theming
- `docs/styling-guidelines.md` — Oat first, no font sizes, 320px, Oat tokens as-is
- `node_modules/@knadh/oat/css/progress.css` — Oat's `<progress>` styling
- `docs/agents/plans/2026-10-07-mark-workouts-as-done.md` — the workout-level done badge
- `docs/agents/plans/2026-10-05-done-sets-and-exercise-hierarchy.md` — done sets' styling
