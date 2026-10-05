---
date: 2026-10-05T12:36:35.259307+00:00
git_commit: 0fff8e442f401f4c0bf3dd8ee348d4585263726f
branch: main
topic: 'Mobile contrast and design overhaul'
tags: [plan, frontend, styling, contrast, mobile, oat, gz-header, gz-workout-detail, gz-exercise-detail, gz-tile, open-card]
status: implemented
---

# PLAN: Mobile contrast and design overhaul

gainz is used mostly on a phone, often in a gym. On a phone today the control outlines barely show
(1.48:1 in light mode), primary-colored links fail AA in dark mode (3.72:1), the slate brand reads
as gray, and every screen opens on something other than what you came for: forms fill the first
screen of the workout, workouts and exercise pages, the dashboard's first screen is four stacked
tiles, and every exercise group header takes three lines. This plan retunes Oat's tokens for WCAG
AA and guards them with a test, switches to a grouped-surface look with a blue brand, sizes touch
targets for fingers, gives list cards one shape, and reorders the detail pages so the content
comes first and rare or destructive actions sit collapsed at the bottom.

## Acceptance Criteria

- In both themes every text/background token pair below meets WCAG AA (4.5:1), and `--border` and
  `--input` reach 3:1 against `--background` and `--card`; `src/frontend/ui/contrast.test.ts`
  enforces it.
- `--primary` is blue: light `#2563eb` with `#fafafa` text, dark `#60a5fa` with `#09090b` text;
  `--ring` follows `--primary`.
- Light mode is a grouped surface: page `--background` `#f4f4f5`, white `--card`s without a border;
  dark `--card` is `#202024`. Light `--muted-foreground` is `#52525b`, light `--muted` `#e4e4e7`.
- The header is a surface bar (`--card`, a `--border` bottom line) with the brand in `--primary`,
  page links in `--muted-foreground`, the current page in `--foreground` and bold, and `.ghost.icon`
  controls; the two "primary on a primary bar" border hacks are gone.
- At ≤720px every button, link button, text-like input and select is at least 44px (`2.75rem`)
  tall, and an icon button at least 44px wide.
- Below 640px a `.card` has `--space-4` padding.
- Workout and exercise cards share one layout: a head line (title, and a done badge at its end), a
  muted date or subtitle line, and a foot line of muted stats with the actions pushed to the end.
- Stat tiles are two columns at ≤640px; a tile's value uses `var(--text-3)`, its label is muted
  sentence case.
- `/workouts/:id` order: title and date, one muted summary line with the progress badge, the
  exercise groups, Add a set, then a collapsed "Details & notes" holding the autosaving form and
  "Delete workout". The section's open state survives reloads, and focus restoration in it still
  works.
- An exercise group's `<summary>` holds only the name, muted stats and the progress badge; ▲▼ and an
  "Exercise history →" link sit in a footer row inside the open group. The summary click guard is
  removed. The set row's × stays solid red.
- `/exercises/:id` order: back link, title, tiles, chart, session history, then a collapsed "Edit
  exercise" holding the form and "Delete exercise".
- `/workouts` has a "Start session" header button that creates a workout dated today and opens it;
  the New workout form is gone. `/exercises` has its add form in a collapsed "Add an exercise",
  open while there are no exercises. Both lists show their count as the subtitle.
- No page scrolls sideways at 320px or 375px, in either theme.
- `docs/styling-guidelines.md` and `docs/frontend.md` describe the new state.

## Technical Key Decisions and Tradeoffs

1. **Contrast through token values only.** Every color change is a token value in `ui/app.css`;
   no `color-mix()`, no per-component colors, buttons only through Oat variants.
   - Why: the house rules (one palette, no derived colors, no custom button colors).
   - Impact: `app.css` grows from three overrides to eleven; components only pick tokens.
2. **Blue brand, light in dark mode.** `--primary: light-dark(#2563eb, #60a5fa)`,
   `--primary-foreground: light-dark(#fafafa, #09090b)`.
   - Why: a primary link on a dark card needs a light primary (slate `#64748b` gave 3.72:1), and a
     light primary needs dark text on it — the same shape as Oat's default theme. Blue stands apart
     from the green done and red delete signals; teal was too close to green.
   - Impact: dark-mode primary buttons and the progress chart's line turn light blue.
