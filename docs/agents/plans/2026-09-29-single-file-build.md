---
date: 2026-09-29T09:39:43.314514+00:00
git_commit: 3a92df572e538bae656ba381207f23f5bd41e9a2
branch: main
topic: 'Build server and frontend into one JS file'
tags: [plan, build, deploy, static, migrations, dev, scripts]
status: ready
---

# PLAN: Build server and frontend into one JS file

Deploying gainz today means copying a checkout plus `node_modules`, because the running server reads
three things from disk: the frontend under `src/frontend/` (transpiled per request), Pico out of
`node_modules`, and the migration `.sql` files. This plan adds `bun run build`, which writes one
minified `dist/gainz.js` (plus a linked `dist/gainz.js.map`) that carries all three inside it, so a
deployment is "copy one file, run `bun gainz.js`".

The browser side does not change at all: the built server answers the same URLs with the same
modules the dev server would (bar whitespace), one module per URL, so "a module's URL is its path" —
which `ui/styles.ts` and the lazily imported routes depend on — keeps holding.

## Acceptance Criteria

- `bun run build` writes `dist/gainz.js` (minified) and `dist/gainz.js.map` (linked); `dist/` is
  git-ignored.
- `bun gainz.js` runs from any directory with nothing else present — no checkout, no
  `node_modules`, no `.sql` files — and `PORT` and `GAINZ_DB` behave as today. The target machine
  needs Bun ≥ 1.4.
- The built server serves the frontend the way the dev server does: one module per URL, lazy
  routes, a component's CSS beside its module, the single-page fallback, the directory-index rule,
  the path-escape guard, ETag/304, `/vendor/pico.css`, and 404/405 as today.
- Embedded frontend modules are transpiled with whitespace minified and carry no source maps.
  `dev/hot.ts`, `testing.ts` and `*.test.ts` are not embedded.
- Migrations run from the embedded list, with the same validation as the disk runner.
- The built file ignores `GAINZ_DEV`: no `/dev/ws` socket and no injected client.
- A frontend module that does not parse fails `bun run build` with a non-zero exit naming the file.
- `bun start`, `bun run start:dev`, `bun test`, `bun run typecheck`, `bun run lint` and
  `bun run fmt:check` behave as before.

## Technical Key Decisions and Tradeoffs

1. **Embed every frontend file pre-transpiled, keyed by URL; do not bundle the frontend.**
   - Why: bundling would change `import.meta.url` to the bundle's URL, breaking `styles.ts`'s
     `.ts → .css` lookup and the lazy per-route loading described in `docs/frontend.md`.
   - Impact: the server answers from an in-memory map; the browser is untouched.
2. **One committed stub, `src/backend/embedded.ts`, exports `EMBEDDED: Embedded | null = null`; the
   build replaces it through `Bun.build({ files })`.**
   - Why: measured on Bun 1.4.2 — an entry in `files` keyed by the stub's absolute path replaces the
     file on disk in the bundle, and `bun:sqlite` stays external. No plugin, no dependency, nothing
     generated onto disk.
   - Impact: `null` means "read the disk", which is today's behaviour in dev and in every test. It
     sits outside `features/` because both `db/` and the static feature read it. An imported
     binding keeps its declared type, so `EMBEDDED === null` checks elsewhere are not flagged by
     `no-unnecessary-condition`.
3. **The static feature reads through an internal `WebFiles` interface with a disk and an embedded
   implementation.**
   - Why: `StaticController` keeps the method check, directory index, single-page fallback, client
     injection and ETag logic, and stops knowing where bytes come from.
   - Impact: `WebFiles` distinguishes an _invalid_ path (404 before the fallback, as today) from a
     _missing_ one (fallback-eligible). `StaticFacade` gains `embed()`, which produces the embedded
     maps for the build, so `src/scripts/build.ts` never reaches into `static/internal/`. Page files
     and vendor files are separate maps, so a vendor file is reachable only at its literal
     vendor URL, exactly as on disk.
4. **The migration runner works on `{ filename, sql }` sources.**
   - Why: embedded and on-disk migrations go through the same `discover()` validation and the same
     "database is newer than this code" guard.
   - Impact: `readMigrations(dir)` turns a directory into sources; `Migration.file` becomes the bare
     filename; `Migration` gains `sql`; `options.dir` stays for the tests.
