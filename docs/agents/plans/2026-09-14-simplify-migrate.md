---
date: 2026-09-14T17:43:09.450830+00:00
git_commit: 7223100c1a34a0eed39ac6025a574812df8fcf82
branch: main
topic: 'Simplify migrate() in migrations.ts'
tags: [plan, db, migrations, refactor]
status: complete
---

# PLAN: Simplify migrate() in migrations.ts

`migrate()` in `src/backend/db/migrations.ts` is hard to follow. In one body it checks the ledger
against the files, works out what is pending, turns foreign keys off and back on, applies each
migration in a transaction with its own error wrapping, and keeps a list of what it applied. That
gives three levels of nesting (`try/finally` › `for` › `try/catch` › `db.transaction(...)()`) and two
exits. This plan rewrites `migrate()` as a short list of steps built on three small named helpers,
without changing behaviour.

## Acceptance Criteria

- `migrate()` reads top to bottom: read the ledger, compute pending, apply each migration with
  foreign keys off, return. There is no `try` in its body.
- The consistency check and the pending computation happen in one pass: the applied versions are
  compared with the sorted files side by side, and pending is whatever comes after them.
- Observable behaviour is unchanged: the same migrations run in the same order, with the same
  transaction boundaries, the same `foreign_key_check`, the same error messages, foreign keys ON
  after success and after failure, and no foreign-key toggle on a database that is already up to date.
- Every existing test in `migrations.test.ts` and `db.test.ts` passes without modification.
- The consistency check's "ledger row between two files" branch is covered by a new test.

## Technical Key Decisions and Tradeoffs

1. **Check the ledger by walking both lists side by side instead of using two sets.**
   - Why: the rule is "applied versions are the first files on disk, in order". Comparing
     `applied[i]` with `files[i]` checks exactly that, and pending becomes
     `files.slice(applied.length)`.
   - Impact: `assertConsistent` is replaced by `pendingMigrations`. If a database is broken in both
     ways at once (a ledger row with no file *and* an unapplied file below the highest version), the
     error reported first may now be "renumber it" where it used to be "newer than this checkout".
     Both messages stay word-for-word the same.
2. **Keep the early return for an up-to-date database.**
   - Why: the research doc lists "an up-to-date database never has foreign keys switched off" as a
     property of the runner, and keeping it costs one line.
   - Impact: `migrate()` keeps `if (pending.length === 0)` ahead of `withForeignKeysOff`.
3. **Return `pending` as `applied`.**
   - Why: any failure throws, so a normal return always means everything pending was applied. The
     `applied` array was a copy of `pending`.
   - Impact: the accumulator goes away. `onMigration` is still called after each commit.
4. **Keep the helpers private to the module.**
   - Why: nothing outside `migrations.ts` needs them, and the exports (`MIGRATIONS_DIR`,
     `schemaVersion`, `migrate` and the three types) stay as they are.
   - Impact: no caller changes. `db.ts`, `main.ts`, `scripts/migrate.ts` and `scripts/seed.ts` are
     not touched.
5. **No documentation change.**
   - Why: `docs/backend.md:136-142` describes behaviour (per-file transactions, foreign keys off for
     the run, `foreign_key_check`, refusing on disagreement), and all of it still holds.
   - Impact: only the source file and its test file change.

## Current State

```
migrate(db, options)                                    migrations.ts:118-166
  ├─ db.run(LEDGER)
  ├─ files    = discover(dir)
  ├─ previous = SELECT version, name FROM schema_migrations
  ├─ assertConsistent(files, previous, dir)             migrations.ts:96-115  (two sets, reduce, two loops)
  ├─ done = Set(previous); pending = files − done       (applied set built a second time)
  ├─ pending empty? → return { version, applied: [] }
  ├─ applied = []
  ├─ PRAGMA foreign_keys = OFF
  ├─ try
  │    for each pending
  │      try
  │        db.transaction(() => { run SQL; foreign_key_check; INSERT ledger })()
  │      catch → throw "Migration X failed and was rolled back: …"
  │      applied.push; onMigration?.()
  ├─ finally PRAGMA foreign_keys = ON
  └─ return { version: schemaVersion(db), applied }
```

## Desired End State

```
migrate(db, options)
  ├─ db.run(LEDGER)
  ├─ previous = SELECT version, name FROM schema_migrations ORDER BY version
  ├─ pending  = pendingMigrations(discover(dir), previous, dir)
  ├─ pending empty? → return { version, applied: [] }
  ├─ withForeignKeysOff(db, () =>
  │    for each pending: apply(db, migration); onMigration?.(migration))
  └─ return { version: schemaVersion(db), applied: pending }

pendingMigrations(files, applied, dir)   walk applied[i] against files[i]; throw or return files.slice(applied.length)
apply(db, migration)                     one transaction: SQL, foreign_key_check, ledger row; wraps the error
withForeignKeysOff(db, fn)               PRAGMA OFF; try fn() finally PRAGMA ON
```