3. **Surface header.** `gz-header`'s host takes `--card` and a `--border` bottom line instead of the
   `--primary` fill.
   - Why: blue is reserved for what is tappable or current; a light-blue band would be the
     brightest thing on a dark screen.
   - Impact: the menu and theme buttons become `.ghost.icon`; `.menu button { border-width: 0 }`
     and `gz-theme-toggle`'s `button { border-width: 0 }` are deleted.
4. **Grouped surfaces.** Light `--background` `#f4f4f5`, `.card` border transparent
   (`shared.css`), every `<details>` filled with `--card`; `--border`/`--input` at 3:1
   (light `#8b8b94`, dark `#71717a`).
   - Why: cards stand apart by fill, so the strong outlines go to controls only.
   - Impact: Oat paints inputs with `--background`, so light-mode inputs become gray-filled fields
     in white cards, mirroring dark mode's dark fields in dark cards. Disabled inputs use `--muted`,
     which therefore moves to `#e4e4e7` so a done set's fields still differ from live ones. The done
     workout card keeps its `--success` border: `article.done` outranks `.card`.
5. **One font-size exception.** `gz-tile`'s `.value` sets `font-size: var(--text-3)`.
   - Why: the number is the tile's point, and Oat has no heading utility class; an `<h3>` would
     pollute heading navigation.
   - Impact: the styling guideline's no-font-size rule names this single exception.
6. **44px touch targets as layout.** One `@media (max-width: 720px)` rule in `shared.css` sets
   `min-height: 2.75rem` (and `min-width` for `.icon`).
   - Why: sizing is layout, which the button rule allows; one rule covers every component.
   - Impact: phone rows grow a little taller; desktop is unchanged.
7. **Rare and destructive actions collapse to the bottom.** Workout details and Delete go into
   "Details & notes", exercise editing and Delete into "Edit exercise", both Oat `<details>`.
   - Why: logging and reviewing progress are the jobs; Delete beside the title invites mis-taps.
   - Impact: `gz-workout-detail` remembers `#detailsOpen` across its reloads, like
     `#openExerciseId`. `gz-exercise-detail` needs no state: only a successful save reloads it, and
     that closing the section is fine; a failed save and a metric switch re-render nothing.
8. **Group actions move into the open group.** ▲▼ and the exercise link leave `<summary>`.
   - Why: a collapsed group should be a glanceable name, stats and progress; reordering is done to
     the exercise you have open.
   - Impact: the click guard on `summary .actions` (`gz-workout-detail.component.ts:185-193`) and
     its two tests go; a closed group's arrows are hidden, so the move test opens the group first.
9. **Workouts list creates with a button.** "Start session" does what the dashboard's "Log today's
   workout" does.
   - Why: date, title and notes are editable on the workout itself; the form cost the first screen.
   - Impact: a past date is set after creating, in "Details & notes". `handleSubmit` and
     `.new-form` CSS leave `gz-workout-list`.
10. **Contrast is tested, layout is checked by hand.** `ui/contrast.test.ts` parses Oat's
    `01-theme.css` and overlays `app.css`; overflow and appearance stay manual, as in
    `2026-10-05-fit-pages-on-phone-screens.md`.
    - Why: token values are pure data; happy-dom does no layout.
    - Impact: a token tweak that drops below AA fails `bun test`.

## Current State

```
index.html ── oat.css (@layer theme: tokens) ── ui/app.css (unlayered: --primary, --ring)
  └ gz-app (shadow) ── gz-header  host bg --primary, white text, icon buttons primary + border hack
       └ <main class="container"> 16px
            └ view (shadow: oat.css + shared.css + own .css)
                 └ .card  24px padding, 1px --border (#d4d4d8 light / #52525b dark)
```

Measured contrast today:

| Pair                                | Light    | Dark     |
| ----------------------------------- | -------- | -------- |
| `--primary` text on `--card`        | 7.58     | **3.72** |
| `--primary-foreground` on primary   | 7.26     | 4.56     |
| `--border` vs `--card`              | **1.48** | **2.29** |
| `--card` vs `--background`          | 1.00     | 1.12     |

Workout detail at 375px today:

```
┌─────────────────────────┐
│ Push day       [Delete] │
│ Mon, 5 Oct · today      │
│┌───────────────────────┐│
││ Date  [            ]  ││   ← fills the first screen
││ Title [            ]  ││
││ Notes [            ]  ││
│└───────────────────────┘│
│ (6 sets)(2 exercises)   │
│ (48 reps)(2.668 kg…)(0/6)│
│ Sets                    │
│┌ Bench Press        ▴ ┐│
││ (3 sets·1.595 kg)(0/3)││
││ [▲|▼] [Exercise]      ││
│├───────────────────────┤│
││ [✓] 1      [+1] [▓×▓] ││
││ [72,5|kg] × [8|reps]  ││
││ [Felt strong.       ] ││
```

## Desired End State

Palette (`ui/app.css`), all pairs verified:

| Token                  | Light     | Dark      |
| ---------------------- | --------- | --------- |
| `--background`         | `#f4f4f5` | Oat `#09090b` |
| `--card`               | Oat `#fff`| `#202024` |
| `--primary`, `--ring`  | `#2563eb` | `#60a5fa` |
| `--primary-foreground` | `#fafafa` | `#09090b` |
| `--muted`              | `#e4e4e7` | Oat `#27272a` |
| `--muted-foreground`   | `#52525b` | Oat `#a1a1aa` |
| `--border`, `--input`  | `#8b8b94` | `#71717a` |

| Pair (min ratio)                      | Light       | Dark        |
| ------------------------------------- | ----------- | ----------- |
| foreground on bg / card (4.5)         | 18.10/19.90 | 19.06/15.55 |
| muted-foreground on bg / card (4.5)   | 7.03/7.73   | 7.76/6.33   |
| primary on bg / card (4.5)            | 4.70/5.17   | 7.83/6.39   |
| primary-foreground on primary (4.5)   | 4.95        | 7.83        |
| danger-foreground on danger (4.5)     | 4.77        | 6.94        |
| success on bg / card (4.5)            | 4.62/5.08   | 8.92/7.28   |
| danger on bg / card (4.5)             | 4.53/4.98   | 7.79/6.36   |
| border, input on bg / card (3)        | 3.07/3.38   | 4.12/3.36   |

Header (both themes):

```
┌────────────────────────────────┐
│ gainz              ☾  │  ≡    │   --card, brand --primary, ghost icons
├────────────────────────────────┤   1px --border
```

Dashboard at 375px:

```
Dashboard        [Log today's workout]
Last session today.
┌─────────────┐ ┌─────────────┐
│ Workouts    │ │ Total volume│
│ 16          │ │ 39,7 t      │   value at --text-3
│ 95 sets     │ │ reps × …    │
└─────────────┘ └─────────────┘
┌─────────────┐ ┌─────────────┐
│ Last 30 days│ │ Exercises   │
└─────────────┘ └─────────────┘
Recent workouts            See all
┌────────────────────────────────┐
│ Leg day                ✓ Done  │
│ Fri, 2 Oct 2026 · 3 days ago   │
│ 4 sets · 1 exercise · 2.500 kg │
│                       [Repeat] │
└────────────────────────────────┘
```

Workout detail at 375px:

```
Push day
Mon, 5 Oct 2026 · today
6 sets · 2 exercises · 48 reps · 2.668 kg   (0/6 done)
Sets
┌ Bench Press                  ▴ ┐
│ 3 sets · 1.595 kg     (0/3 done)│
├────────────────────────────────┤
┃ [ ✓ ]  1             [+1] [▓×▓]│  44px controls, × solid red
┃ [72,5   | kg] × [8     | reps] │
┃ [Felt strong.                ] │
├────────────────────────────────┤
│ [▲|▼]       [Exercise history →]│  footer of the open group
└────────────────────────────────┘
┌ Overhead Press               ▾ ┐
│ 3 sets · 1.073 kg     (0/3 done)│
└────────────────────────────────┘
Add a set  [card]
┌ Details & notes              ▾ ┐   open: date, title, notes, [Delete workout]
└────────────────────────────────┘
```