5. **Hot reload is always off in the built file.** `DevFacade.enabled()` becomes
   `EMBEDDED === null && process.env.GAINZ_DEV === '1'`, and `dev/hot.ts` is not embedded.
   - Why: there is no source tree to watch; `GAINZ_DEV=1` could only open a silent socket.
   - Impact: the dev code is still bundled (the `websocket` option is passed unconditionally, as
     it already is under `bun start`), but no route reaches it. `/dev/ws` then falls through to the
     single-page fallback exactly as it does under `bun start` today.
6. **`bun run build` → `src/scripts/build.ts` → `Bun.build({ target: 'bun', minify: true,
   sourcemap: 'linked' })` into `dist/gainz.js`.**
   - Why: minified for size; the linked map is read by Bun for stack traces (measured: a throw in
     the minified file reports `boom.ts:1:43`).
   - Impact: frontend modules get `minifyWhitespace` only — names and structure survive for browser
     devtools — and no maps. oxlint and oxfmt already skip git-ignored paths (measured), so
     `dist/` needs no linter or formatter config.
7. **One end-to-end test file, `src/scripts/build.test.ts`, is the only new test file.**
   - Why: it proves the built file works where it will actually run — copied alone into a
     directory outside the repository.
   - Impact: a few seconds of build and start-up added to `bun test`; the existing suites keep
     covering the disk path unchanged.

## Current State

```
bun src/backend/main.ts
 ├─ db/db.ts openDatabase() ─▶ db/migrations.ts migrate()
 │                              discover(MIGRATIONS_DIR)  readdirSync   (migrations.ts:60-90)
 │                              apply()                   readFileSync  (migrations.ts:114-132)
 └─ http/server.ts ─▶ http/routes.ts allRoutes()
      ├─ features/dev/dev.routes.ts      /dev/ws when GAINZ_DEV=1       (dev.routes.ts:9-17)
      └─ features/static/static.routes.ts
           ├─ /vendor/pico.css ─▶ StaticController.vendor()
           │     paths.ts resolveVendorPath → Bun.resolveSync into node_modules (paths.ts:23-33)
           └─ /* ─▶ StaticController.frontend()                         (static.controller.ts:27-64)
                 paths.ts resolveStaticPath (REPO_ROOT from import.meta.url, paths.ts:6)
                   invalid / escaping path → 404 immediately, never the fallback
                 .ts   → transpile.ts transpileModule → JS (500 if it does not parse)
                 .html → DevFacade.injectClient (takes Uint8Array)
                 other → Bun.file().type
                 extension-less miss → index.html (single-page fallback)
                 every 200 → #respond: ETag + no-cache, 304 on If-None-Match
```

`Migration.file` is an absolute path; `main.ts:8` and `scripts/migrate.ts:15` print
`basename(migration.file, '.sql')`, and the error messages in `pendingMigrations` and `apply` quote
`basename(file.file)`.

## Desired End State

```
bun run build ─▶ src/scripts/build.ts build(outdir)
   ├─ createStaticFacade().embed()   { pages:  { '/index.html': {body,type}, '/main.ts': {…js…}, … },
   │                                   vendor: { '/vendor/pico.css': {…} } }
   │                                   (no dev/, testing.ts, *.test.ts)
   ├─ readMigrations(MIGRATIONS_DIR) [{ filename: '001-initial-schema.sql', sql }]
   └─ Bun.build({ entrypoints: [src/backend/main.ts], target: 'bun', minify, sourcemap: 'linked',
                  files: { <abs>/src/backend/embedded.ts: `export const EMBEDDED = {…};` } })
        ─▶ dist/gainz.js + dist/gainz.js.map

bun gainz.js   (EMBEDDED !== null)
 ├─ migrate()           sources = EMBEDDED.migrations
 ├─ DevFacade.enabled() false, whatever GAINZ_DEV says
 └─ StaticController ─▶ EmbeddedWebFiles (map lookup)   ← instead of DiskWebFiles

bun start / tests (EMBEDDED === null) — unchanged behaviour
 ├─ migrate()           sources = readMigrations(options.dir ?? MIGRATIONS_DIR)
 └─ StaticController ─▶ DiskWebFiles (resolveStaticPath + transpile, resolveVendorPath)
```

