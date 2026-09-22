---
date: 2026-09-22T14:37:59+00:00
git_commit: 7e0b52b273d83bce85e0a728f693b2ffae3d16bf
branch: main
topic: 'Open workouts and exercises by clicking the card'
tags: [plan, frontend, workouts, exercises, routing, forms, styling]
status: ready
---

# PLAN: Open workouts and exercises by clicking the card

Today the two lists disagree with each other and with themselves. A workout is opened by clicking
its **title** — a five-word target inside a card the rest of which does nothing — and an exercise is
opened by clicking its **name** in a table row that also carries an Edit button, which does not open
anything but swaps the row for an inline form. Editing therefore happens in two unrelated places:
an exercise is edited *in the list*, a workout is edited *on its detail page behind a toggle*.

This plan makes both entities work the same way, in one sentence: **a list item is a Pico card, the
whole card opens the entity, and everything you can do to that entity lives on its page.** The
lists keep exactly one action between them — "Repeat" on a workout, which creates a *different* entity — and
lose Edit and Delete entirely. Both detail pages grow the same header: the entity's identity, a
Delete button, and an always-visible form holding every editable field. No edit button anywhere.

Research behind it: `docs/agents/research/2026-09-22-opening-and-creating-workouts-and-exercises.md`.
Its central finding — *opening is declarative, creating is imperative* — is what constrains the
design here: opening must stay a plain `<a href>` that `gz-app` intercepts, not a click handler, or
the app loses deep links, middle-click, Ctrl-click and keyboard activation for half its navigation.
That is why the whole-card hit area is built from the anchor's own `::after`, not from JavaScript.

## Acceptance Criteria

- On `/workouts`, a click anywhere on a session card — the title, the date line, the badge, or the
  empty space between them — opens that workout. Ctrl/middle-click still opens it in a new tab, and
  the card is reachable and activatable by keyboard.
- On `/exercises`, the catalogue is a list of cards of the same shape, and a click anywhere on one
  opens that exercise.
- Neither list has an Edit or a Delete button. `/workouts` keeps "Repeat" and `/exercises` keeps the
  "Add an exercise" form; a click on Repeat repeats and does **not** navigate to the source workout.
- `/workouts/:id` shows the session's title and date, a Delete button, and a form for date, title
  and notes that is always visible. There is no Edit toggle and no Cancel.
- `/exercises/:id` shows the exercise's name and muscle group, a Delete button, and a form for name,
  muscle group and notes that is always visible — laid out the same way as the workout's.
- Logging a set on `/workouts/:id`, or switching the charted metric on `/exercises/:id`, does not
  discard text already typed into the details form.
- Saving the details form shows the saved values; clearing the muscle group or the notes clears them
  on the server.
- Deleting from a detail page returns to the list; a refused delete (an exercise still used by a
  set) surfaces the server's message and stays on the page.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass.

## Technical Key Decisions and Tradeoffs

1. **The whole-card hit area is the anchor's own `::after`, not a click handler on the card.**
   - Why: `gz-app` routes a click only when `composedPath()` contains a real `HTMLAnchorElement`
     and `linkPath` approves it (`src/frontend/app/router.ts:83-105`). An overlay drawn by
     `a.open::after { position: absolute; inset: 0 }` *is* part of the anchor, so a click on it has
     the anchor in its composed path and every rule keeps holding: Ctrl-click opens a tab,
     middle-click opens a tab, the status bar shows the URL, Tab reaches it and Enter activates it.
     A `click` handler on the card would have to reimplement all of that and would still leave the
     card invisible to the keyboard.
   - Impact: one CSS block, no JavaScript. The known cost is that text inside a card can no longer
     be selected with the mouse — the overlay sits over it. This is the standard trade of the
     "stretched link" pattern and is accepted; nothing on these cards is worth copying, and the
     detail page the card opens has the same text as selectable prose.

2. **A list item is Pico's card — an `<article>` — not a hand-rolled box.**
   - Why: Pico's card *is* `<article>` (`pico.css:1992-2018`): `--pico-card-background-color`,
     `--pico-card-box-shadow`, `border-radius` and `--pico-block-spacing-*` padding, all already
     theme-aware. The list rows are hand-rolled today — `.workout` is a `<div>` with a 1px
     `--pico-muted-border-color` border and `0.7rem 0.85rem` of padding, and `gz-dashboard`'s
     `.workout-link` is a third variation of the same idea. Carrying that forward under a new name
     would have kept a bespoke box in a codebase whose rule is that hand-written CSS stays a thin
     layer over Pico (`docs/styling-guidelines.md:3-5`), and would have claimed the name `card` for
     something that is not Pico's card.
   - Impact: the hand-written rule shrinks to what Pico genuinely does not provide — the flex
     layout, the overlay, and the `.actions` group. Two consequences to accept: a list row is now a
     shadowed, `1rem`-padded card rather than a thin bordered strip, so a 25-session log is taller
     and heavier; and these cards sit *inside* the `<article>` panels the pages already use for
     "New workout", "Add an exercise" and "Session history", so the lists themselves must **not** be
     wrapped in a panel article, or the page becomes cards within cards. `gz-exercise-list`'s
     `<article><table>` wrapper therefore disappears rather than being reused.