Workouts and exercises lists:

```
Workouts         [Start session]      Exercises
16 sessions                           6 exercises
┌ Push day … ┐                        ┌ Add an exercise          ▾ ┐
┌ Leg day  … ┐                        ┌ Back Squat                 ┐
                                      │ Legs · Low bar, belt …     │
                                      │ 20 sets · 100 kg best · …  │
```

Exercise detail:

```
← Exercises
Back Squat
Legs
[tile][tile]
[tile][tile]
┌ Estimated 1RM chart ┐
┌ Session history     ┐
┌ Edit exercise     ▾ ┐   open: name, group, notes, [Save], [Delete exercise]
```

## Abstractions and Code Reuse

No new abstractions. Tokens stay Oat's, `<details>` is Oat's accordion, layout uses Oat's
`.hstack`/`.vstack`/`.text-light`, and both new collapsible sections reuse the
`#openExerciseId`-style "remember across reloads" pattern only where a reload happens.

- `src/frontend/ui/`
  - `app.css` — the palette above.
  - `contrast.test.ts` (new) — parses Oat's theme and `app.css`, asserts the pair table.
  - `shared.css` — borderless `.card`, `--card`-filled `<details>`, phone card padding, 44px
    targets, new `open-card` layout (`.head`, `.foot`).
  - `tile/gz-tile.component.css` — sentence-case muted label, `--text-3` value.
- `src/frontend/app/`
  - `gz-header.component.css`, `gz-header.component.ts` — surface bar, `.ghost.icon` menu button.
  - `gz-theme-toggle.component.css`, `gz-theme-toggle.component.ts` — `.ghost.icon`, hack removed.
- `src/frontend/features/stats/gz-dashboard.component.css` — two tile columns on phones.
- `src/frontend/features/workouts/`
  - `gz-workout-card.component.ts` — head/date/foot markup, stats as muted text.
  - `gz-workout-list.component.ts` / `.css` / `.test.ts` — "Start session", count subtitle.
  - `gz-workout-detail.component.ts` / `.css` / `.test.ts` — new order, `#detailsOpen`, group
    footer, guard removed.
- `src/frontend/features/exercises/`
  - `gz-exercise-list.component.ts` / `.css` — collapsed add form, card markup, count subtitle.
  - `gz-exercise-detail.component.ts` / `.css` / `.test.ts` — new order, "Edit exercise".
- `docs/styling-guidelines.md`, `docs/frontend.md` — updated per phase.

## Logging & Observability

None.

## Implementation

### Phase 1: Palette, surfaces, header and touch targets

Dependencies: None

Retune the tokens, guard them with a test, turn on the grouped surfaces, flatten the header and
size the controls for fingers. Every page benefits without any markup change beyond the header.

**Tasks**:

- [x] `ui/app.css` — replace the brand block with the palette, keeping the comment style:
      ```css
      /* gainz's palette: Oat's tokens with blue as the brand and every text pair at WCAG AA, every
         control border at 3:1 (ui/contrast.test.ts checks both). Light mode is a grouped surface:
         a gray page with white cards. Unlayered, so it wins over Oat's theme layer. */
      :root {
        --background: light-dark(#f4f4f5, #09090b);
        --card: light-dark(#fff, #202024);
        --primary: light-dark(#2563eb, #60a5fa);
        --primary-foreground: light-dark(#fafafa, #09090b);
        --ring: light-dark(#2563eb, #60a5fa);
        --muted: light-dark(#e4e4e7, #27272a);
        --muted-foreground: light-dark(#52525b, #a1a1aa);
        --border: light-dark(#8b8b94, #71717a);
        --input: light-dark(#8b8b94, #71717a);
      }
      ```
