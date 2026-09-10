---
date: 2026-09-10T20:35:54+00:00
git_commit: 8a44fb937757987599a54893a8138f64d39e18b5
branch: main
topic: "Split backend/src/server.ts into main / server / static / paths"
tags: [plan, server, static-files, entry-point, bun-serve]
status: complete
---

# PLAN: Split `backend/src/server.ts` into four files

`backend/src/server.ts` is 145 lines carrying three unrelated concerns: static file serving,
the `Bun.serve` option assembly, and the process entry point. This plan separates them into
four files — `main.ts`, `server.ts`, `static.ts`, `paths.ts` — so each matches the
one-concern-per-file rule `docs/backend.md:3` already claims for the backend, and so the
startup sequence lives in a short `main.ts` of its own.

The split changes no behavior. A second, smaller phase closes the three Open Questions raised
by `docs/agents/research/2026-09-10-server-and-src-layout.md`, two of which were measured
during planning and turned out to need documentation rather than code.

## Acceptance Criteria

- `backend/src/main.ts` holds the startup sequence only: a named `main()` behind
  `if (import.meta.main)`, mirroring the shape of `backend/src/migrate.ts`.
- `backend/src/server.ts` exports `serveOptions` and declares `GainzServeOptions`, and holds
  nothing else. It remains the module `backend/test/helpers/server.ts:7` imports, unchanged.
- `backend/src/static.ts` holds `serveStatic`.
- `backend/src/paths.ts` holds `REPO_ROOT`, `FRONTEND_DIR`, `VENDOR_FILES`,
  `resolveVendorPath` and `resolveStaticPath`.
- No observable behavior changes: identical status codes, headers, log lines and shutdown
  sequence. All 52 existing tests pass with no assertion edited.
- `package.json`'s `start`, `start:dev` and `module` all point at `backend/src/main.ts`.
- The `Bun.serve` `error` hook is covered by a test; today nothing reaches it.
- `README.md` and `docs/backend.md` describe the four-file layout, and record that static
  `Content-Type` comes from Bun's own MIME database and that HEAD bodies are stripped by Bun,
  each with the evidence behind it.

## Technical Key Decisions and Tradeoffs

1. **Four files, not two:** `main.ts` / `server.ts` / `static.ts` / `paths.ts`.
   - Why: `docs/backend.md:3` states one concern per file, and `server.ts` held three. Two
     files would leave static serving and option assembly sharing a module.
   - Impact: `static.ts` imports its helpers from `paths.ts`; `server.ts` shrinks to roughly
     20 lines and keeps the import path the test helper already uses.

2. **`main()` behind `import.meta.main`, not bare top-level statements.**
   - Why: `backend/src/migrate.ts:9-25` is the established entry-point idiom here — a named
     `main()` plus a guard — and it keeps the module import-safe.
   - Impact: `main.ts` ends with `if (import.meta.main) { main(); }`. `main` is not exported,
     matching `migrate.ts`.

3. **The move changes no behavior; the existing suite is the proof.**
   - Why: a refactor that also changes semantics cannot be certified by its own test suite.
     The baseline is 52 pass / 0 fail / 139 `expect()` calls across 6 files.
   - Impact: tempting cleanups are explicitly out of scope — forcing `server.stop(true)`,
     dropping `process.exit(0)`, and reordering the shutdown steps all stay as they are.

4. **No explicit `Content-Type` map and no HEAD handling — documented, not coded.**
   - Why: measured on Bun 1.4.2 during planning. `Bun.file()` resolves `.svg` →
     `image/svg+xml`, `.woff2` → `font/woff2`, `.png` → `image/png`, `.webp` → `image/webp`,
     `.csv` → `text/csv`, `.md` → `text/markdown`, and an extensionless file →
     `application/octet-stream`; `new Response(file)` carries that value through. A
     hand-written map in `static.ts` would be a maintained subset of a complete MIME database.
     A HEAD request returned `status=200`, `bodyChars=0`, `content-length=11` with custom
     headers intact, so Bun strips the body itself.
   - Impact: a comment in `static.ts` and a paragraph in `docs/backend.md`. No new code, and
     `frontend/` currently holds only `.css` (13), `.html` (1) and `.ts` (19) anyway. A `.ts`
     file is passed to `Bun.file` for the `.exists()` check at `server.ts:82`, but never
     reaches `new Response(file)` — the `.ts` branch at `:85` hands off to `transpileModule`
     first — so Bun's inference never applies to it.