3. **The class is `article.open-card` in `ui/shared.css`, and `.workout` is deleted, not renamed.**
   - Why: the class names what Pico's article cannot know — that this card opens something. It is
     scoped to `article` so the rule cannot be applied to a bare `<div>` and quietly lose Pico's
     box. `shared.css` is adopted into every shadow root and is already where the shared vocabulary
     lives (`.badge`, `.empty`, `.fields`, `.row-between`, `button.compact`), so the two lists share
     one definition rather than a copy each.
   - Impact: `docs/styling-guidelines.md:9-11` uses `.workout`, `.workout:hover`, `.workout a` as
     its worked example of CSS nesting, so that example has to be rewritten in the same commit.
     `gz-workout-list.component.css` is left holding only `.new-form .field-notes`; it stays on
     disk, because `static.routes.test.ts:33-42` asserts a stylesheet beside every
     `gz-*.component.ts`.

4. **The card is an `<article>` containing `<a class="open">`, on both lists, even though the
   exercise card has no buttons left.**
   - Why: the workout card keeps "Repeat", and a `<button>` inside an `<a>` is invalid HTML — the
     workout card cannot be a wrapping anchor. Giving the exercise card the wrapping-anchor shape
     instead — which is what `gz-dashboard`'s rows use today (`gz-dashboard.component.ts:87`), and
     what decision 9 gives up for this reason — would mean two card structures for one visual idea,
     and two places to change the day one of them gains a button. "The same manner" is the point.
   - Impact: the exercise card carries an overlay it would not strictly need. No behavioural cost.

5. **The details form is always rendered, and its in-progress values survive a re-render through a
   `#edits` draft the template reads from.**
   - Why: this is the one real hazard in the whole plan. `GzElement.render()` is
     `root.innerHTML = template()` (`src/frontend/ui/base.ts:62`), so every re-render throws the
     form's DOM away. `gz-workout-detail` re-renders after **every logged set** — `#load()` runs on
     `add-set`, on `repeat-exercise` and on each `sets-changed` from a `gz-set-row`
     (`gz-workout-detail.component.ts:86-88`). `gz-exercise-detail` re-renders on every metric
     switch (`gz-exercise-detail.component.ts:103`). With the form hidden behind a toggle this
     costs nothing, because it is closed; made always-visible without a draft, typing a session
     title and then logging a set would silently wipe the title. So the feature that removes the
     toggle must bring the draft with it.
   - How: the same shape the add-set form already uses. `#draft` (`gz-workout-detail.component.ts:48`)
     feeds `#addSetTemplate()`, and the template — not the DOM — is the source of truth. `#edits`
     does the same for the details form: `null` means "show what the server returned", non-null
     means "show what the user typed". An `input` listener registered in `afterRender()` keeps it
     current, and a successful save sets it back to `null` so the next render shows the server's
     own normalisation (a cleared muscle group coming back as blank rather than as the stale text).
   - Impact: ~15 lines in each detail component. Focus and caret position are still lost when a
     re-render lands mid-typing — the value survives, the cursor does not. Accepted: it matches what
     the add-set form already does, and it takes logging a set *while* typing a title to notice.

6. **Notes leave the read-only header and live only in the form.**
   - Why: with the form always on screen, `gz-workout-detail`'s `.header-notes` paragraph
     (`gz-workout-detail.component.ts:265`) and the ` · ${notes}` tail of `gz-exercise-detail`'s
     subtitle (`gz-exercise-detail.component.ts:212`) would print the same text twice, a few
     centimetres apart, one of them editable.
   - Impact: the `hgroup` keeps the entity's *identity* — title and date, name and muscle group —
     which is what a page heading is for and what survives as the answer to "where am I". Everything
     editable, including the muscle group and the title that also appear in the heading, is in the
     form. `.header-notes` is deleted from `gz-workout-detail.component.css`.

7. **Delete moves onto the detail pages; Repeat stays on the workout card.**
   - Why: Delete and Repeat are not the same kind of button. Delete acts on *this* entity and
     belongs with everything else that acts on it — and it is destructive, so putting it one click
     further from a list of look-alike rows is a feature. Repeat acts on the *source* workout to
     create a **new** one; it is a list-level shortcut, it is the only way to reach that flow, and
     moving it to the detail page would mean opening a session to say "not this one, a copy".
   - Impact: `gz-exercise-detail` gains a Delete it never had, with the list's own confirm wording
     and its 409 handling (an exercise used by a set cannot be deleted —
     `exercise.repository.ts:70`). `gz-workout-list` loses `workoutFacade.delete` entirely;
     `gz-workout-detail` already had it.

