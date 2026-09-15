---
date: 2026-09-15T20:49:44.173984+00:00
git_commit: 167d91a5e54de5151dc6637b0ec16e1ccf8cc513
branch: main
topic: 'Enforce the override modifier'
tags: [plan, typescript, tsconfig, frontend, components, coding-guidelines]
status: complete
---

# PLAN: Enforce the override modifier

Make the `override` modifier mandatory on every class member that overrides a base-class member,
and have `bun run typecheck` enforce it.

The motivating risk is `GzElement` (`src/frontend/ui/base.ts`): its hooks `afterRender`,
`handleAction` and `handleSubmit` are empty defaults. A component that misspells one, or a rename
in `base.ts`, leaves the component's method as an unrelated new member that never runs, and
nothing reports it. With `noImplicitOverride`, an `override` on a member that overrides nothing
is a compile error, and a missing `override` is one too.

## Acceptance Criteria

- `tsconfig.json` sets `"noImplicitOverride": true`.
- Every member that overrides a base-class member carries `override` — today the 41 sites across
  the 13 `GzElement` components listed below — and `bun run typecheck` passes.
- An overriding member without `override`, or an `override` on a member that overrides nothing,
  fails `bun run typecheck`.
- The served frontend keeps working: `Bun.Transpiler` strips `override`, and the existing
  transpile and static route tests still pass.
- `docs/coding-guidelines.md` states the rule and why it exists.

## Technical Key Decisions and Tradeoffs

1. **Enforcement:** the compiler flag `noImplicitOverride`, not a lint rule.
   - Why: it is TypeScript's own check, it catches both directions (missing and stray
     `override`), and oxlint offers no equivalent rule.
   - Impact: `bun run typecheck` is the gate; `.oxlintrc.json` is untouched.
2. **Migration:** the flag and all 41 `override` modifiers land together in one commit.
   - Why: `bun run typecheck` is never red on `main`.
   - Impact: a single phase.
3. **Documentation:** one sentence in `docs/coding-guidelines.md`; `docs/frontend.md` stays as is.
   - Why: the rule is a language-wide convention, not a frontend-specific one.
   - Impact: no index change in `AGENTS.md`/`CLAUDE.md`, since no document is added.

## Current State

`tsconfig.json` is `strict` with `noUncheckedIndexedAccess` and `noFallthroughCasesInSwitch`, but
not `noImplicitOverride`. No file in `src/` uses `override`.

```
HTMLElement
 └─ GzElement  (src/frontend/ui/base.ts:15)
     │  connectedCallback, disconnectedCallback, template, render, afterRender,
     │  handleAction, handleSubmit, $, $$, emit, formData
     └─ 13 components, overriding connectedCallback / disconnectedCallback /
        afterRender / handleAction / handleSubmit / template without `override`

Error
 ├─ HttpError (src/backend/http/errors.ts:5)   overrides nothing
 └─ ApiError  (src/frontend/http/errors.ts:1)  overrides nothing
```