- [x] `ui/contrast.test.ts` (new, no DOM) — read
      `node_modules/@knadh/oat/css/01-theme.css` and `src/frontend/ui/app.css` with `Bun.file`,
      collect every `--name: value;` whose value is a hex color or `light-dark(#a, #b)` (Oat's
      first, `app.css` overriding), split each into `light` and `dark`, expanding three-digit hex
      (`#fff`, which Oat's `--background` and `--card` use) to six, and compute the WCAG 2
      relative-luminance ratio. One `test.each` per theme over the pair table in *Desired End
      State*: text pairs ≥ 4.5, `--border`/`--input` on `--background`/`--card` ≥ 3. A failure names
      the theme, both tokens and the ratio.
- [x] `ui/shared.css` — in the `pieces` section, before `article.open-card`:
      ```css
      /* Cards stand apart from the gray page by their fill; the 3:1 outlines are for controls. */
      .card {
        border-color: transparent;

        @media (max-width: 640px) {
          padding: var(--space-4);
        }
      }

      /* Oat's accordion is transparent; on the gray page it reads as a card. */
      details {
        background-color: var(--card);
      }
      ```
- [x] `ui/shared.css` — new `touch` section after `forms`:
      ```css
      /* A fingertip needs 44px. Only the size changes; the colors stay Oat's variants. */
      @media (max-width: 720px) {
        :is(button, a.button, select, input:not([type="checkbox"], [type="radio"])) {
          min-height: 2.75rem;
        }

        :is(button, a.button).icon {
          min-width: 2.75rem;
        }
      }
      ```
- [x] `app/gz-header.component.css` — `:host` takes `background-color: var(--card)`,
      `color: var(--foreground)`, `border-bottom: 1px solid var(--border)`, and drops the shadow.
      `.links a` becomes `color: var(--muted-foreground)` with `&:hover` underlined and
      `&[aria-current="page"] { color: var(--foreground); font-weight: 600; }`. `.brand` takes
      `color: var(--primary)`. Both dividers (`gz-theme-toggle` and the ≤560px `.menu`) use
      `var(--border)`. Delete the `.menu button { border-width: 0 }` rule and its comment.
- [x] `app/gz-header.component.ts` — the menu button's class becomes `ghost icon`.
- [x] `app/gz-theme-toggle.component.ts` — the button's class becomes `ghost icon`.
- [x] `app/gz-theme-toggle.component.css` — delete the `button { border-width: 0 }` rule and its
      comment.
- [x] `docs/styling-guidelines.md` — in the Oat-first bullet, say the palette lives in `app.css` as
      token values and `ui/contrast.test.ts` holds it to AA; add a bullet **"Grouped surfaces."**
      (gray page, borderless cards, `<details>` filled with `--card`, 3:1 borders for controls only);
      add to the 320px bullet that at ≤720px `shared.css` gives every control 44px. Leave the
      font-size bullet for Phase 2.
- [x] `docs/frontend.md` — rewrite the header sentences (around line 148) for the surface bar:
      `--card` with a `--border` line, brand in `--primary`, links in `--muted-foreground`, the
      current page in `--foreground` and bold, `.ghost.icon` hamburger and theme toggle; in
      *Theming*, say the brand and contrast tokens live in `app.css`.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/ui/contrast.test.ts` passes, and fails when a token is set
      back to its old value (checked once, then restored)
- [x] `bun run fmt:check` passes
- [x] `bun run lint` passes
- [x] `bun run typecheck` passes
- [x] `bun test --parallel` passes

**Manual Verification** (`bun run start:dev` with seeded data, phone emulation at 375px, both
themes):

- [x] The header is a light/dark surface bar with a blue brand; the current page is bold in the
      desktop links and the menu; the menu and theme buttons show no border.
- [x] Inputs, outline buttons and badges have clearly visible outlines; cards have none, and stand
      out from the gray page (light) or black page (dark).
- [x] A done set's disabled fields look different from a live set's.
- [x] Buttons and inputs are visibly taller on a phone; above 720px they look as before.

### Phase 2: List cards, tiles and the list pages

Dependencies: Phase 1 (card padding and surfaces)

Give every list card one shape, put tiles two across, replace the New workout form with a button
and collapse the add-exercise form.

**Tasks**:

- [x] `ui/shared.css` — replace `article.open-card`'s row layout with a column of lines, keeping the
      `::after` hit area, the hover rules and the positioned `.actions`:
      ```css
      article.open-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);

        /* The title, with a done badge at the end of its line. */
        & .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
        }

        /* Muted stats, with the actions pushed to the end and wrapping below them when short of room. */
        & .foot {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-2);

          & .actions {
            margin-inline-start: auto;
          }
        }
        …
      }
      ```
      Delete the `@media (max-width: 640px) { flex-wrap: wrap; }` rule.
- [x] `features/workouts/gz-workout-card.component.ts` — template becomes
      `.head` (the `a.open` and, when done, the success badge), `div.text-light` with the date,
      and `.foot` holding `span.text-light` with the stats (no `.badge`) and `.actions` with Repeat.
- [x] `features/exercises/gz-exercise-list.component.ts` — `#card` becomes `.head` (the
      `a.open`), the subtitle `div.text-light`, and `.foot` with the stats as `span.text-light`.