8. **The exercise catalogue's table becomes cards, and the columns become one badge line.**
   - Why: a `<tr>` cannot reliably host the overlay — `position: relative` on a table row is
     under-specified and was historically ignored — so keeping the table would mean either a click
     handler (decision 1 says no) or a per-cell overlay. Cards also make the two lists the same
     thing, which is the request.
   - Impact: the six columns collapse to `name` + `muscle group · notes` above, and one badge
     reading `N sets · <best> best · <last done>` on the right, mirroring the workout card's badge
     exactly. `workoutCount` stays unused, as it is today. Sorting and column alignment are lost;
     the list was never sortable, and the table's `td.name` / `td.actions` / `.edit-row` /
     `.edit-fields` rules are deleted with it.

9. **`gz-dashboard`'s "Recent workouts" rows adopt the same card, which they did not need
   to before.**
   - Why: behaviourally they are already where this plan is going — wrapping anchors with no
     buttons (`gz-dashboard.component.ts:87-94`), so the whole row already opens the workout. The
     first draft therefore left them alone. Decision 2 changes that calculus: once the card is
     Pico's `<article>`, `.workout-link` is the *last* hand-rolled box in the app doing a job Pico
     has a component for, and leaving it would mean the three lists that show the same thing are
     drawn three different ways, one of them competing with Pico.
   - Impact: one markup change and one deleted CSS block, and it is the only part of this plan that
     touches a page the request did not name — kept as a single task so it can be dropped without
     disturbing anything else. The dashboard's rows visibly change: Pico's card background and
     shadow replace the thin border, `align-items` moves from `baseline` to `center`, and the hover
     stops tinting the border primary and tints the link instead, like the other two lists.

10. **No backend, facade or DTO change.**
   - Why: every call this plan needs already exists and is already pinned by a facade test —
     `exerciseFacade.update`/`delete` (`exercises.facade.ts:28-34`, asserted in
     `exercises.facade.test.ts`) and `workoutFacade.update`/`delete` (`workouts.facade.ts:27-32`).
     `optionalString` normalises `''` to `null` (`src/backend/shared/validate.ts:28-30`), which is
     what makes "clear the muscle group" work by submitting an empty input.
   - Impact: the diff is four components, two stylesheets, `shared.css` and two docs. Nothing under
     `src/backend/` or `src/shared/` is touched.

## Current State

```
/workouts                                  /exercises
┌──────────────────────────────────────┐   ┌────────────────────────────────────────────────┐
│ Push day        ← only this opens it │   │ Exercise │ Muscle │ Sets │ Best │ Last │      │
│ 22 Sep 2026 · today                  │   │ Squat ←── only this opens it   │ [Edit][Delete]│
│              [8 sets…] [Repeat][Del] │   │   ↳ Edit swaps the row for an inline form      │
└──────────────────────────────────────┘   └────────────────────────────────────────────────┘
            │                                                    │
            ▼                                                    ▼
/workouts/:id                              /exercises/:id
  Push day            [Edit] [Delete]        ← Exercises
  22 Sep 2026 · today                        Back Squat
  notes, read-only                           Legs · low bar, belt over 100 kg
     ↳ [Edit] toggles #editingHeader,        (no form at all — not editable from here)
       swapping the header for a form        tiles · chart · session history
       with Save and Cancel
```

So an exercise is edited in the list and cannot be edited on its page; a workout is edited on its
page and cannot be edited from the list. The two entities have no shared shape.

What both lists and both detail pages *do* share, and what this plan keeps untouched:

| Mechanism                                     | Where                                     |
| --------------------------------------------- | ----------------------------------------- |
| `data-action` click/submit delegation          | `ui/base.ts:25-39`                        |
| `formData(form)`, trimming text fields         | `ui/base.ts:107-115`                      |
| anchors routed centrally via `composedPath()`  | `app/gz-app.component.ts:21-34`           |
| `workout-id` / `exercise-id` set by the route  | `*.routes.ts:19`                          |
| refetch after mutation; no store               | every `#load()`                           |
| `maxlength` mirroring the server's `MAX_*`     | 120 / 60 / 2000                           |

## Desired End State

