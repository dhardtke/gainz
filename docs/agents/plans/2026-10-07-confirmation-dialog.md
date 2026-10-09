---
date: 2026-10-07T14:35:34.327348+00:00
git_commit: 93123d66baf9e8420e344771f68e9e4610fd81c5
branch: main
topic: 'Confirmation dialog instead of confirm()'
tags: [plan, frontend, ui, dialog, workouts, sets, exercises]
status: ready
---

# PLAN: Confirmation dialog instead of confirm()

The app asks four confirmations through the browser's native `confirm()`: deleting a workout, a set
or an exercise, and marking a workout with incomplete exercises done. The native prompt blocks the page, can't be
themed, and squeezes the incomplete exercises into one comma-joined line. This plan replaces it with
an awaitable `confirmAction()` backed by a `<gz-confirm-dialog>` built on Oat's styled `<dialog>`.

## Acceptance Criteria

- No native `confirm()` remains in `src/frontend`.
- `confirmAction({ title, message?, items?, confirmLabel, danger? })` resolves `true` on the
  confirm button and `false` on Cancel, Escape or a backdrop click, and the dialog removes itself
  from the document after closing.
- The dialog is Oat's `<dialog>`, opened with `showModal()`: the title in a `<header>` with the
  muted message under it, an optional bulleted list, then Cancel (`.outline`) and the action
  button on the right. No font sizes and no custom button colors.
- A danger dialog colors its action button with `data-variant="danger"` and focuses Cancel first.
  A non-danger dialog uses the default (primary) button and focuses that button first.
- Delete workout, delete set and delete exercise ask through the dialog with the wording below.
  Cancel sends no request.
- "Mark workout done" with incomplete exercises asks "Finish with N exercise(s) incomplete?" and
  lists each one as "<name> — x/y sets" in workout order. With every set done, it asks nothing.
- Every page still fits a 320px-wide screen with the dialog open.
- Tests cover the component and all four call sites by clicking the real dialog.
  `docs/frontend.md` and `docs/styling-guidelines.md` describe the dialog.

## Technical Key Decisions and Tradeoffs

1. **An imperative, awaitable helper:** `confirmAction()` in `ui/confirm/confirm.ts` appends one
   `<gz-confirm-dialog>` to `document.body`, opens it, and resolves when it closes.
   - Why: each call site changes by one line, as with `toast()`, and no view template has to
     carry dialog markup or state through its re-renders (a `gz-set-row` re-render would otherwise
     wipe an open dialog).
   - Impact: a new `ui/confirm/` directory beside `ui/tile/` and `ui/pagination/`. The lint
     boundaries for `src/frontend/ui/**` (`.oxlintrc.json:253-281`) already cover it.
2. **Oat draws the dialog:** a native `<dialog>` with Oat's `header` / `div` / `footer` slots
   (`node_modules/@knadh/oat/css/dialog.css`). It gets the card background, radius, shadow,
   fade/scale animation and dimmed backdrop from Oat, and the shadow root adopts Oat as every
   `GzElement` does.
   - Why: "Oat first" (`docs/styling-guidelines.md`). A hand-drawn modal would compete with Oat.
   - Impact: `gz-confirm-dialog.component.css` holds only two small fixes: a gap between the
     header and the footer when there is no body (Oat leaves none), and a flex column so a long
     list scrolls inside Oat's `85vh` cap.
3. **Dismissal and focus:** Escape cancels natively, and a click on the backdrop cancels on every
   device. The component closes the dialog on a click whose target is the `<dialog>` itself.
   That handler is the only backdrop handling: Oat's `touchstart` shim in `oat.js` listens on
   `document`, where a dialog inside a shadow root is retargeted to its host, so it never fires
   here. `closedby="any"` is avoided because Safari lacks it.
   `autofocus` goes on Cancel for danger dialogs and on the action button otherwise. The browser
   restores focus to the opener on close, except for a deleted set, whose row re-renders. The
   host is removed as soon as the dialog closes, which skips Oat's 150ms fade-out; that is
   accepted. There is no queue, since a modal dialog blocks a second click.