```ts
export function migrate(db: DB, options: MigrateOptions = {}): MigrateResult {
  const dir = options.dir ?? MIGRATIONS_DIR;

  db.run(LEDGER);
  const previous = db.query<AppliedRow, []>('SELECT version, name FROM schema_migrations ORDER BY version').all();
  const pending = pendingMigrations(discover(dir), previous, dir);
  if (pending.length === 0) {
    return { version: schemaVersion(db), applied: [] };
  }

  withForeignKeysOff(db, () => {
    for (const migration of pending) {
      apply(db, migration);
      options.onMigration?.(migration);
    }
  });

  return { version: schemaVersion(db), applied: pending };
}
```

## Abstractions and Code Reuse

- `src/backend/db/`
  - `migrations.ts` - rewrite the internals of the runner. Exports unchanged.
    - `assertConsistent` - removed, replaced by `pendingMigrations`
    - `pendingMigrations` - new: the side-by-side check plus the pending slice. Takes over the
      invariant doc comment from `assertConsistent`
    - `apply` - new: the per-migration transaction and error wrapping, lifted from `migrate`. The
      `prepare()` rather than `query()` comment moves with it
    - `withForeignKeysOff` - new: the PRAGMA toggle and `try/finally`. The 12-step-rebuild comment
      moves with it
    - `migrate` - reduced to the step list above
    - `discover`, `schemaVersion`, `LEDGER`, `FILENAME`, `AppliedRow`, the types - unchanged
  - `migrations.test.ts` - one new test for a ledger row that falls between two files

Both `discover` and the `ORDER BY version` query return sorted lists, which the side-by-side walk
relies on. No new comments are added beyond the ones that move.

## Logging & Observability

None. The runner still does no logging, and progress is still reported through `onMigration`.

## Implementation

Dependencies: None.

Behaviour stays the same throughout, so the existing tests are the safety net. Run them before
starting to confirm the baseline is green.

**Tasks**:

- [x] Run `bun test src/backend/db` and confirm it passes before any change
- [x] In `migrations.ts`, replace `assertConsistent` with `pendingMigrations(files, applied, dir): Migration[]`:
  ```ts
  function pendingMigrations(files: Migration[], applied: AppliedRow[], dir: string): Migration[] {
    const highest = applied.at(-1)?.version ?? 0;
    for (const [i, row] of applied.entries()) {
      const file = files[i];
      if (!file || file.version > row.version) {
        throw new Error(`Database has migration ${row.version} (${row.name}) applied, but no matching file exists in ${dir} — the database is newer than this checkout`);
      }
      if (file.version < row.version) {
        throw new Error(`Migration ${basename(file.file)} is numbered at or below the highest applied version (${highest}) but has never run — renumber it above ${highest}`);
      }
    }
    return files.slice(applied.length);
  }
  ```
- [x] In `migrations.ts`, add `apply(db, migration): void`. Move the `db.transaction(...)()` body
      (read and run the file, `PRAGMA foreign_key_check` through `prepare()`, ledger insert) and its
      `catch` wrapping (`Migration <file> failed and was rolled back: <reason>`, `{ cause }`) out of `migrate`
- [x] In `migrations.ts`, add `withForeignKeysOff(db, fn: () => void): void`: set `PRAGMA foreign_keys = OFF`,
      then `try { fn(); } finally { PRAGMA foreign_keys = ON }`, carrying the existing why-comment
- [x] In `migrations.ts`, rewrite `migrate` as shown in Desired End State: drop the `done` set, the
      `applied` accumulator and both `try` blocks, and return `pending` as `applied`
- [x] In `migrations.test.ts`, add `refuses a database whose ledger has a version between two files`:
      write `001-…` and `003-…`, run, insert a ledger row `(2, 'removed-file')`, and expect `run()` to
      throw `/2 \(removed-file\)/`. This covers the `file.version > row.version` branch, which the
      existing "newer than the checkout" test (row 99, past every file) does not reach

**Automated Verification**:

- [x] `bun test src/backend/db/migrations.test.ts` passes, including the new test and every existing test unchanged
- [x] `bun test src/backend/db/db.test.ts` passes
- [x] `bun test` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-14-migration-runner.md` - how the runner is built today
- `src/backend/db/migrations.ts:92-166` - `assertConsistent` and `migrate`, the code being rewritten
- `src/backend/db/migrations.test.ts` - the runner tests that must keep passing
- `docs/backend.md:136-142` - prose description of the migration model, still accurate after the change