```
/workouts                                  /exercises
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ Push day                             │   │ Back Squat                           │
│ 22 Sep 2026 · today                  │   │ Legs · low bar, belt over 100 kg     │
│         [8 sets · 3 exercises · …]   │   │         [12 sets · 140 kg best · …]  │
│                           [Repeat]   │   │                                      │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
  ▲ the whole box is the anchor's hit       ▲ same card, same rule
    area; [Repeat] paints above it
            │                                                    │
            ▼                                                    ▼
/workouts/:id                              /exercises/:id
  Push day                   [Delete]      ← Exercises
  22 Sep 2026 · today                      Back Squat               [Delete]
  ┌─ form (always there) ─────────────┐    Legs
  │ Date [2026-09-22] Title [Push day]│    ┌─ form (always there) ─────────────┐
  │ Notes [                         ] │    │ Name [Back Squat] Muscle [Legs]   │
  │ [Save]                            │    │ Notes [low bar, belt over 100 kg] │
  └───────────────────────────────────┘    │ [Save]                            │
  totals · add a set · sets · by exercise  └───────────────────────────────────┘
                                           tiles · chart · session history
```

The card's anatomy, and why each part is where it is:

```html
<article class="open-card">        ← Pico draws the box: background, shadow, radius,
  <div class="grow">                 padding. open-card adds only what follows.
    <a class="open" href="/workouts/3">Push day</a>
        └─ ::after { position: absolute; inset: 0 }   ← the hit area, inside the anchor
    <div class="muted">22 Sep 2026 · today</div>       (open-card is position: relative,
  </div>                                                so this is its containing block)
  <span class="badge">8 sets · 3 exercises · 4,530 kg</span>
  <div class="actions">            position: relative, later in DOM order
    <button data-action="repeat">  ← paints above the overlay, takes its own click,
  </div>                             and its composedPath holds no anchor, so gz-app
</article>                           leaves it alone
```

What is Pico's and what is ours:

| Property                            | Comes from                                       |
| ----------------------------------- | ------------------------------------------------ |
| background, shadow, radius, padding | Pico's `article` (`pico.css:1992-1998`)           |
| light/dark theming of all four      | Pico's `--pico-card-*` custom properties          |
| flex layout, gap, alignment         | `.open-card`                                      |
| the link overlay and its hover      | `.open-card .open`                                |
| the buttons above the overlay       | `.open-card .actions`                             |
| the narrow-screen wrap              | `.open-card`'s media query                        |

## Abstractions and Code Reuse

Reused as they are:

- `GzElement`'s `data-action` delegation and `formData()`. Every new handler in this plan is a
  branch in an existing `handleAction`/`handleSubmit`; no component registers a listener for a
  button or a form.
- The `#draft` idea in `gz-workout-detail` — template-owned, not DOM-owned, form state — which
  decision 5 applies a second and third time under the name `#edits`.
- `shared.css`'s `.grow`, `.badge`, `.muted`, `.fields`, `.field`, `.row`, `.row-between`,
  `.stack-sm`, `button.compact`, `button.danger`.
- **Pico's `<article>` for the card box itself** — background, shadow, radius and padding, in both
  themes, from four `--pico-card-*` properties this plan never names. This is the largest piece of
  reuse in the plan and the reason `.open-card` is a handful of lines rather than the twenty
  `.workout` needed.
- The workout header form's markup (`gz-workout-detail.component.ts:269-292`) as the template for
  the exercise one: a `.fields` row, a full-width notes `<textarea>`, a `.row` with Save.
- The exercise list's confirm wording, `Delete "${name}"? Only possible while no set uses it.`,
  moved verbatim to the detail page.
- `toastError`, which surfaces the server's own message — `An exercise named "Squat" already
  exists`, or the 409 on a delete.

New:

- `article.open-card` in `src/frontend/ui/shared.css` — the flex layout, the `.open` anchor and its
  overlay, the `.actions` group that paints above it, and the narrow-screen wrap. Not the box: that
  is Pico's.

Changed:

- `src/frontend/ui/shared.css` — gains `article.open-card`.
- `src/frontend/features/workouts/gz-workout-list.component.ts`
  - the row markup — `<div class="workout">` → `<article class="open-card">`, the anchor gains
    `.open`, the `.date` div becomes `.muted`, Delete is removed.
  - `handleAction` — the `delete` branch is deleted; `load-more` and `repeat` are untouched.
- `src/frontend/features/workouts/gz-workout-list.component.css` — `.workout` and `.date` deleted;
  the file keeps `.new-form .field-notes`.
- `src/frontend/features/workouts/gz-workout-detail.component.ts`
  - `#editingHeader` and the `toggle-header` branch are deleted.
  - `#edits` added; `#headerTemplate()` always renders identity + Delete + the form.
  - `afterRender()` registers the form's `input` listener; `save-workout` clears `#edits`.
- `src/frontend/features/workouts/gz-workout-detail.component.css` — `.header-notes` removed.
- `src/frontend/features/exercises/gz-exercise-list.component.ts`
  - `#editingId`, `#editRow()`, the `edit`/`cancel`/`delete` branches and the `save` submit branch
    are deleted; `handleSubmit` is left handling `create` alone.
  - the table becomes cards.