4. **Tests drive the real dialog:** `testing.ts` gains `openDialog()`, which returns the open
   dialog's shadow root. `confirmAnswering()` and the `confirm` stub go away.
   - Why: the feature tests then exercise what a user clicks, and `confirmAction` needs no
     injection point (ES module exports can't be reassigned).
5. **Buttons close through `data-action`, not `<form method="dialog">`:** `handleAction('confirm')`
   calls `dialog.close('confirm')` and `'cancel'` calls `dialog.close()`.
   - Why: `GzElement` already delegates `data-action` clicks. happy-dom's `HTMLDialogElement`
     implements `close(returnValue)` and the `close` event, but nothing shows it handles
     `method="dialog"` submission.

## Current State

```
click → GzElement data-action delegation → handleAction()
      → if (!confirm(message)) return        ← native, blocking, unstyled
      → facade call → toast / navigate

features/workouts/gz-workout-detail.component.ts:127  finish-workout  (#incompleteMessage, multi-line string)
features/workouts/gz-workout-detail.component.ts:141  delete-workout
features/workouts/internal/gz-set-row.component.ts:97 delete          (set)
features/exercises/gz-exercise-detail.component.ts:36 delete-exercise
```

- Only `features/workouts/gz-workout-detail.component.test.ts:489` (`confirmAnswering()`) tests
  a confirmation, by stubbing the global `confirm` through `useGlobals()`. No test covers the
  three deletes.
- happy-dom's `HTMLDialogElement` (`node_modules/happy-dom/lib/nodes/html-dialog-element/`)
  sets `open` on `showModal()`, and `close(value)` sets `returnValue` and dispatches `close`.
  It fires no `cancel` on Escape and has no top layer.
- `docs/frontend.md:165` describes the finish confirmation as a native `confirm()`, and `:568`
  uses `confirm` as the example for `useGlobals()`.

## Desired End State

```
click → handleAction()
      → if (!(await confirmAction({...}))) return
      → facade call → toast / navigate

confirmAction(options)
  └─ document.body.append(<gz-confirm-dialog>)  .options = options
       └─ shadow root (Oat adopted)
            └─ <dialog aria-labelledby aria-describedby>  showModal() in afterRender
                 ├─ header: h2 title, p message
                 ├─ div > ul  items (only when given)
                 └─ footer: [Cancel .outline] [confirmLabel (danger?)]
  close event → resolve(returnValue === 'confirm') → host.remove()
```

The four dialogs:

```
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ Delete workout?                      │   │ Finish with 2 exercises incomplete?  │
│ All of its sets are deleted too.     │   │                                      │
│ This cannot be undone.               │   │  • Bench Press — 0/2 sets            │
│                                      │   │  • Back Squat — 0/1 sets             │
│            [ Cancel ] [▓ Delete ▓]   │   │                                      │
└──────────────────────────────────────┘   │   [ Cancel ] [▓ Mark workout done ▓] │
          danger, focus on Cancel           └──────────────────────────────────────┘
                                                  primary, focus on the action
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ Delete set?                          │   │ Delete "Bench Press"?                │
│ 80 kg × 5                            │   │ Only possible while no set uses it.  │
│                                      │   │                                      │
│            [ Cancel ] [▓ Delete ▓]   │   │            [ Cancel ] [▓ Delete ▓]   │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
          danger, focus on Cancel                   danger, focus on Cancel
```

| Call site        | title                                          | message                                                   | items                       | confirmLabel        | danger |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------- | --------------------------- | ------------------- | ------ |
| delete-workout   | `Delete workout?`                              | `All of its sets are deleted too. This cannot be undone.` | —                           | `Delete`            | yes    |
| delete (set)     | `Delete set?`                                  | `` `${formatNumber(set.weight)} ${UNIT} × ${set.reps}` `` | —                           | `Delete`            | yes    |
| delete-exercise  | `` `Delete "${exercise.name}"?` ``             | `Only possible while no set uses it.`                     | —                           | `Delete`            | yes    |
| finish-workout   | `` `Finish with ${plural(n, 'exercise')} incomplete?` `` | —                                               | `` `${name} — ${done}/${total} sets` `` | `Mark workout done` | no     |

## Abstractions and Code Reuse

- `src/frontend/ui/confirm/` (new)
  - `gz-confirm-dialog.component.ts` - `GzConfirmDialogComponent extends GzElement`. It holds an
    `options` property set before connecting, renders the dialog with `html`, calls `showModal()`
    in `afterRender`, handles the `confirm`/`cancel` actions and a backdrop click, and on `close`
    dispatches its answer and removes itself. Ends with `await define('gz-confirm-dialog', …)`.
  - `gz-confirm-dialog.component.css` - the header-to-footer gap when there is no list, and a
    flex column so a long list scrolls instead of pushing the footer out of view.
  - `confirm.ts` - `confirmAction(options): Promise<boolean>`, re-exporting the `ConfirmOptions` type.
    The runtime import runs one way only, from `confirm.ts` to the component.
  - `gz-confirm-dialog.component.test.ts` - component and helper tests.
- `src/frontend/testing.ts` - `openDialog(): ShadowRoot`.
- `src/frontend/features/workouts/gz-workout-detail.component.ts` - `handleAction` for
  `finish-workout` and `delete-workout`; `#incompleteMessage` becomes `#incompleteItems` (`string[]`).
- `src/frontend/features/workouts/internal/gz-set-row.component.ts` - `handleAction('delete')`.
- `src/frontend/features/exercises/gz-exercise-detail.component.ts` - `handleAction('delete-exercise')`.
- Reused: `GzElement` (shadow root with Oat adopted, `data-action` delegation, `render`/`afterRender`),
  `html` escaping, `plural`, `formatNumber`, `UNIT`, `find`/`shadow`/`testId`/`settle`/`useFetch`.

## Logging & Observability

None. The dialog makes no requests, and failures after a confirmation keep toasting through `toastError()`.

## Implementation

### Phase 1: Dialog component and "Delete workout"

Dependencies: None

Build `confirmAction()` and `<gz-confirm-dialog>` with tests, add `openDialog()`, switch "Delete
workout" to the dialog, and document the new `ui/` piece.

**Tasks**:

- [ ] Create `src/frontend/ui/confirm/confirm.ts`. `ConfirmOptions` is declared in the component
      module (below) and re-exported here with `export type { ConfirmOptions }`, so the component
      never imports `confirm.ts` and no cycle forms around its top-level `await define`:
  ```ts
  export function confirmAction(options: ConfirmOptions): Promise<boolean> {
    const dialog = document.createElement('gz-confirm-dialog') as GzConfirmDialogComponent;
    dialog.options = options;
    const answer = new Promise<boolean>((resolve) => dialog.addEventListener(CONFIRM_CLOSED_EVENT, (event) => resolve(…detail === true), { once: true }));
    document.body.append(dialog);
    return answer;
  }
  ```
  Import the component module statically so `define()` has run. Use a typed `instanceof` or
  `CustomEvent` guard instead of the assertion if lint asks for one, following the pattern in `testing.ts`'s `mount()`.
- [ ] Create `src/frontend/ui/confirm/gz-confirm-dialog.component.ts`:
  - `export interface ConfirmOptions { title: string; message?: string; items?: string[]; confirmLabel: string; danger?: boolean }`
  - `options: ConfirmOptions | undefined`, read by `template()`, which renders nothing without it
  - template:
    ```html
    <dialog aria-labelledby="title" aria-describedby="message" data-testid="dialog">
      <header>
        <h2 id="title" data-testid="title">${title}</h2>
        ${message ? <p id="message" data-testid="message">${message}</p> : ''}
      </header>
      ${items?.length ? <div><ul data-testid="items">${items.map(<li>…</li>)}</ul></div> : ''}
      <footer>
        <button class="outline" data-action="cancel" data-testid="cancel" ${danger ? 'autofocus' : ''}>Cancel</button>
        <button ${danger ? 'data-variant="danger"' : ''} data-action="confirm" data-testid="confirm" ${danger ? '' : 'autofocus'}>${confirmLabel}</button>
      </footer>
    </dialog>
    ```
    Leave out `aria-describedby` when there is no message.
  - `afterRender()`: find the `<dialog>`, then add a `click` listener that calls `dialog.close()`
    when `event.target === dialog` (the backdrop) and a `close` listener that emits
    `CONFIRM_CLOSED_EVENT` with `dialog.returnValue === 'confirm'` and then `this.remove()`.
    Call `dialog.showModal()` last.
  - `handleAction('confirm')` → `dialog.close('confirm')`; `handleAction('cancel')` → `dialog.close()`.
  - Export `CONFIRM_CLOSED_EVENT` (`'confirm-closed'`). Dispatch it on the host with
    `this.dispatchEvent(new CustomEvent(CONFIRM_CLOSED_EVENT, { detail }))` rather than
    `this.emit()`, which always bubbles and is composed, because only `confirmAction` listens.
  - Listeners attach to the `<dialog>`, which every `render()` recreates through `innerHTML`, so
    they never pile up.
  - End with `await define('gz-confirm-dialog', GzConfirmDialogComponent, import.meta.url);`
- [ ] Create `src/frontend/ui/confirm/gz-confirm-dialog.component.css`. Oat zeroes the header's
      bottom padding and the footer's top padding, so with no list the buttons would touch the
      text:
  Oat also caps the dialog at `max-height: 85vh` with `overflow: hidden`, but it isn't a flex
  column, so a long list would push the footer out of view instead of scrolling:
  ```css
  dialog {
    &[open] {
      display: flex;
      flex-direction: column;
    }
    & > div {
      min-height: 0;
    }
    & > header + footer {
      padding-block-start: var(--space-6);
    }
  }
  ```
  Add nothing else unless the 320px check below shows a need.
- [ ] `src/frontend/testing.ts`: add `openDialog()`, which finds the `gz-confirm-dialog` in
      `document.body` (failing through `find()`), checks that its `<dialog>` is `open`, and returns
      its shadow root. happy-dom's `showModal()` and `close()` act synchronously (a browser fires
      `close` a task later), so a test calls `openDialog()` right after the `.click()` that opens
      it and awaits `settle()` only for the requests that follow an answer.