`bunx tsc --noEmit --noImplicitOverride`, run against commit `167d91a`, reports 41 × TS4114
("This member must have an 'override' modifier because it overrides a member in the base class
'GzElement'"), all in frontend components; the backend reports none.

The frontend has no build step: `src/backend/features/static/internal/transpile.ts:13` runs each
module through `new Bun.Transpiler({ loader: 'ts', target: 'browser' })`, which only erases types.
Verified during planning: it turns `override m(): void {}` and `override get x()` into plain `m()`
and `get x()`.

## Desired End State

```
tsconfig.json  "noImplicitOverride": true

class GzToastComponent extends GzElement {
  override connectedCallback(): void { … super.connectedCallback(); }
  override disconnectedCallback(): void { … }
  #add(…) / #dismiss(…)                  // own members, no override
  override handleAction(action: string, element: HTMLElement): void { … }
  override template(): RawHtml { … }
}
```

Async overrides are written `override async` — the reverse order is TS1029 ("'override' modifier
must precede 'async' modifier"), verified with tsc during planning.

## Abstractions and Code Reuse

No new abstractions. The change is a compiler option, a keyword on existing members, and a
sentence of documentation.

- `tsconfig.json` - add `"noImplicitOverride": true` to `compilerOptions`
- `docs/coding-guidelines.md` - one sentence stating the rule
- `src/frontend/app/`
  - `gz-app.component.ts` - `connectedCallback` (37), `disconnectedCallback` (44), `afterRender` (49), `template` (108)
  - `gz-header.component.ts` - `connectedCallback` (12), `disconnectedCallback` (19), `afterRender` (25), `template` (49)
  - `gz-theme-toggle.component.ts` - `connectedCallback` (10), `disconnectedCallback` (19), `handleAction` (36), `template` (42)
- `src/frontend/features/exercises/`
  - `gz-exercise-detail.component.ts` - `connectedCallback` (79), `handleAction` (96), `afterRender` (107), `template` (189)
  - `gz-exercise-list.component.ts` - `connectedCallback` (19), `async handleSubmit` (34), `async handleAction` (71), `template` (145)
  - `internal/gz-chart.component.ts` - `template` (98)
- `src/frontend/features/stats/`
  - `gz-dashboard.component.ts` - `connectedCallback` (20), `async handleAction` (36), `template` (48)
- `src/frontend/features/workouts/`
  - `gz-workout-detail.component.ts` - `connectedCallback` (84), `async handleAction` (110), `async handleSubmit` (155), `afterRender` (203), `template` (359)
  - `gz-workout-list.component.ts` - `connectedCallback` (28), `async handleSubmit` (45), `async handleAction` (64), `template` (127)
  - `internal/gz-set-row.component.ts` - `async handleAction` (39), `async handleSubmit` (88), `template` (136)
- `src/frontend/ui/`
  - `gz-tile.component.ts` - `template` (15)
  - `gz-toast.component.ts` - `connectedCallback` (37), `disconnectedCallback` (45), `handleAction` (74), `template` (80)

Line numbers are as of commit `167d91a`; the compiler output is the authority if they drift.

## Logging & Observability

None.

## Implementation

Dependencies: None.

Turn on the flag, satisfy it everywhere, and record the convention.

**Tasks**:

- [x] `tsconfig.json`: add `"noImplicitOverride": true` to `compilerOptions`, after
      `"noFallthroughCasesInSwitch": true`.
- [x] Run `bun run typecheck` and confirm it reports exactly the 41 TS4114 errors listed above,
      and nothing else.
- [x] `src/frontend/app/`: add `override` to the flagged members of `gz-app.component.ts`,
      `gz-header.component.ts` and `gz-theme-toggle.component.ts`.
- [x] `src/frontend/features/exercises/`: add `override` to the flagged members of
      `gz-exercise-detail.component.ts`, `gz-exercise-list.component.ts` and
      `internal/gz-chart.component.ts`, writing `override async` for the async handlers.
- [x] `src/frontend/features/stats/gz-dashboard.component.ts`: add `override` to the flagged
      members (`override async handleAction`).
- [x] `src/frontend/features/workouts/`: add `override` to the flagged members of
      `gz-workout-detail.component.ts`, `gz-workout-list.component.ts` and
      `internal/gz-set-row.component.ts`, writing `override async` for the async handlers.
- [x] `src/frontend/ui/`: add `override` to the flagged members of `gz-tile.component.ts` and
      `gz-toast.component.ts`.
- [x] `docs/coding-guidelines.md`: after the quote-style line, add a paragraph along the lines of:
      "A member that overrides one from its base class is marked `override`. `noImplicitOverride`
      makes `bun run typecheck` enforce it both ways, so a renamed or misspelled `GzElement` hook
      fails the check instead of silently never running."

**Automated Verification**:

- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `bun test` passes, including
      `src/backend/features/static/internal/transpile.test.ts` and
      `src/backend/features/static/static.routes.test.ts`.
- [x] `(Get-ChildItem src -Recurse -Filter *.ts | Select-String '\boverride (async )?\w+\(').Count`
      is 41, spread across the 13 component files.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- The 41 `override` sites span 12 component files, not 13: the file list above names 12, and the
  "13" in the acceptance criteria and verification step was a miscount. Nothing was missed — typecheck
  reported exactly the 41 listed sites and now passes.

## References

- TypeScript `noImplicitOverride`: https://www.typescriptlang.org/tsconfig/#noImplicitOverride
- `src/frontend/ui/base.ts` - `GzElement`, the base class all flagged members override
- `src/backend/features/static/internal/transpile.ts` - the type-erasing transpiler serving the frontend
- `docs/frontend.md:147-148` - typecheck as the only gate for type errors
- `docs/coding-guidelines.md` - where the rule is recorded