- `src/frontend/features/exercises/gz-exercise-list.component.css` — everything but
  `.new-form .field-notes` removed.
- `src/frontend/features/exercises/gz-exercise-detail.component.ts`
  - `#edits` added; the header becomes `.row-between` with Delete; the form article is added.
  - `save-exercise` submit and `delete-exercise` action branches added.
- `src/frontend/features/exercises/gz-exercise-detail.component.css` — `td.name` removed only if the
  session-history table no longer uses it (it does: keep it).
- `src/frontend/features/stats/gz-dashboard.component.ts` — the "Recent workouts" row becomes the
  shared card (decision 9).
- `src/frontend/features/stats/gz-dashboard.component.css` — `.workout-link` deleted.
- `docs/frontend.md` — the "Links are plain `<a href>`" paragraph gains the card rule.
- `docs/styling-guidelines.md` — the nesting example moves from `.workout` to `article.open-card`,
  and the "Pico first" bullet gains `<article>` as the card by name, so the next person asking
  "does Pico have this?" finds the answer before hand-rolling a box.

Deleted outright: the inline edit row, in both its TypeScript and its CSS. It is the only editing
surface this plan removes without replacing in kind — the replacement is a whole page.

## Implementation

### Phase 1: The details form on both detail pages

Dependencies: None.

Editing moves onto the detail pages **before** the lists lose their Edit buttons, so an exercise is
editable at every commit. On its own this phase already answers "the form resides there, as well as
the current info"; Phase 2 then has nothing to take away that is not available elsewhere.

**Tasks**:

- [x] In `gz-workout-detail.component.ts`, delete `#editingHeader` and the `toggle-header` branch of
      `handleAction`, and rewrite `#headerTemplate()` to render both halves unconditionally: the
      `hgroup` with the title and date plus a Delete button, then the form. Drop the Cancel button —
      there is no longer a state to cancel back to — and drop the `.header-notes` paragraph, whose
      text is now in the form (decision 6).

      ```ts
      #headerTemplate(workout: WorkoutWithSetsDto): RawHtml {
        const edits = this.#edits ?? {
          performedOn: workout.performedOn,
          title: workout.title ?? '',
          notes: workout.notes ?? '',
        };
        return html`
          <div class="row-between">
            <hgroup>
              <h1>${workout.title ?? formatDate(workout.performedOn)}</h1>
              <p>${formatDate(workout.performedOn)} · ${relativeDay(workout.performedOn)}</p>
            </hgroup>
            <button class="danger" data-action="delete-workout">Delete</button>
          </div>
          <article>
            <form class="stack-sm" data-action="save-workout">…</form>
          </article>
        `;
      }
      ```

- [x] Add the `#edits` field to `gz-workout-detail` with the comment that earns it — that
      `render()` replaces the form's DOM and `#load()` runs after every logged set, so without this
      a half-typed title would not survive logging a set. Type it as
      `Record<string, string> | null`, which is what `formData()` returns.

      ```ts
      /**
       * What has been typed into the details form but not saved.
       *
       * The form is always on screen and every logged set re-renders the view, so
       * the template — not the DOM — has to own these values. `null` means "show
       * what the server returned", which is also what a successful save restores.
       */
      #edits: Record<string, string> | null = null;
      ```

- [x] In `afterRender()`, register the `input` listener that keeps `#edits` current. It sits beside
      the existing `select[name='exerciseId']` wiring, which is the same kind of after-render
      listener on markup the template just produced.

      ```ts
      const details = this.$<HTMLFormElement>("form[data-action='save-workout']");
      details?.addEventListener('input', () => {
        this.#edits = this.formData(details);
      });
      ```

- [x] In the `save-workout` branch, replace `this.#editingHeader = false` with `this.#edits = null`
      so the next render shows the server's normalisation — notably a cleared notes field coming
      back blank rather than as the text the user deleted.

- [x] In `gz-exercise-detail.component.ts`, add the same `#edits` field, with the same comment
      adapted to its own trigger: the metric switch calls `render()` directly
      (`handleAction('metric')`), so switching from "Estimated 1RM" to "Volume" while editing the
      notes must not discard them.

- [x] Give `gz-exercise-detail` a `#headerTemplate()` shaped like the workout's: `.row-between` with
      the `hgroup` (name, and the muscle group alone as the subtitle — the notes move into the form,
      decision 6) and a Delete button, followed by the form article.

      ```ts
      <article>
        <form class="stack-sm" data-action="save-exercise">
          <div class="fields">
            <div class="field grow">
              <label for="name">Name</label>
              <input id="name" name="name" type="text" maxlength="120" value="${edits.name}" required />
            </div>
            <div class="field">
              <label for="muscleGroup">Muscle group</label>
              <input id="muscleGroup" name="muscleGroup" type="text" maxlength="60" value="${edits.muscleGroup}" />
            </div>
          </div>
          <div class="field">
            <label for="notes">Notes</label>
            <textarea id="notes" name="notes" maxlength="2000" placeholder="Low bar, belt over 100 kg">${edits.notes}</textarea>
          </div>
          <div class="row"><button type="submit">Save</button></div>
        </form>
      </article>
      ```

      Note the notes field is a `<textarea>` here, where the list's inline row used a single-line
      `<input>`. 2000 characters never fitted on one line; the workout form already made this call.