## Abstractions and Code Reuse

- `src/backend/`
  - `embedded.ts` — **new**. The stub the build replaces. Declares
    `EmbeddedFile { body: string; type: string }`,
    `EmbeddedWeb { pages: Record<string, EmbeddedFile>; vendor: Record<string, EmbeddedFile> }`,
    `Embedded extends EmbeddedWeb { migrations: MigrationSource[] }` (`import type
    { MigrationSource }` from `db/migrations.ts`), and `export const EMBEDDED: Embedded | null = null;`.
    Its doc comment says the build swaps it and that `null` means "read from disk".
  - `db/migrations.ts`
    - `MigrationSource { filename: string; sql: string }` — new, exported
    - `readMigrations(dir): MigrationSource[]` — new, exported
    - `discover(sources)` — validates a source list instead of reading a directory
    - `Migration` — `file` is the bare filename, gains `sql`
    - `pendingMigrations()`, `apply()` — no directory, no file I/O
    - `migrate()` — picks `options.dir` → `EMBEDDED.migrations` → `MIGRATIONS_DIR`
  - `features/static/`
    - `internal/web-files.ts` — **new**. `WebFiles` interface, `DiskWebFiles` (today's disk and
      transpile logic moved out of the controller), `EmbeddedWebFiles` (map lookups), and
      `createWebFiles()`, which picks one from `EMBEDDED`
    - `internal/static.controller.ts` — `StaticController` takes a `WebFiles`; `vendor()` and
      `frontend()` read through it
    - `internal/transpile.ts` — `transpileModule(path, { minify })` chooses between the current
      transpiler and one with `minifyWhitespace: true`
    - `internal/embed.ts` — **new**. `embedWebRoot(): Promise<EmbeddedWeb>` walks `FRONTEND_DIR`
      and the vendor allowlist
    - `static.facade.ts` — `StaticFacade.embed()` delegates to `embedWebRoot()`
    - `static.routes.ts` — builds the controller with `createWebFiles()`
  - `features/dev/dev.facade.ts` — `DevFacade.enabled()` is false whenever `EMBEDDED !== null`;
    `injectClient` accepts `string | Uint8Array<ArrayBuffer>`
- `src/scripts/`
  - `build.ts` — **new**. `build(outdir)` plus a `main()` behind `import.meta.main`
  - `build.test.ts` — **new**. The end-to-end test
- `package.json` — `"build": "bun run src/scripts/build.ts"`
- `.gitignore` — `dist/`
- `README.md`, `AGENTS.md`, `docs/backend.md`, `docs/frontend.md` — see the tasks

Reused unchanged: `resolveStaticPath`, `resolveVendorPath`, `vendorUrls`, `FRONTEND_DIR`,
`MIGRATIONS_DIR`, `#respond`/`matchesEtag`, `useTempDir()`, `at()`.

## Logging & Observability

`bun run build` prints what it wrote:

```
built dist/gainz.js (212 KB) and dist/gainz.js.map
  embedded 47 frontend files, 1 vendor file, 1 migration
```

A module that does not parse fails the build through the error that `embedWebRoot()` throws:

```
error: Could not transpile src/frontend/ui/format.ts
```

The built server logs exactly what `bun start` logs today (`applied 001-initial-schema`,
`gainz is running on …`, `  database: …`), and never `  hot reload: on`.

## Implementation

### Phase 1: Migrations from a list of sources

Dependencies: None

The migration runner stops reading a directory itself and validates a list of `{ filename, sql }`
sources, which come from `EMBEDDED.migrations` when present and from a directory otherwise. This
phase also adds the `embedded.ts` stub, so the runner's embedded branch compiles before any build
exists.

**Tasks**:

- [x] Add `src/backend/embedded.ts` with `EmbeddedFile`, `EmbeddedWeb`, `Embedded` and
      `EMBEDDED = null` as described above. It imports nothing from `features/`.