- [ ] `src/frontend/ui/confirm/gz-confirm-dialog.component.test.ts` (`useDom()`, `await import('./confirm.ts')` in `beforeAll`):
  - [ ] renders the title, message and items. A dialog without a message has no `message`
        element, and one without items has no `items` element.
  - [ ] the dialog is open after `confirmAction()`
  - [ ] a danger dialog's confirm button has `data-variant="danger"` and Cancel carries
        `autofocus`. A non-danger dialog's confirm button has no variant and carries `autofocus` itself.
  - [ ] clicking confirm resolves `true`, and clicking Cancel resolves `false`
  - [ ] a click on the `<dialog>` itself (the backdrop) resolves `false`, and a click on its
        header does not close it
  - [ ] closing the dialog without a value, as Escape does, resolves `false`
  - [ ] after any answer, no `gz-confirm-dialog` is left in `document.body`
  - [ ] HTML in the title, message and items is escaped
- [ ] `gz-workout-detail.component.ts`: replace the `delete-workout` guard with
  ```ts
  if (action !== 'delete-workout') return;
  if (!(await confirmAction({ title: 'Delete workout?', message: 'All of its sets are deleted too. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
  ```
- [ ] `gz-workout-detail.component.test.ts`: add
  - [ ] "Delete workout" opens a danger dialog titled "Delete workout?". Cancel sends no
        `DELETE /api/workouts/3`.
  - [ ] Delete sends `DELETE /api/workouts/3` and toasts "Workout deleted"