- [x] Add `handleSubmit` to `gz-exercise-detail` — it has none today — with the single
      `save-exercise` branch. It mirrors the workout's: send all three fields, clear `#edits`,
      toast, reload. Reloading is what re-reads `progress()` and repaints the `hgroup` with the new
      name.

      ```ts
      override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
        if (action !== 'save-exercise') {
          return;
        }
        const values = this.formData(form);
        try {
          // `name` is `required`, so an empty one only arrives if the browser's
          // validation was bypassed; the API rejects it either way.
          await exerciseFacade.update(this.#id, { name: values.name ?? '', muscleGroup: values.muscleGroup, notes: values.notes });
          this.#edits = null;
          toast('Exercise updated', 'success');
          await this.#load();
        } catch (error) {
          toastError(error);
        }
      }
      ```

- [x] Widen `gz-exercise-detail`'s `handleAction` from `void` to `void | Promise<void>` and add the
      `delete-exercise` branch. Keep the list's confirm wording verbatim, and let `toastError`
      carry the 409 when a set still references the exercise — the view stays where it is, which is
      the useful outcome, because the message names the obstacle.

      ```ts
      if (action === 'delete-exercise') {
        if (this.#state.status !== 'ready' || !confirm(`Delete "${this.#state.exercise.name}"? Only possible while no set uses it.`)) {
          return;
        }
        try {
          await exerciseFacade.delete(this.#id);
          toast('Exercise deleted', 'success');
          navigate('/exercises');
        } catch (error) {
          toastError(error);
        }
      }
      ```

      This adds `navigate` and `toast` to the module's imports; `toastError` is already there.

- [x] Register the `input` listener for the exercise form in `gz-exercise-detail`'s existing
      `afterRender()`, ahead of its early `return` for the chart — that guard bails out when there
      is no `gz-chart`, which must not also skip the form.

- [x] Remove `.header-notes` from `gz-workout-detail.component.css`.

**Manual verification**:

- [ ] Open a workout with a title and notes. The form shows both. Change the title, press Save: the
      heading updates and the toast appears.
- [ ] Clear the notes and Save. They are gone after the reload, and stay gone on a refresh.
- [ ] Type a new title, and **without saving** log a set. The set appears and the typed title is
### Phase 2: One Pico card, and both lists opening on a click
- [ ] Open an exercise. Change the muscle group, switch the chart metric to Volume, and confirm the
      edit is still in the field. Save it and check `/exercises` shows the new muscle group.
- [ ] Delete an exercise that has sets: the server's 409 message toasts and the page stays. Delete
      an unused one: it lands on `/exercises` and the exercise is gone.
- [ ] Delete a workout from its page: it lands on `/workouts`.

### Phase 2: One card, and both lists opening on a click

Dependencies: Phase 1 — editing and deleting an exercise must already exist somewhere before the
list's buttons are removed.

**Tasks**:

- [x] Add `article.open-card` to `src/frontend/ui/shared.css`, under the "pieces" section beside
      `.badge` and `.empty`. Write it as what Pico does *not* give an `<article>`: the flex layout,
      the containing block for the overlay, the overlay itself, and the `.actions` group lifted
      above it. Do **not** restate background, shadow, radius or padding — those are the reason the
      element is an `<article>` at all, and repeating them would put the rule back in competition
      with Pico. Keep the two comments; they are what stops the rule being "simplified" later.

      ```css
      /* A list item that opens something. Pico's <article> is the card; this adds only
         the layout and the hit area. The whole box is the link's hit area, drawn as the
         link's own ::after so it stays a real anchor: gz-app routes it, the keyboard
         reaches it, and Ctrl-click still opens a tab. */
      article.open-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.75rem;

        & .open {
          color: inherit;
          font-weight: 600;
          text-decoration: none;

          &::after {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
          }
        }

        &:hover .open {
          color: var(--pico-primary);
        }

        /* Anything interactive has to paint above the overlay to take its own
           click. It is later in DOM order, so being positioned is enough. */
        & .actions {
          position: relative;
          display: flex;
          gap: 0.25rem;
        }

        @media (max-width: 640px) {
          flex-wrap: wrap;
        }
      }
      ```

      Two details worth checking against the running app rather than assuming. Pico gives `article`
      a `margin-bottom` (`pico.css:1993`), which `.stack > *` and `.stack-sm > *` already zero
      (`shared.css:35-38`) — so the list must stay inside a `.stack-sm`, or the gap doubles up.
      And `border-radius: inherit` on the overlay now inherits Pico's `--pico-border-radius` from
      the article rather than from a hand-set value.

      CSS keeps double quotes here (`content: ""`), per `docs/styling-guidelines.md`.