- [x] `ui/tile/gz-tile.component.css` — `.label` drops `text-transform` and `letter-spacing` and
      its weight; `.value` gets `font-size: var(--text-3);` with a comment pointing to the
      guideline's exception.
- [x] `features/stats/gz-dashboard.component.css` and
      `features/exercises/gz-exercise-detail.component.css` — nest in `.tiles`:
      ```css
      @media (max-width: 640px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      ```
- [x] `features/workouts/gz-workout-list.component.ts` — delete `#newWorkoutForm` and
      `handleSubmit`; the header becomes an `hgroup` (`h1` Workouts, `p.text-light` with
      `plural(total, 'session')`) beside `<button data-action="start-session">Start session</button>`;
      `handleAction('start-session')` creates `{ performedOn: todayIso() }` through `workoutFacade`
      and navigates to it, toasting a failure, as `gz-dashboard` does. The empty text becomes
      "No sessions logged yet. Start one with Start session."
- [x] `features/workouts/gz-workout-list.component.css` — delete the `.new-form` rule, keep the file
      with its header comment.
- [x] `features/exercises/gz-exercise-list.component.ts` — the header becomes an `hgroup` with
      `plural(total, 'exercise')` as `p.text-light`; the add-form `article.card` becomes
      `<details class="add" ${total === 0 ? 'open' : ''}><summary>Add an exercise</summary><form …></details>`
      with the form unchanged. Empty text: "No exercises yet. Add the lifts you train above."
      stays true.
- [x] `features/exercises/gz-exercise-list.component.css` — the selector moves to
      `.add .new-form .field-notes`; update the header comment.
- [x] `features/workouts/gz-workout-list.component.test.ts` — add: "Start session" posts
      `{ performedOn: today }` to `/api/workouts` and navigates to the new workout; the subtitle
      shows the session count.
- [x] `features/workouts/gz-workout-card.component.test.ts` — add: the stats are a muted line, not a
      badge (`.foot .text-light` text, no `.badge.outline`).
- [x] An exercise-list test (new `gz-exercise-list.component.test.ts`, following the workout list's
      setup) — "Add an exercise" is open with no exercises and closed with some.
- [x] `docs/styling-guidelines.md` — the font-size bullet names the one exception: `gz-tile`'s value
      uses Oat's `--text-3`.