5. **The `error` hook gets a direct test rather than an end-to-end one.**
   - Why: every route handler is already wrapped — `guardAll` for the method maps, the
     singular `guard` for the `/api/*` catch-all at `routes/meta.routes.ts:17` — so no request
     can reach the hook through the route table, and `serveStatic` has no throwing path to
     trigger on demand. Bun's types confirm the hook fires when a `fetch` or `routes` handler throws
     (`bun-types/serve.d.ts:784`, `:1340-1357`), so what is untested here is our wiring, not
     Bun's dispatch.
   - Impact: one test calling `serveOptions(repo).error(...)` and asserting it renders an
     `HttpError` exactly as `guardAll` would.

## Current State

```
backend/src/server.ts  (145 lines, 4.4 KB)
|
|-- [A] STATIC SERVING                          :9-100
|      REPO_ROOT / FRONTEND_DIR                 :9-10
|      VENDOR_FILES + resolveVendorPath         :12-32
|      resolveStaticPath  (escape guard)        :34-53
|      serveStatic                              :55-100
|
|-- [B] OPTION ASSEMBLY   <- the only export    :102-120
|      interface GainzServeOptions              :107-111
|      export function serveOptions(repo)       :114-120
|
`-- [C] PROCESS ENTRY POINT                     :122-145
       if (import.meta.main) { openDatabase, new Repo, port,
                               Bun.serve, 2 logs, SIGINT/SIGTERM shutdown }
```

`[C]` calls `[B]`; `[B]` references `[A]` only as the value of `fetch`. The single importer
anywhere in the repository is `backend/test/helpers/server.ts:7`, which takes `serveOptions`
and nothing else. Nothing imports `[A]` or `[C]`.

The file path is named in eight places outside itself: `package.json:7,9,10`,
`README.md:95,232`, `docs/backend.md:7,51`, and the traversal assertion at
`backend/test/static.api.test.ts:101`. `docs/backend.md:41` mentions
`backend/test/helpers/server.ts`, a different file, and needs no edit.

## Desired End State

```
backend/src/
  main.ts     ~30  ENTRY. openDatabase -> Repo -> Bun.serve -> logs -> signals
    |               imports: basename (node:path), DEFAULT_DB_PATH + openDatabase
    |                        (./db), Repo as a VALUE (./repo), serveOptions (./server)
    v
  server.ts   ~22  serveOptions(repo) -> { routes, fetch, error }
    |               interface GainzServeOptions
    |               imports: serveStatic (./static), apiRoutes (./routes),
    |                        errorResponse (./http), type Repo (./repo)
    |
    +--> routes.ts    apiRoutes(repo)      (unchanged)
    +--> http.ts      errorResponse        (unchanged)
    |
    v
  static.ts   ~50  serveStatic(req): vendor -> resolve -> .ts -> file -> SPA
    |               imports: extname + resolve (node:path), transpileModule
    |                        (./transpile), and from ./paths:
    |
    +--> transpile.ts transpileModule      (unchanged)
    |
    v  FRONTEND_DIR, resolveStaticPath, resolveVendorPath
  paths.ts    ~48  REPO_ROOT, FRONTEND_DIR, VENDOR_FILES,
                   resolveVendorPath, resolveStaticPath