- [x] Rewrite the workout row in `gz-workout-list.component.ts`: `<div class="workout">` becomes
      `<article class="open-card">`, the anchor gains `class="open"`, the `.date` div becomes
      `class="muted"`, and the Delete button goes, leaving Repeat alone in `.actions`.

- [x] Delete the `delete` branch from `gz-workout-list`'s `handleAction`. `workoutFacade` is still
      imported for `create`; check that `toast` still is too — `repeat` uses it.

- [x] Strip `gz-workout-list.component.css` down to `.new-form .field-notes`, keeping its header
      comment adjusted to what is left.

- [x] Rewrite `gz-exercise-list.component.ts`'s `#row()` as a card of the same shape, and delete
      `#editRow()`. The badge carries what three of the dropped columns said.

      ```ts
      #card(exercise: ExerciseWithStatsDto): RawHtml {
        const subtitle = [exercise.muscleGroup, exercise.notes].filter((part) => part !== null).join(' · ');
        return html`
          <article class="open-card">
            <div class="grow">
              <a class="open" href="/exercises/${exercise.id}">${exercise.name}</a>
              ${subtitle === '' ? '' : html`<div class="muted">${subtitle}</div>`}
            </div>
            <span class="badge">
              ${plural(exercise.setCount, 'set')} ·
              ${exercise.bestWeight === null ? 'no best yet' : `${formatWeight(exercise.bestWeight)} best`} ·
              ${exercise.lastPerformedOn ? relativeDay(exercise.lastPerformedOn) : 'never done'}
            </span>
          </article>
        `;
      }
      ```

- [x] Replace the `<article><div class="overflow-auto"><table>…` block in `gz-exercise-list`'s
      `template()` with a `<div class="stack-sm">` of cards, matching how `gz-workout-list` lays its
      list out. The wrapping `<article>` and the `.overflow-auto` div both go: the cards are
      articles themselves now, and nesting them inside a panel article would read as cards within a
      card (decision 2). Keep the empty state.

- [x] Delete `#editingId` from `gz-exercise-list`, the `edit`, `cancel` and `delete` branches of
      `handleAction`, and the `save` branch of `handleSubmit`. `handleAction` is then empty and is
      removed with its `override` keyword; `handleSubmit` keeps `create` alone and can drop its
      early `return` for other actions in favour of a guard, matching `gz-workout-list:46-48`.
      Remove the imports this orphans — `ExerciseId` and `formatWeight`'s neighbours are easy to get
      wrong here, so let `bun run lint` name them rather than guessing.

- [x] Strip `gz-exercise-list.component.css` to `.new-form .field-notes`.

- [x] Bring `gz-dashboard`'s "Recent workouts" rows onto the same card (decision 9), and delete
      `.workout-link` from `gz-dashboard.component.css`. The row is a wrapping `<a>` today; it
      becomes the same article-with-an-inner-anchor as the other two lists, so all three are one
      shape. This is the one task here that touches a page the request did not name — if it is
      dropped, nothing else in the phase changes.

      ```ts
      <article class="open-card">
        <div class="grow">
          <a class="open" href="/workouts/${workout.id}">${workout.title ?? formatDate(workout.performedOn)}</a>
          <div class="muted">${relativeDay(workout.performedOn)}</div>
        </div>
        <span class="badge">${plural(workout.setCount, 'set')} · ${formatVolume(workout.totalVolume)}</span>
      </article>
      ```

      Note this also splits the title and the relative day onto two lines, where the anchor ran them
      together on one. That is what makes it the same card as the other two, and it is why the
      change is visible rather than purely internal.

- [x] Update `docs/styling-guidelines.md` twice. The nesting example at lines 9-11 names `.workout`,
      `.workout:hover`, `.workout a`, which no longer exist — rewrite it around `article.open-card`,
      `&:hover .open` and `& .actions`. And extend the "Pico first" bullet at lines 3-5 to name the
      components by element, `<article>` for a card above all, so the next person reaches for Pico's
      before writing a box of their own. That bullet is why this plan changed shape mid-flight.

- [x] Update `docs/frontend.md`'s routing paragraph (the one beginning "Links are plain
      `<a href="/…">`"): add that a list item's whole card is the anchor's hit area, drawn as the
      anchor's own `::after` in `shared.css`'s `article.open-card`, so opening stays one mechanism
      and buttons on a card sit above the overlay. Say why in one clause — a click handler would not be a link.