- [x] `docs/frontend.md` — the card paragraph (around line 71) describes the head/date/foot lines and
      stats as muted text; the `article.open-card` paragraph (around line 188) mentions `.head` and
      `.foot`; describe "Start session" on the workouts list and the collapsed "Add an exercise".

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/workouts src/frontend/features/exercises src/frontend/ui` passes
- [x] `bun run fmt:check` passes
- [x] `bun run lint` passes
- [x] `bun run typecheck` passes
- [x] `bun test --parallel` passes

**Manual Verification** (phone emulation at 320px and 375px, both themes):

- [x] Every workout and exercise card has the same shape; Repeat sits at the end of the stats line or
      right-aligned below it, never at the start of a line.
- [x] The dashboard's and an exercise's tiles are two across, the value clearly larger than its
      label; "100 kg × 8" stays readable at 320px.
- [x] "Start session" on `/workouts` opens a new workout dated today.
- [x] "Add an exercise" is collapsed on `/exercises` and still adds an exercise.
- [x] `/`, `/workouts`, `/exercises` do not scroll sideways.

### Phase 3: Workout detail, sets first

Dependencies: Phase 1 (`<details>` fill, touch targets)

Reorder the logging screen, collapse the details and Delete, and slim the exercise group headers.

**Tasks**:

- [x] `gz-workout-detail.component.ts` — `#headerTemplate` becomes only the `hgroup` (title, date ·
      relative day); the delete button leaves it.
- [x] `gz-workout-detail.component.ts` — the `.totals` badges become
      `<div class="summary hstack gap-2"><span class="text-light">6 sets · 2 exercises · 48 reps · 2.668 kg</span>${progress}</div>`
      built from the same `plural`/`formatVolume` values.
- [x] `gz-workout-detail.component.ts` — new `#detailsTemplate(workout)`, rendered after
      `<gz-add-set-form>`:
      ```html
      <details class="details-section" ${this.#detailsOpen ? 'open' : ''}>
        <summary>Details & notes</summary>
        <div class="vstack gap-2">
          <form class="details vstack gap-2">…the existing fields…</form>
          <div><button data-variant="danger" data-action="delete-workout">Delete workout</button></div>
        </div>
      </details>
      ```
      It carries no `name`, so it does not join the exercises' exclusive group.
- [x] `gz-workout-detail.component.ts` — add `#detailsOpen = false` with a doc comment like
      `#openExerciseId`'s, and in `afterRender` a `toggle` listener on `details.details-section`
      that records `open`.
- [x] `gz-workout-detail.component.ts` — `#groupTemplate`: the `<summary>` keeps
      `.exercise-name`, then `<span class="group-stats text-light">${this.#groupSummary(group)}</span>`
      and the progress badge. After `.sets` add
      ```html
      <div class="group-actions">
        <fieldset class="group move">▲ ▼ (unchanged)</fieldset>
        <a class="button outline" href="/exercises/${id}">Exercise history →</a>
      </div>
      ```
- [x] `gz-workout-detail.component.ts` — delete the `summary .actions` click-guard loop in
      `afterRender` and its comment; `#focusMove` is unchanged.
- [x] `gz-workout-detail.component.css` — replace `.totals` with `.summary` (wraps); in `summary`
      drop the `.badge`/`.actions`/`.move` rules and give `.group-stats` `flex: none`; move the
      `.move` rule under a new
      ```css
      .group-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        /* Edge to edge like the rows, divided from them by the same line. */
        margin: 0;
        padding: var(--space-3) var(--space-4);
        border-top: 1px solid var(--border);
      }
      ```
      and in the ≤720px block keep the name beside the chevron on line one and put
      `.group-stats` and the badge on line two (drop the `.actions` ordering).
- [x] `gz-workout-detail.component.test.ts` — update: the totals test reads `.summary .text-light`;
      `headerBadges` reads the progress badge only and the stats test reads `.group-stats`; the
      exercise link test reads `.group-actions a.button`; the move test opens group 2 before
      clicking its ▲. Delete "keeps a click among the header's actions from toggling the group…" and
      "keeps a click on an arrow from toggling its group" and the `clickPrevented` helper if unused.
- [x] `gz-workout-detail.component.test.ts` — add: "Details & notes" starts collapsed; stays open
      across a reload caused by a set change once opened; "Delete workout" lives inside it;
      `summary` contains no button or link.