```

A single acyclic chain, `main -> server -> static -> paths`, with no module importing back up
it. `backend/test/helpers/server.ts` continues to import `serveOptions` from `../../src/server`
with no edit.

## Abstractions and Code Reuse

Every function moves verbatim. No new abstraction is introduced, and no existing one changes
shape — `serveOptions`, `serveStatic`, `resolveStaticPath` and `resolveVendorPath` keep their
current signatures and bodies.

- `backend/src/`
  - `paths.ts` — **new**. Filesystem and URL-to-path resolution for the static half.
    - `REPO_ROOT`, `FRONTEND_DIR` — moved from `server.ts:9-10`. `FRONTEND_DIR` becomes an
      export because `serveStatic` needs it for the `index.html` fallback; `REPO_ROOT` stays
      module-private, used only by `resolveVendorPath`.
    - `VENDOR_FILES` — moved from `server.ts:18-20`, stays module-private.
    - `resolveVendorPath`, `resolveStaticPath` — moved verbatim, both exported.
  - `static.ts` — **new**. The `fetch` fallback.
    - `serveStatic` — moved verbatim from `server.ts:55-100`, exported.
  - `server.ts` — reduced to the assembly seam.
    - `GainzServeOptions` — kept, with its existing comment.
    - `serveOptions` — kept, unchanged body.
    - `Repo` import narrows to `import type`, matching `routes/*.routes.ts:2`, since only the
      type is used here. The value `Repo` is needed in `main.ts` instead.
  - `main.ts` — **new**. The process entry point.
    - `main()` — the body of the current `if (import.meta.main)` block, unexported.
  - `migrate.ts`, `seed.ts`, `db.ts`, `http.ts`, `routes.ts`, `transpile.ts`, `validate.ts`,
    `repo/`, `routes/` — untouched.
- `backend/test/`
  - `helpers/server.ts` — untouched. Its `serveOptions` import path stays valid.
  - `static.api.test.ts` — untouched. Line 101 asserts `/%2e%2e/backend/src/server.ts` is
    refused; `server.ts` still exists, and what the test covers is the traversal guard rather
    than that particular file.
  - `meta.api.test.ts` — gains the error-hook test in Phase 2.

## Logging & Observability

No log line changes. `main.ts` reproduces the existing output exactly:

```
applied 001-initial-schema      <- only when a migration actually runs
gainz is lifting on http://localhost:3000/
  database: data/gainz.sqlite
```

The per-migration line is printed by the `onMigration` callback passed to `openDatabase`, and
keeps using `basename(migration.file, ".sql")`. It appears only when there is something to
apply — against an existing `data/gainz.sqlite` that already holds
`001-initial-schema`, a normal start prints **two** lines, not three. Comparing all three
requires a fresh database.

## Implementation

### Phase 1: Split the file and repoint the entry

Dependencies: None.

Move the three concerns into their own modules and make `main.ts` the process entry point,
without changing a single observable behavior. The existing suite is the verification: if all
52 tests still pass with no assertion edited, nothing moved wrong.

**Tasks**:

- [x] Create `backend/src/paths.ts` with `REPO_ROOT`, `FRONTEND_DIR`, `VENDOR_FILES`,
      `resolveVendorPath` and `resolveStaticPath`, moved verbatim from `server.ts:9-53`.
      Export `FRONTEND_DIR`, `resolveVendorPath` and `resolveStaticPath`; keep `REPO_ROOT` and
      `VENDOR_FILES` module-private. Carry the existing doc comments across with them.
- [x] **Confirm `REPO_ROOT` still resolves correctly.** It is
      `resolve(fileURLToPath(new URL("../..", import.meta.url)))`, which depends on the
      module's own location. `paths.ts` sits in `backend/src/` exactly as `server.ts` did, so
      `../..` still lands on the repository root — but this breaks silently if the file is
      ever placed in a subdirectory. Add a comment saying so.
- [x] Give `paths.ts` a header comment explaining that it is the only place a URL becomes a
      filesystem path, and that the vendor map is an allowlist rather than a served directory.
- [x] Create `backend/src/static.ts` holding `serveStatic`, moved verbatim from
      `server.ts:55-100`. Its full import list is:

      ```ts
      import { extname, resolve } from "node:path";
      import { FRONTEND_DIR, resolveStaticPath, resolveVendorPath } from "./paths";
      import { transpileModule } from "./transpile";
      ```
      `extname` is used at `server.ts:85` and `:93`, and `resolve` at `:80` and `:94`; both
      come from `server.ts:1` today and do not travel with `paths.ts`. `FRONTEND_DIR` is the
      only path constant `serveStatic` needs — it references neither `REPO_ROOT` nor
      `VENDOR_FILES`.
- [x] Reduce `backend/src/server.ts` to `GainzServeOptions` and `serveOptions`, importing
      `serveStatic` from `./static`, `apiRoutes` from `./routes` and `errorResponse` from
      `./http`. Narrow the `Repo` import to `import type { Repo } from "./repo"`.
- [x] Create `backend/src/main.ts` with the current `if (import.meta.main)` body as a named
      `function main(): void`, followed by the guard. Mirror `migrate.ts:9-25`. Its import
      list is `basename` from `node:path`, `DEFAULT_DB_PATH` and `openDatabase` from `./db`,
      `Repo` from `./repo` **as a value** (not `import type` — it is constructed here), and
      `serveOptions` from `./server`.

      ```ts
      function main(): void {
        const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
          console.log(`applied ${basename(migration.file, ".sql")}`);
        });
        const repo = new Repo(db);
        const port = Number(process.env.PORT ?? 3000);

        const server = Bun.serve({ port, ...serveOptions(repo) });
        // ...logs, shutdown closure, SIGINT/SIGTERM — unchanged
      }

      if (import.meta.main) {
        main();
      }
      ```
- [x] Point `package.json` at the new entry: `module` (line 7), `start` (line 9) and
      `start:dev` (line 10) all become `backend/src/main.ts`.
- [x] Update the `README.md` file tree at line 95, replacing the single `server.ts` entry with
      the four files and their one-line descriptions, keeping the existing column alignment.
- [x] Update `README.md:232`, which places the vendor allowlist in `backend/src/server.ts`;
      it now lives in `backend/src/paths.ts`.
- [x] Update the layering sentence at `docs/backend.md:3-7` so the arrow chain ends
      `... → server.ts (Bun.serve options) → main.ts (entry point)`, with `static.ts` and
      `paths.ts` named as the static half.
- [x] Update `docs/backend.md:50-52`, which names `VENDOR_FILES` as living in `server.ts`.

**Automated Verification**:

- [x] `bun test` — 52 pass, 0 fail, 139 `expect()` calls across 6 files, with no test file
      edited in this phase.
- [x] `bun test backend/test/static.api.test.ts` — all 15 tests pass (32 `expect()` calls),
      including the traversal refusals at lines 98-103.
- [x] `bun run typecheck` — clean.
- [x] `bun run lint` — clean.
- [x] `bun run fmt:check` — clean.
- [x] `backend/src/server.ts` is under 30 lines and contains no `Bun.serve(` call:
      `Select-String -Path backend/src/server.ts -Pattern "Bun\.serve\("` returns nothing.
      Search for the call with its opening parenthesis, not the bare string — the reduced file
      still legitimately contains the *type* `Bun.Serve.Routes` and the identifier
      `serveStatic` as the `fetch` value.
- [x] `Select-String -Path package.json -Pattern "src/server\.ts"` returns nothing.

**Manual Verification**:

- [ ] `bun start` against the existing database prints the two expected lines (`gainz is
      lifting on …` and `  database: …`), serves the app at `http://localhost:3000`, and the
      dashboard renders with Pico styling — confirming `/vendor/pico.css` and the transpiled
      modules still resolve.
- [x] `bun start` with `GAINZ_DB` pointing at a throwaway path prints the third line,
      `applied 001-initial-schema`, ahead of the other two. Use the environment variable
      rather than deleting `data/gainz.sqlite`.
- [ ] Ctrl-C shuts the process down cleanly with no error output.
- [x] `bun run start:dev` starts, and editing a backend file triggers a reload.

### Phase 2: Cover the error hook and document the verified behavior

Dependencies: Phase 1.

Close the three Open Questions from the research document. Two were measured during planning
and need documenting rather than fixing; the third is a real coverage gap.

**Tasks**:

- [x] Add four imports to `backend/test/meta.api.test.ts`, which currently imports only
      `describe`/`expect`/`test`, `type Summary`, and `type ErrorBody`/`body`/`useServer`
      (`meta.api.test.ts:1-4`): `openDatabase` from `../src/db`, `HttpError` from
      `../src/http`, `serveOptions` from `../src/server`, and `Repo` from `../src/repo`
      **as a value** — the existing `../src/repo` import is `import type` and cannot be used
      with `new`.
- [x] Add **one** test exercising the `error` hook directly, covering both branches in a
      single `test()` so the suite total rises by exactly one.

      ```ts
      test("renders errors through Bun.serve's error hook", () => {
        const db = openDatabase(":memory:");
        try {
          const { error } = serveOptions(new Repo(db));

          expect(error(new HttpError(418, "teapot")).status).toBe(418);
          expect(error(new Error("boom")).status).toBe(500);
        } finally {
          db.close();
        }
      });
      ```
      The `try`/`finally` matters: `openDatabase` runs the migrations and returns an open
      handle, and every other site in the suite closes it (`helpers/server.ts:62-65`). This
      test does not use the server `useServer()` boots around it, only a `Repo`.

      The hook is unreachable through the route table — `guardAll` wraps the method maps and
      `guard` wraps the catch-all — so this asserts the wiring in `serveOptions`, not Bun's
      dispatch. Expect one line of `Unhandled error: Error: boom` on stderr from
      `http.ts:29`; that is the 500 branch logging, not a failure.
- [x] Add a comment to `serveStatic` in `backend/src/static.ts` recording why no explicit
      `Content-Type` is set: Bun resolves the type from the file extension and covers far more
      of the MIME database than a hand-written map would, so the map would be a subset that
      drifts. Name the measured examples (`.svg`, `.woff2`, `.png`, `.webp`) and the
      extensionless fallback (`application/octet-stream`).
- [x] Add a paragraph to `docs/backend.md`'s static-serving section recording both verified
      behaviors — the `Content-Type` source above, and that a HEAD request is answered with
      the headers and no body by Bun itself, with `backend/test/static.api.test.ts:87` as the
      standing proof.

**Automated Verification**:

- [x] `bun test backend/test/meta.api.test.ts` — passes, including the new error-hook test.
- [x] `bun test` — 53 pass, 0 fail; the count rises by exactly the one added test.
- [x] `bun run typecheck` — clean.
- [x] `bun run lint` — clean.
- [x] `bun run fmt:check` — clean.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-10-server-and-src-layout.md` — the research this plan is built
  on; its Open Questions section is what Phase 2 closes.
- `docs/backend.md:1-52` — the documented layering, transaction rule and static-serving policy.
- `backend/src/migrate.ts:9-25` — the `main()` + `import.meta.main` idiom Phase 1 copies.
- `backend/test/helpers/server.ts:51-65` — `useServer()`, the only importer of `serveOptions`.
- `bun-types/serve.d.ts:784` — the `error` hook signature.
- `bun-types/serve.d.ts:1340-1357` — the worked example showing `error` catching a throw from
  a `routes` handler.
- `bun-types/docs/guides/http/stream-file.mdx:17-30` — `new Response(Bun.file(x))` setting
  `Content-Type` from the extension.
- Measured on Bun 1.4.2 during planning: the MIME table in decision 4, and
  `HEAD -> status=200 bodyChars=0 content-length=11`.