**Manual verification**:

- [ ] `/workouts`: click the date line of a card, then the badge, then the whitespace between them.
      Each opens the workout. Click Repeat: a new session is created and opened, with the toast
      counting its sets — and the source workout is not what is on screen.
- [ ] Ctrl-click (or middle-click) a card: a new tab opens on that workout. Hovering shows the URL.
- [ ] Tab through `/workouts` with the keyboard: each card's link takes focus with a visible ring,
      Enter opens it, and Repeat is the next stop.
- [ ] `/exercises`: the same three clicks open the exercise. No Edit or Delete button is anywhere on
      either list.
- [ ] Narrow the window below 640px: both cards wrap rather than overflow, and the badge stays
      readable.
- [ ] Toggle the theme on both lists — the card border, hover and link colour follow it, because
      every value is a `--pico-*` custom property.
- [ ] `/`, `/workouts` and `/exercises` side by side: the three lists are visibly the same card.
      The dashboard's rows still open on a click anywhere, and "See all" still reaches `/workouts`.

**Automated verification**:

- [x] `bun test` — nothing mounts a component, so the suite is a regression check on the facades,
      the router and the static routes. `static.routes.test.ts`'s "stylesheet beside every component
      module" must still pass: both stripped `.css` files stay on disk.
- [x] `bun run typecheck`
- [x] `bun run lint` — this is what catches the imports the deletions orphan, and it is the only
      thing enforcing that a component still reaches the network through a facade.
- [x] `bun run fmt:check`

## Implementation Notes

### Verified while planning

- `linkPath` rejects a click whose `defaultPrevented` is already set, is not button 0, or carries a
  modifier (`router.ts:84-90`), and `gz-app` looks for an `HTMLAnchorElement` anywhere in
  `composedPath()` (`gz-app.component.ts:21`). A click landing on `a.open::after` reports the anchor
  as its target, so it satisfies both. A click on a `<button>` inside `.actions` has no anchor in
  its path at all, so `gz-app` returns before `linkPath` is ever consulted — the button needs no
  `stopPropagation()`.
- `optionalString` turns `''` into `null` (`src/backend/shared/validate.ts:28-30`) and
  `#validateEdit` only looks at fields that are present (`exercises.facade.ts:57-69`), so submitting
  an emptied muscle group clears it rather than erroring. The always-visible form sends all three
  fields on every save, which is what the inline edit row already did.
- Every facade method this plan calls is asserted by URL and method in `workouts.facade.test.ts` and
  `exercises.facade.test.ts`. Those tests do not change, which is the check that no new endpoint was
  invented.
- `static.routes.test.ts:33-42` globs `**/gz-*.component.ts` and requires a `200 text/css` for each
  sibling stylesheet. Both files this plan empties out keep one rule, so neither may be deleted.

### Known limitations, accepted

- Text inside a card cannot be selected with the mouse; the overlay intercepts the drag. Inherent to
  decision 1, and the reason the badge holds numbers rather than anything worth copying.
- A re-render landing mid-typing keeps the text but loses focus and the caret. The add-set form has
  the same behaviour today and handles it with `#focusAfterRender` only for the case it cares about;
  this plan does not extend that to the details form.
- The dashboard's "Recent workouts" rows change appearance (decision 9) although the request named
  only `/workouts` and `/exercises`. That is deliberate and is the one scope extension in the plan;
  the alternative was leaving the app's last hand-rolled card behind.
- `gz-set-row` keeps its own inline Edit toggle for a logged set. A set is edited *within* a
  workout rather than opened on a page of its own, so "no edit button" does not reach it; it has no
  route and nothing to navigate to.
- The frontend's tests run without a DOM, so none of this is covered automatically — the overlay,
  the draft preservation and the card layout are manual checks only. That is the existing situation
  for every component in the repository, not something this plan introduces.

## References

- `docs/agents/research/2026-09-22-opening-and-creating-workouts-and-exercises.md` — the survey this
  plan acts on: every open is an anchor, every create is a `data-action`, and the five entry points
  that exist today.
- `docs/frontend.md` — features and facades, the link interception rule, why a module's URL is its
  path, and the note that nothing mounts a component in the tests.
- `docs/styling-guidelines.md` — Pico first, no CSS in JavaScript, nesting with an explicit `&`, no
  font sizes, and double quotes in CSS.
- `docs/coding-guidelines.md` — quote style and commits on `main`.
- `src/frontend/app/router.ts:83-105` — `linkPath`, the rule decision 1 has to keep satisfying.
- `src/frontend/ui/base.ts:25-39`, `:61-64`, `:107-115` — delegation, `render()`'s `innerHTML`
  assignment that decision 5 works around, and `formData()`.
- `src/backend/shared/validate.ts:18-35` — `optionalString`, and why an emptied field clears.