- [x] In `src/backend/db/migrations.ts`, add and export `MigrationSource` and
      `readMigrations(dir)`, which returns every `.sql` entry of `dir` (`readdirSync`) with its
      contents (`readFileSync`), in directory order — `discover` sorts.
- [x] Change `Migration` so `file` is the bare filename (update its doc comment) and add `sql`.
- [x] Change `discover(dir)` to `discover(sources: MigrationSource[])`: same filename regex,
      version ≥ 1 and duplicate checks, now over `source.filename`; it does no I/O.
- [x] Change `pendingMigrations(files, applied)` to drop `dir`. Its first message becomes
      `Database has migration ${row.version} (${row.name}) applied, but no migration file for it exists — the database is newer than this code`;
      its second quotes `file.file` directly (already bare) instead of `basename(file.file)`.
- [x] Change `apply()` to `db.run(migration.sql)` and quote `migration.file` directly in its error.
      Remove the `basename`, `join` and `readFileSync`/`readdirSync` imports that no longer have a
      user outside `readMigrations`, keeping only what `readMigrations` and `MIGRATIONS_DIR` need.
- [x] Change `migrate()` to resolve its sources:
      ```ts
      const sources = options.dir !== undefined ? readMigrations(options.dir) : (EMBEDDED?.migrations ?? readMigrations(MIGRATIONS_DIR));
      ```
      and update `MigrateOptions.dir`'s doc comment ("Only the tests override this; a built file
      reads the embedded list").
- [x] Update the file header comment of `migrations.ts`: migrations come from the embedded list in
      a built file and from `src/backend/db/migrations/` otherwise, validated the same way.
- [x] `src/backend/main.ts` and `src/scripts/migrate.ts` keep `basename(migration.file, '.sql')` —
      it still works on a bare filename; leave them unchanged.
- [x] In `src/backend/db/migrations.test.ts`, add tests that `readMigrations(MIGRATIONS_DIR)`
      contains `001-initial-schema.sql` by bare filename with non-empty `sql`, and that
      `at(result.applied, 0).file` is a bare filename (`'001-...sql'`, no directory separator);
      every existing test and its error regex keeps passing.