- [ ] `docs/frontend.md`:
  - [ ] tree (line 16): add `confirm/` to the `ui/` entries
  - [ ] the `ui/` paragraph: describe `confirm/`, whose `confirmAction()` opens `gz-confirm-dialog`
        (Oat's `<dialog>`, modal) and resolves `true` only for its action button. Cancel, Escape
        and a backdrop click resolve `false`, and the dialog removes itself after closing.
  - [ ] the testing section: `openDialog()` returns the open dialog's shadow root, so a test
        clicks its `confirm` or `cancel` like a user
- [ ] `docs/styling-guidelines.md`, "Oat first" list: add "a confirmation is `confirmAction()` from
      `ui/confirm/confirm.ts`, Oat's `<dialog>`, never the native `confirm()`"

**Automated Verification**:

- [ ] `bun test --parallel src/frontend/ui/confirm` passes
- [ ] `bun test --parallel src/frontend/features/workouts/gz-workout-detail.component.test.ts` passes
- [ ] `bun test --parallel` passes. `static.routes.test.ts` finds the new `.css`, and `src/scripts/build.test.ts` still passes.
- [ ] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

**Manual Verification**:

- [ ] `bun run start:dev`, open a workout, "Details & notes" → "Delete workout". The dialog fades
      in over a dimmed page with Cancel focused, in both light and dark themes.
- [ ] Escape, a backdrop click, and Cancel each close it without deleting. Delete deletes and
      returns to `/workouts`.
- [ ] At 320px width, the dialog fits with its buttons on screen and the page doesn't scroll sideways.
- [ ] In a short window (around 400px tall), the dialog stays within the viewport with its footer visible.

### Phase 2: Remaining confirmations

Dependencies: Phase 1

Move "Mark workout done", set delete and exercise delete onto the dialog, rewrite the finish
tests, and remove every mention of the native `confirm()`.

**Tasks**:

- [ ] `gz-workout-detail.component.ts`: replace `#incompleteMessage` with `#incompleteItems(exercises): string[]`
      returning `` `${group.exerciseName} — ${done}/${group.sets.length} sets` `` for each
      incomplete group in workout order. `finish-workout` then asks only when the list is non-empty:
  ```ts
  const items = this.data ? this.#incompleteItems(this.data.workout.exercises) : [];
  if (items.length > 0 && !(await confirmAction({ title: `Finish with ${plural(items.length, 'exercise')} incomplete?`, items, confirmLabel: 'Mark workout done' }))) return;
  ```
- [ ] `gz-workout-detail.component.test.ts`: delete `confirmAnswering()`, and the `useGlobals()`
      import and `stub` if nothing else uses them. Rewrite the finish tests against `openDialog()`:
  - [ ] all sets done: no `gz-confirm-dialog` appears, and the PATCH goes out (as today)
  - [ ] incomplete exercises: the title is "Finish with 2 exercises incomplete?", the items are
        `['Bench Press — 0/2 sets', 'Back Squat — 0/1 sets']`, there is no danger variant, and
        "Mark workout done" sends `{ done: true }`
  - [ ] Cancel sends nothing and doesn't reload
  - [ ] only the incomplete exercises are listed, and one is in the singular: "Finish with 1 exercise
        incomplete?" with `['Bench Press — 1/2 sets']`
  - [ ] reopen asks nothing (no `gz-confirm-dialog`)
  - [ ] a failed finish, confirmed through the dialog, still toasts and doesn't reload
- [ ] `gz-set-row.component.ts`: replace the `confirm()` at line 97 with
      `confirmAction({ title: 'Delete set?', message: `${formatNumber(set.weight)} ${UNIT} × ${set.reps}`, confirmLabel: 'Delete', danger: true })`.
- [ ] `gz-set-row.component.test.ts` (add `useFetch()`/`useToasts()` if the file lacks them):
  - [ ] × opens "Delete set?" with the message "60 kg × 5" (the `set()` fixture's defaults).
        Cancel sends no `DELETE /api/sets/:id` and emits no `sets-changed`.
  - [ ] Delete sends `DELETE /api/sets/:id`, toasts "Set deleted" and emits `sets-changed`
- [ ] `gz-exercise-detail.component.ts`: split the guard so that a non-`delete-exercise` action or
      a missing exercise returns first, then ask
      `confirmAction({ title: `Delete "${exercise.name}"?`, message: 'Only possible while no set uses it.', confirmLabel: 'Delete', danger: true })`.
- [ ] `gz-exercise-detail.component.test.ts`:
  - [ ] "Delete exercise" opens a danger dialog with the exercise's name in the title. Cancel
        sends no `DELETE /api/exercises/:id`.
  - [ ] Delete sends it and toasts "Exercise deleted"
  - [ ] a refused delete (409 because a set uses it) toasts the API's message
- [ ] `docs/frontend.md`:
  - [ ] finish confirmation (around line 165): it asks through the confirmation dialog, which
        lists each incomplete exercise as "<name> — x/y sets" in the workout's order. Cancel sends
        nothing, and with every set done it asks nothing.
  - [ ] `useGlobals()` (around line 568): drop the `confirm` example and keep the general
        description
  - [ ] search the doc for any other `confirm()` mention and update it

**Automated Verification**:

- [ ] `bun test --parallel src/frontend/features` passes
- [ ] `bun test --parallel` passes
- [ ] `git grep -nE "\bconfirm\(" -- src/frontend` finds nothing
- [ ] `git grep -nE "native .confirm|confirm\(\)|.confirm., for one" -- docs/frontend.md docs/styling-guidelines.md`
      finds only the styling guideline's "never the native `confirm()`"
- [ ] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

**Manual Verification**:

- [ ] With many incomplete exercises in a short window, the list scrolls and the buttons stay visible.
- [ ] On a workout with unchecked sets, "Mark workout done" shows the bulleted list with the
      primary button focused, and Enter marks the workout done.
- [ ] A set's × shows "Delete set?" with its weight and reps. Cancel keeps it, and Delete removes it.
- [ ] Deleting an exercise still in use shows the dialog, then the error toast after Delete. An
      unused one is deleted, and the page returns to `/exercises`.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- Oat dialog styles: `node_modules/@knadh/oat/css/dialog.css`, with the touch backdrop shim in `node_modules/@knadh/oat/js/base.js`
- happy-dom dialog: `node_modules/happy-dom/lib/nodes/html-dialog-element/HTMLDialogElement.js`
- Previous plan using `confirm()`: `docs/agents/plans/2026-10-07-mark-workouts-as-done.md`
- `docs/frontend.md`, `docs/styling-guidelines.md`