- [x] `docs/frontend.md` — rewrite the `gz-workout-detail` paragraphs (lines 77-136): the page
      order, the summary line, "Details & notes" with `#detailsOpen`, the group summary (name, muted
      stats, progress badge) and the `.group-actions` footer with ▲▼ and "Exercise history →";
      delete the click-guard explanation.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/workouts/gz-workout-detail.component.test.ts` passes
- [x] `bun run fmt:check` passes
- [x] `bun run lint` passes
- [x] `bun run typecheck` passes
- [x] `bun test --parallel` passes

**Manual Verification** (phone emulation at 320px and 375px, both themes):

- [x] Opening a workout shows the title, the summary line and the first exercise's sets on the
      first screen.
- [x] A collapsed group is two lines: name and chevron, stats and progress badge.
- [x] ▲▼ in the open group's footer move it and keep it open; "Exercise history →" opens the
      exercise.
- [x] With "Details & notes" open, editing the title and tapping into the notes saves the title and
      keeps the section open and the cursor in the notes; marking a set done keeps it open.
- [x] "Delete workout" still asks and deletes.
- [x] `/workouts/:id` does not scroll sideways.

### Phase 4: Exercise detail, progress first

Dependencies: Phase 2 (tiles)

Put the progress first and collapse editing and Delete at the bottom.

**Tasks**:

- [x] `gz-exercise-detail.component.ts` — `#headerTemplate` keeps the back link and the `hgroup`
      only; the delete button and the form card leave it.
- [x] `gz-exercise-detail.component.ts` — new `#editTemplate(exercise)` rendered after
      `<gz-session-table>`:
      ```html
      <details class="edit">
        <summary>Edit exercise</summary>
        <div class="vstack gap-2">
          <form class="vstack gap-2" data-action="save-exercise">…unchanged…</form>
          <div><button data-variant="danger" data-action="delete-exercise">Delete exercise</button></div>
        </div>
      </details>
      ```
      No open state: a successful save reloads and closes it (the toast confirms), a failed save and
      a metric switch re-render nothing. Say so in a comment.
- [x] `gz-exercise-detail.component.test.ts` — add: the order is tiles, chart, table, then
      `details.edit`; "Delete exercise" is inside `details.edit`; existing save tests keep finding
      `form[data-action='save-exercise']`.
- [x] `docs/frontend.md` — describe the exercise page's order and "Edit exercise".

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/exercises/gz-exercise-detail.component.test.ts` passes
- [x] `bun run fmt:check` passes
- [x] `bun run lint` passes
- [x] `bun run typecheck` passes
- [x] `bun test --parallel` passes

**Manual Verification** (phone emulation at 320px and 375px, both themes):

- [x] Opening an exercise shows its tiles on the first screen, then the chart and history.
- [x] "Edit exercise" saves a rename and closes; "Delete exercise" on an exercise in use toasts the
      409 and stays.
- [x] Session-history date links are readable in dark mode.
- [x] None of `/`, `/workouts`, `/workouts/:id`, `/exercises`, `/exercises/:id` scrolls sideways.

## Implementation Notes

- Screenshots for planning came from headless Edge driven over CDP with
  `Emulation.setDeviceMetricsOverride({ width: 375, mobile: true })` and
  `Emulation.setEmulatedMedia` for the color scheme; plain `--headless --window-size=390,…` lays out
  at a desktop minimum width and crops, so it is not a phone check.

## References

- `node_modules/@knadh/oat/css/01-theme.css` — Oat's tokens
- `node_modules/@knadh/oat/css/form.css` — inputs use `--background`, disabled ones `--muted`
- `node_modules/@knadh/oat/css/accordion.css`, `card.css`, `button.css`, `badge.css`
- `src/frontend/ui/app.css`, `src/frontend/ui/shared.css`
- `src/frontend/features/workouts/gz-workout-detail.component.ts:185-193` — the click guard
- `docs/agents/plans/2026-10-05-fit-pages-on-phone-screens.md` — the 320px rule and breakpoints
- `docs/agents/plans/2026-10-05-done-sets-and-exercise-hierarchy.md` — set-row stripe and groups
- WCAG 2.2 SC 1.4.3 (text contrast) and 1.4.11 (non-text contrast), 2.5.8 (target size)