- [x] In `docs/backend.md`, extend the migrations paragraph ("The schema lives in
      `src/backend/db/migrations`…"): the runner validates a list of `{ filename, sql }` sources,
      read from that directory by `readMigrations`, or taken from `EMBEDDED.migrations` in a built
      file (see "Single-file build") — the same rules hold for both.

**Automated Verification**:

- [x] `bun test src/backend/db` passes, including the new tests
- [x] `bun test` passes
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

### Phase 2: Single-file build, end to end

Dependencies: Phase 1

Adds the static feature's `WebFiles` split and `embed()`, the dev switch, the build script and its
end-to-end test, and the documentation. At the end, `bun run build` produces a `dist/gainz.js`
that serves the whole app from an empty directory.

**Tasks**:

- [x] In `features/static/internal/transpile.ts`, add a second transpiler with
      `minifyWhitespace: true` and give `transpileModule(path, options?: { minify?: boolean })` the
      choice. The per-request path keeps calling it without options.
- [x] Add `features/static/internal/web-files.ts`:
      ```ts
      export type WebFile =
        | { kind: 'file'; body: string | Uint8Array<ArrayBuffer>; type: string }
        | { kind: 'missing' }   // fallback-eligible
        | { kind: 'invalid' }   // undecodable, NUL, or escapes the web root: 404, never the fallback
        | { kind: 'error'; message: string }; // answered as 500
      export interface WebFiles {
        /** `pathname` already names a file: the caller has rewritten a directory to its index.html. */
        page(pathname: string): Promise<WebFile>;
        vendor(pathname: string): Promise<WebFile>;
      }
      export function createWebFiles(): WebFiles; // EmbeddedWebFiles when EMBEDDED !== null, else DiskWebFiles
      ```
      - `DiskWebFiles.page` is today's logic from `StaticController.frontend`:
        `resolveStaticPath` null → `invalid`; `Bun.file().exists()` false → `missing`; `.ts` →
        `transpileModule` (null → `error` with `Could not transpile <basename>`, else type
        `text/javascript;charset=utf-8`); otherwise the bytes with `file.type`. It caches nothing,
        so an edited file changes its ETag as today.
      - `DiskWebFiles.vendor` is today's `StaticController.vendor` logic: unresolved → `missing`
        (404), file absent → `error` with `Vendor stylesheet missing — run \`bun install\``.
      - `EmbeddedWebFiles.page` applies the same guards as `resolveStaticPath` — a
        `decodeURIComponent` failure or a `\0` → `invalid` — then normalises with
        `posix.normalize` from `node:path`; a result that does not start with `/` or still contains
        `..` → `invalid`; otherwise a lookup in `EMBEDDED.pages` (absent → `missing`).
        `EmbeddedWebFiles.vendor` looks the raw pathname up in `EMBEDDED.vendor` only.
- [x] Change `StaticController` to take `WebFiles` (beside `DevFacade`) and read through it.
      `frontend()` keeps the 405, rewrites a directory path to `…/index.html`, and then:
      `invalid` → 404; `error` → `new Response(message, { status: 500 })`; `file` → injection
      when `type` starts with `text/html`, then `#respond`; `missing` → the single-page fallback
      exactly as today (only for an extension-less, non-directory path, via
      `page('/index.html')`), else 404. `vendor()` maps `missing` → 404, `error` → 500,
      `file` → `#respond`. Drop the controller's imports of `paths.ts` and `transpile.ts`.
- [x] Widen `DevFacade.injectClient` to `(html: string | Uint8Array<ArrayBuffer>)` — `new
      Response(html)` takes both, and the result stays `Uint8Array<ArrayBuffer>`.
- [x] Change `static.routes.ts` to build `new StaticController(createDevFacade(), createWebFiles())`.
- [x] Add `features/static/internal/embed.ts` with `embedWebRoot(): Promise<EmbeddedWeb>`:
      - scan `FRONTEND_DIR` with `new Bun.Glob('**/*').scan({ cwd: FRONTEND_DIR })`, converting
        `\` to `/` (Glob yields `ui\app.css` on Windows) and prefixing `/`
      - skip `dev/**`, `testing.ts` and `**/*.test.ts`
      - `.ts` → `transpileModule(path, { minify: true })`, type `text/javascript;charset=utf-8`;
        a `null` throws `new Error(\`Could not transpile src/frontend${url}\`)`
      - everything else → `Bun.file(path).text()` with `Bun.file(path).type` (the web root holds
        only `.html`, `.css` and `.ts`; the maps hold text) into `pages`
      - each of `vendorUrls()` → `resolveVendorPath(url)` read as text, type
        `text/css;charset=utf-8`, into `vendor`; unresolved or missing throws
        `Vendor stylesheet missing — run \`bun install\``
- [x] Add `StaticFacade.embed(): Promise<EmbeddedWeb>` delegating to `embedWebRoot()`, and extend
      the facade's doc comment.
- [x] Change `DevFacade.enabled()` to `EMBEDDED === null && process.env.GAINZ_DEV === '1'`, and
      extend its comment: a built file has no source tree to watch.
- [x] Add `src/scripts/build.ts`:
      ```ts
      const SRC = resolve(import.meta.dir, '..');

      export interface BuildResult { outfile: string; bytes: number; embedded: Embedded }

      export async function build(outdir: string): Promise<BuildResult> {
        const web = await createStaticFacade().embed();
        const embedded: Embedded = { ...web, migrations: readMigrations(MIGRATIONS_DIR) };
        // Bun.build throws on failure by default (`throw: true`), so there is no success check.
        await Bun.build({
          entrypoints: [resolve(SRC, 'backend/main.ts')],
          target: 'bun', outdir, naming: 'gainz.js', minify: true, sourcemap: 'linked',
          files: { [resolve(SRC, 'backend/embedded.ts')]: `export const EMBEDDED = ${JSON.stringify(embedded)};` },
        });
        const outfile = resolve(outdir, 'gainz.js');
        return { outfile, bytes: Bun.file(outfile).size, embedded };
      }
      ```
      `main()` behind `import.meta.main` calls `build('dist')` and prints the two log lines from
      "Logging & Observability"; a thrown error propagates, so the process exits non-zero.
- [x] Add `"build": "bun run src/scripts/build.ts"` to `package.json`'s scripts and `dist/` to
      `.gitignore` (under a `# build output` heading).
- [x] Add `src/scripts/build.test.ts`.
      **`describe('single-file build')`**, with its own `beforeAll`/`afterAll` (not `useTempDir()`,
      which is per-test):
      - `beforeAll` (explicit timeout of 60 s): `mkdtempSync` a directory; `build('<tmp>/out')`,
        keeping the returned `embedded`; copy only `gainz.js` to `<tmp>/deploy`; start
        `Bun.spawn([process.execPath, 'gainz.js'], { cwd: '<tmp>/deploy', env: { ...process.env,
        PORT: '0', GAINZ_DB: '<tmp>/deploy/data/gainz.sqlite', GAINZ_DEV: '1' }, stdout: 'pipe',
        stderr: 'pipe' })`; read stdout until the `gainz is running on <url>` line, keeping all
        stdout read so far, and give up after 15 s by throwing with the collected stderr.
      - `afterAll`: if the process was started, `kill()` it and `await proc.exited`, then `rmSync`
        the directory with `{ recursive: true, force: true, maxRetries: 5, retryDelay: 20 }`
        (Windows keeps a live process's working directory and SQLite handles locked).
      - Tests:
        - [x] `/` and `/workouts/3` answer `index.html` without `/dev/hot.ts` in it, and the
              collected stdout has no `hot reload: on`
        - [x] a `WebSocket` to `/dev/ws` never opens (the `opens()` pattern from
              `dev.routes.test.ts`)
        - [x] `/app/gz-app.component.ts` answers `text/javascript` whose body equals
              `embedded.pages['/app/gz-app.component.ts'].body`; `/features/exercises/internal/gz-chart.component.ts`
              still contains the relative specifier `../../../ui/format.ts` (match without quotes —
              Bun's printer may re-quote it), contains
              `await define(`, contains no `: string` annotation and no `sourceMappingURL`
        - [x] the `.css` beside every `gz-*.component.ts` under `src/frontend/`, `/ui/app.css`
              and `/vendor/pico.css` answer 200
        - [x] `/dev/hot.ts`, `/testing.ts` and `/ui/html.test.ts` answer 404
        - [x] `/ui/../main.ts` answers 200; `/%2e%2e/backend/http/server.ts`, `/%zz` and
              `/vendor/%70ico.css` answer 404
        - [x] `/api/health` matches `{ status: 'ok' }` (`toMatchObject`) and `GET /api/workouts`
              answers 200 — the embedded migrations ran
        - [x] `<tmp>/deploy/data/gainz.sqlite` exists — `GAINZ_DB` is honoured
        - [x] a request repeating a response's `ETag` in `If-None-Match` gets 304
        - [x] `POST /` answers 405
        - [x] `<tmp>/out/gainz.js` contains `//# sourceMappingURL=gainz.js.map`, and the map's
              `sources` include one ending in `src/backend/main.ts`
      **`describe('a module that does not parse')`**, using `useTempDir()` for the outdir:
      - [x] with `src/frontend/__broken.ts` written (`export const oops: = ;`) and removed in a
            `finally`, as `transpile.test.ts:48-59` does, `build(dir)` rejects with a message
            matching `src/frontend/__broken.ts`
- [x] `README.md`: change the Frontend bullet's "no build step" sentence to say development has no
      build step and the server transpiles on request, while `bun run build` produces one file for
      deployment; add a `## Deploy` section after Quick start:
      ```sh
      bun run build                 # dist/gainz.js + dist/gainz.js.map
      scp dist/gainz.js* server:/opt/gainz/
      PORT=8080 GAINZ_DB=/var/lib/gainz/gainz.sqlite bun /opt/gainz/gainz.js
      ```
      with one sentence each on: the target needs Bun ≥ 1.4 and nothing else; migrations apply on
      start as before; hot reload is not available in the built file.
- [x] `AGENTS.md`: add `bun run build             # one-file deployment build: dist/gainz.js (+ .map)`
      to the Commands block after `bun run migrate`, and name `build` in the `src/scripts/` bullet
      ("the `migrate`, `seed` and `build` entry points").
- [x] `docs/backend.md`:
      - the static paragraphs: the controller reads through `WebFiles` in
        `internal/web-files.ts` — disk (`paths.ts` + `transpile.ts`) under `bun start` and the
        tests, the embedded maps in a built file — and keeps the method, invalid-path,
        directory-index, fallback, injection and ETag rules for both; vendor files live in their own
        map so they stay reachable only at their literal URL
      - the sentence "`static.facade.ts` publishes one method, `webRoot()`…": it now publishes
        `webRoot()` for the dev feature and `embed()` for the build
      - new `## Single-file build (src/scripts/build.ts)` section: `src/backend/embedded.ts` is a
        committed `null` stub swapped through `Bun.build`'s `files`; what is embedded and what is
        skipped; `target: 'bun'`, minified, linked source map read by Bun for stack traces;
        frontend modules whitespace-minified without maps; `GAINZ_DEV` ignored in a built file;
        `dist/` is git-ignored, which is also what keeps oxlint and oxfmt out of it
      - the operator-scripts sentence: `src/scripts/` holds `migrate`, `seed` and `build`
      - the tests paragraph: `src/scripts/build.test.ts` is end-to-end over HTTP like the route
        tests, but against the built file run alone from a temporary directory in a child
        process — so it is described beside the route tests, not added to the list of exceptions
      - the hot-reload section's first paragraph: a built file never enables the dev feature
- [x] `docs/frontend.md`:
      - `## Loading`: after "editing a module and reloading is the whole edit loop", add that a
        deployed build serves these same modules from memory — transpiled once at build time with
        whitespace minified, still one module per URL — and that a module that does not parse
        fails the build rather than answering 500
      - `## Hot reload`: "`bun start` does neither" also holds for a built file, whatever
        `GAINZ_DEV` says
      - `## Theming`, the Pico paragraph: a built file carries Pico inside it, served at the same
        `/vendor/pico.css`

**Automated Verification**:

- [x] `bun test src/scripts/build.test.ts` passes
- [x] `bun test` passes, including the unchanged static, transpile and dev suites
- [x] `bun run build` exits 0 and writes `dist/gainz.js` and `dist/gainz.js.map`
- [x] with `dist/` present, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass
- [x] `git status --short` lists nothing under `dist/`

**Manual Verification**:

- [ ] Copy `dist/gainz.js` alone into an empty directory outside the repository, run
      `bun gainz.js`, open the printed URL, and click through the dashboard, a workout (add a set)
      and an exercise (the chart renders): every view is styled on first paint and the browser
      console is clean.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- oxlint's `typescript/method-signature-style` wants `WebFiles` declared with property signatures
  (`page: (pathname: string) => Promise<WebFile>`), not the method signatures sketched above.
- `DevFacade.injectClient` encodes a string page with `TextEncoder` when hot reload is off, so its
  result stays `Uint8Array<ArrayBuffer>` as planned.
- The "does not parse" test awaits the rejection through `.then(ok, err)` rather than
  `await expect(…).rejects`: Bun types the `rejects` matchers as returning `void`, which
  `await-thenable` refuses.

## References

- `docs/frontend.md` — "Loading": why a module's URL is its path, and the load-bearing top-level
  `await`
- `docs/backend.md` — static serving, migrations, hot reload
- `docs/agents/plans/2026-09-17-hot-reload-for-the-frontend.md` — why Bun's bundler/HMR was not
  adopted for the frontend
- `node_modules/bun-types/bun.d.ts:3593` — `BuildConfig.files`
- `node_modules/bun-types/bun.d.ts:3478` — `BuildConfig.throw`, default `true`
- `node_modules/bun-types/bun.d.ts:3012` — `TranspilerOptions.minifyWhitespace`
- Measured on Bun 1.4.2 during planning: `files` keyed by an absolute path replaces the on-disk
  module; `import.meta.main` is `true` in the bundled entry; a linked map gives source positions in
  stack traces; map `sources` are relative to `outdir`; `Bun.Glob` yields `\`-separated paths on
  Windows; oxlint and oxfmt skip a directory listed in `.gitignore`
