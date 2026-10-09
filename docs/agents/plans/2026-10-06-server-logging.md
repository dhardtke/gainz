---
date: 2026-10-06T12:03:14.014444+00:00
git_commit: 0da244a55c8c9668d002608200bff7a78a95f19e
branch: main
topic: 'Server logging'
tags: [plan, backend, logging, http, auth, deployment]
status: implemented
---

# PLAN: Server logging

The server writes a handful of unrelated `console.*` lines, and they don't explain much: the startup
banner, applied migrations, the login lockout, a transpile failure, hot reload, and
`Unhandled error: …` for a 500, which doesn't say which request failed. Nothing records the requests
themselves, a successful login, a wrong password, a shutdown, or a startup that fails. In production
journald stores all of it, stderr included, at priority info, so `journalctl -p err` finds nothing.

This plan gives the backend a small logger that knows about journald priorities, an access log for
the API with request bodies (passwords redacted), 500s logged together with the request that caused
them, auth events, and lifecycle lines. The goal: `journalctl _SYSTEMD_USER_UNIT=gainz.service`
should tell you what happened and why something broke.

## Acceptance Criteria

- Every `/api` and `/api/*` request writes one line:
  - the format is `http <METHOD> <path+query> <status> <ms>ms`, logged at info below 500 and at error from 500 up
  - writes (`POST`, `PUT`, `PATCH`, `DELETE`) add their body after the line, but only when the body is non-empty
- A logged body is compact JSON:
  - every key named `password`, at any depth, has its value replaced by `"[redacted]"`
  - a body that isn't JSON is logged only as `[<n> bytes, not JSON]`
  - the logged text is cut at 1024 characters, followed by `…(+<n> more)`
- Any response of 500 or more on any route, static and dev included, is logged at error. When a throw
  caused it, the line comes with the error as `Bun.inspect` renders it: the stack, plus `cause` and an
  `AggregateError`'s inner errors. Static and dev responses below 500 are not logged.
- When stdout is the journal (`JOURNAL_STREAM` matches stdout's `dev:ino`, as systemd.exec(5) prescribes),
  every line written through `log` goes to stdout and carries a `<6>`, `<4>` or `<3>` prefix, each stack
  line included, so `journalctl -p warning` and `-p err` filter correctly. Output Bun itself writes
  before `main()` runs, such as a failed top-level import, stays unprefixed.
- In a terminal, lines start with `HH:MM:SS`, and warn and error lines say `WARN` or `ERROR` after the time.
- Auth events:
  - `auth login` at info when the password is accepted
  - `auth wrong password` at warn on every failed attempt
  - the existing lockout warning at warn
- Server lifecycle:
  - stdout still carries `gainz is running on <url>` (`src/scripts/build.test.ts` matches it)
  - shutdown logs `server stopping (SIGTERM)` or `(SIGINT)`
  - any throw during startup, a failing migration or an unopenable database for example, logs
    `server failed to start` with the error and exits with 1
  - an uncaught exception or unhandled rejection after startup logs at error and exits with 1
- The remaining lines:
  - `db applied <migration>` at info
  - `static could not transpile <path>` at error, with the cause
  - `dev hot reload watching <dir>/` and `dev hot reload idle` at info
- No `console.*` call remains in production code under `src/backend/`. The CLI scripts in
  `src/scripts/` keep theirs.
- `bun test --parallel` prints no log lines. Tests assert log lines through `useLogs()` or
  `useServer().logs()`.

## Technical Key Decisions and Tradeoffs

1. **Scope: an operations view in the journal.**
   - Why: a single-user app behind a reverse proxy needs to answer "what happened, and why did it
     break". It doesn't need an aggregator format.
   - Impact: plain single-line text, no JSON log format, no level filter and no environment variable.
     journald adds the timestamps.
2. **Access-log coverage: `/api` always, any other route only from 500 up.**
   - Why: one page load fetches dozens of ES modules, and those lines would bury the API calls.
   - Impact: the wrapper decides per request from `url.pathname` and the status.
3. **A logger module, `src/backend/shared/log.ts`, with journald priority prefixes.**
   - Why: today `console.error` lands at info priority. journald reads a leading `<N>` as the line's
     priority because `SyslogLevelPrefix=` defaults to yes, and systemd sets `JOURNAL_STREAM`
     (`<dev>:<ino>`) whenever stdout or stderr goes to the journal.
   - Impact:
     - journald mode requires `JOURNAL_STREAM` to equal `fstatSync(1)`'s `dev:ino`, not just to be set.
       A terminal launched from a systemd user unit (GNOME Terminal on Fedora, for example) inherits the
       variable, and `bun start` there must still print the terminal format.
     - every line of a multi-line entry, such as a stack, gets the prefix, because journald stores
       each line as its own entry
     - errors are rendered with `Bun.inspect(err, { colors: false })`, not `err.stack`. A transpile
       failure is an `AggregateError` whose parse messages live in `.errors`, and a failed migration
       carries its reason in `cause`. `.stack` shows neither.
     - in journald mode every level goes to stdout, because the prefix carries the level and one
       stream keeps `auth wrong password` and its `http … 401` line in order. In terminal mode info
       goes to stdout and warn/error to stderr. Either way the banner stays on stdout.
4. **Testability through a replaceable module-level sink.**
   - Why: tests stay silent and can still assert lines, without threading a logger through every
     feature. `bun test --parallel` implies `--isolate` (checked with `bun test --help` on 1.4.2), so
     module state can't leak between files.
   - Impact:
     - `setLogSink()` returns a function that restores the previous sink
     - `useLogs()` in `testing.ts` captures the lines per test, and `useServer()` calls it and returns `logs`
     - Bun runs `afterEach` hooks in registration order, so `useServer()` registers its own hooks
       before calling `useLogs()`. The server and database then close while capture is still on.
     - since one test sees every topic, a test that checks one feature's lines filters `logs()` by
       topic or uses `toContainEqual`, never an exact list of everything logged
5. **Request bodies on every write, read from `req.clone()`, redacted and truncated.**
   - Why: an audit trail of every change.
   - Impact:
     - the clone is taken before the handler runs and read after it, and only when the line will
       actually be logged. The handler sees the original request with its `params` untouched; this
       was checked on Bun 1.4.2, including handlers that throw or never read the body.
     - redaction matches the exact, case-sensitive key `password`, which is the only key the API
       uses for one. A login body that has the key shows `{"password":"[redacted]"}`.
     - a body that isn't JSON never appears verbatim, so a malformed login can't leak a password
6. **The access log owns the 500.**
   - Why: Bun's `error` hook receives only the error, never the request.
   - Impact:
     - `http/access-log.ts` wraps the whole table in `allRoutes()`, outside `auth.guard()` so 401s are
       logged too. It catches throws and answers with `errorResponse(err)`, which no longer logs.
     - the `error` hook stays as a safety net that logs `http unhandled error outside a route`
     - the loop that walks a `RouteTable` and wraps each handler moves out of `AuthFacade.guard()` into
       `wrapHandlers()` in `http/routing.ts`, and both the guard and the access log use it. The guard's
       startup error wording changes from "cannot be guarded" to "cannot be wrapped"; no test pins the
       old wording.
7. **One output path for the banner.**
   - Why: everything goes through the logger.
   - Impact: the banner lines lose their two-space indent and gain the `server` topic, so `gainz is
     running on …` becomes `server gainz is running on …`. `build.test.ts`'s `/gainz is running on (\S+)/`
     and its `hot reload: on` check still work.
8. **Logging stays at the edges.**
   - Why: repositories and facades aren't where operations happen.
   - Impact:
     - `log` is called from `main.ts`, `http/`, the auth facade, the login throttle, transpile and the
       dev hub
     - the migration runner keeps its `onMigration` callback and doesn't log itself
       (`migrations.ts:38`)

## Current State

```
main.ts ─ startup ────────────────────────────────────────────────────────────
  console.error  bad GAINZ_PASSWORD_HASH → exit 1             main.ts:10
  console.log    "applied <migration>"                        main.ts:15
  console.log    banner: running on / database / auth / hot   main.ts:21-26
  (nothing)      SIGINT/SIGTERM shutdown                      main.ts:28-38
  (nothing)      startup throw → Bun's uncaught-error crash   main.ts:14 → db.ts → migrations.ts

Bun.serve({ routes: allRoutes(db, auth), websocket, error })   http/server.ts:9-17
  routes.ts:29   meta · auth · auth.guard({ stats, exercises, workouts, sets }) · dev · static
  (nothing)      no access log; no middleware, no fetch fallback
  errors.ts:28   console.error('Unhandled error:', err) → 500   (no request context)
  (nothing)      HttpError 4xx

auth
  auth.facade.ts:83-120         guard(): walks the table and wraps every handler (the only wrapper)
  login-throttle.ts:43          console.warn  "login locked for N s after M failed attempts"
  (nothing)                     login ok, wrong password

static / dev
  transpile.ts:29   console.error  "gainz: could not transpile <path>"; controller answers 500
  hub.ts:36,50      console.log    "gainz: hot reload watching …/" / "gainz: hot reload idle"

journald (deploy/gainz.service, no SyslogLevel=) → every line stored at priority info
```

Tests: `http/errors.test.ts:13-23` spies on `console.error`. `auth.routes.test.ts` and
`dev.routes.test.ts` print the lockout and hot-reload lines while they run.

## Desired End State

```
request ─▶ accessLog wrapper (http/access-log.ts) ─▶ auth.guard wrapper ─▶ handler
              │  start = performance.now(); copy = req.clone() for writes
              │  try handler → res   catch err → res = errorResponse(err)
              │  path = /api…  or  res.status ≥ 500 ?
              ▼
           log.info|error('http', 'POST /api/workouts 201 3ms {"performedOn":"2026-10-06"}', err?)
              ▼
           shared/log.ts ── sink ──▶ default sink
                                     stdout is the journal → stdout, "<6>http POST …" on every line
                                     otherwise → "14:02:11 http POST …", info on stdout,
                                                 warn/error on stderr
                             └──▶ tests: useLogs() captures { level, text }
```

What `journalctl _SYSTEMD_USER_UNIT=gainz.service` shows after a deploy and some use:

```
Oct 06 21:13:58 srv bun[812]: db applied 004-add-notes
Oct 06 21:13:58 srv bun[812]: server gainz is running on http://localhost:3000/
Oct 06 21:13:58 srv bun[812]: server database: data/gainz.sqlite
Oct 06 21:13:58 srv bun[812]: server auth: on
Oct 06 21:14:01 srv bun[812]: http GET /api/health 200 0ms
Oct 06 21:14:05 srv bun[812]: auth wrong password                                     (warning)
Oct 06 21:14:05 srv bun[812]: http POST /api/auth/login 401 52ms {"password":"[redacted]"}
Oct 06 21:14:09 srv bun[812]: auth login
Oct 06 21:14:09 srv bun[812]: http POST /api/auth/login 204 49ms {"password":"[redacted]"}
Oct 06 21:14:10 srv bun[812]: http GET /api/stats?from=2026-09-01&to=2026-10-01 200 4ms
Oct 06 21:14:31 srv bun[812]: http POST /api/workouts/12/sets 201 3ms {"exerciseId":3,"reps":8,"weight":80}
Oct 06 21:14:40 srv bun[812]: http DELETE /api/sets/88 204 1ms
Oct 06 21:15:30 srv bun[812]: http PATCH /api/workouts/12 500 7ms {"notes":"felt strong"}   (err)
Oct 06 21:15:30 srv bun[812]: Error: boom                                                    (err)
Oct 06 21:15:30 srv bun[812]:     at WorkoutRepository.update (…)                            (err)
Oct 06 21:20:00 srv bun[812]: server stopping (SIGTERM)
```

The same lines from `bun start` in a terminal:

```
21:13:58 server gainz is running on http://localhost:3000/
21:13:58 server database: data/gainz.sqlite
21:13:58 server auth: off (GAINZ_PASSWORD_HASH is not set)
21:14:05 WARN auth wrong password
21:15:30 ERROR http PATCH /api/workouts/12 500 7ms {"notes":"felt strong"}
Error: boom
    at WorkoutRepository.update (…)
```

## Abstractions and Code Reuse

- `src/backend/shared/log.ts` - **new**
  - `type LogLevel = 'info' | 'warn' | 'error'`, `type LogSink = (level: LogLevel, text: string) => void`
  - `log.info(topic, message)`, `log.warn(topic, message)`, `log.error(topic, message, err?)` build
    `text = "<topic> <message>"`; when `err` is given, `"\n" + Bun.inspect(err, { colors: false })` is
    appended (stack, `cause`, an `AggregateError`'s `.errors`, a parse error's code frame)
  - `formatLines(level, text, { journald, now })` is a pure function that returns the output string,
    exported for its unit test:
    - `journald` true: `<6|4|3>` before every line
    - otherwise: `HH:MM:SS ` (local time), then `WARN ` or `ERROR ` on the first line; continuation
      lines go out unchanged
  - `isJournalStream(value: string | undefined, fd: number): boolean`, exported for its unit test:
    true only when `value` is `<dev>:<ino>` and equals `fstatSync(fd)`'s `dev` and `ino`
  - the default sink computes `journald = isJournalStream(process.env.JOURNAL_STREAM, 1)` once, on
    its first write. In journald mode it writes `formatLines(…) + '\n'` to `process.stdout` for every
    level. Otherwise it writes info to `process.stdout` and warn and error to `process.stderr`.
  - `setLogSink(sink): () => void` swaps the sink and returns a function that restores the previous one
- `src/backend/shared/log.test.ts` - **new**: formatting, prefixes on every line, `setLogSink` restore
- `src/backend/http/routing.ts`
  - `RouteHandler` type, `METHODS`, `isMethodMap` move here from `auth.facade.ts`
  - `wrapHandlers(table, label, wrap: (handler: RouteHandler) => RouteHandler): RouteTable`, the loop from
    `guard()`, which throws `` `${label}: ${method} ${path} is a static value and cannot be wrapped` ``
- `src/backend/http/access-log.ts` - **new**: `accessLog(table): RouteTable` via `wrapHandlers(table, 'access log', …)`;
  `describeBody(text): string` (redact, `not JSON`, truncate)
- `src/backend/http/access-log.test.ts` - **new**: over HTTP through `useServer()`, plus a server
  started on a hand-made table whose handler throws
- `src/backend/http/errors.ts` - `errorResponse` stops logging
- `src/backend/http/server.ts` - the `error` hook logs `unhandled error outside a route`, then calls `errorResponse`
- `src/backend/http/routes.ts` - `allRoutes` returns `accessLog({ … })`
- `src/backend/features/auth/auth.facade.ts` - `guard()` uses `wrapHandlers(table, 'auth guard', wrap)`; `login()` logs
- `src/backend/features/auth/internal/login-throttle.ts` - `log.warn('auth', …)`
- `src/backend/features/static/internal/transpile.ts` - `log.error('static', …, cause)`
- `src/backend/features/dev/internal/hub.ts` - `log.info('dev', …)`
- `src/backend/main.ts` - banner, migrations, shutdown, startup failure, uncaught handlers through `log`
- `src/backend/main.test.ts` - **new**: spawns `src/backend/main.ts` with `Bun.spawn`
- `src/backend/testing.ts` - `useLogs()`; `useServer()` returns `logs`; `waitForUrl` moves here from
  `src/scripts/build.test.ts`, so `main.test.ts` and `build.test.ts` share one stdout reader
- `src/scripts/build.test.ts` - imports `waitForUrl`; the "module that does not parse" test captures its
  `static could not transpile` line with `useLogs()`

`testing.ts` must not be imported by production code, so `log.ts` stays independent of it, and
`useLogs()` uses only `setLogSink`.

## Logging & Observability

This plan is the logging change. The full catalog:

| topic    | level | text                                                           | source                       |
| -------- | ----- | -------------------------------------------------------------- | ---------------------------- |
| `http`   | info  | `<METHOD> <path+query> <status> <ms>ms[ <body>]`               | access log, `/api` and < 500 |
| `http`   | error | same, then the stack when a throw caused it                    | access log, any route ≥ 500  |
| `http`   | error | `unhandled error outside a route` + stack                      | `Bun.serve` `error` hook     |
| `auth`   | info  | `login`                                                        | `AuthFacade.login()`         |
| `auth`   | warn  | `wrong password`                                               | `AuthFacade.login()`         |
| `auth`   | warn  | `login locked for <n> s after <m> failed attempts`             | `LoginThrottle.failed()`     |
| `server` | info  | `gainz is running on <url>`, `database: …`, `auth: …`, `hot reload: on` | `main.ts` banner     |
| `server` | info  | `stopping (SIGTERM)` / `stopping (SIGINT)`                     | `main.ts` shutdown           |
| `server` | error | `GAINZ_PASSWORD_HASH is not an argon2 or bcrypt hash; …`       | `main.ts`, exit 1            |
| `server` | error | `failed to start` + stack                                      | `main.ts`, exit 1            |
| `server` | error | `uncaught exception` / `unhandled rejection` + stack           | `main.ts`, exit 1            |
| `db`     | info  | `applied <migration>`                                          | `main.ts` `onMigration`      |
| `static` | error | `could not transpile <path>` + cause                           | `transpile.ts`               |
| `dev`    | info  | `hot reload watching <dir>/` / `hot reload idle`               | `hub.ts`                     |

Never logged: cookies, headers, `password` values (redacted), and non-JSON bodies (only their size).

## Implementation

### Phase 1: Logger and lifecycle

Dependencies: None

Add the logger and its test sink, and move every existing `console.*` call in `src/backend/` onto
it. Then add the missing lifecycle lines: shutdown, startup failure, uncaught errors.

**Tasks**:

- [x] Create `src/backend/shared/log.ts` with `LogLevel`, `LogSink`, `log`, `formatLines`,
      `isJournalStream` and `setLogSink` as described under "Abstractions and Code Reuse". Prefixes are
      `info → <6>`, `warn → <4>`, `error → <3>`. Add a doc comment explaining that journald reads `<N>`
      per line and that `JOURNAL_STREAM` is compared to stdout's `dev:ino` because terminals can
      inherit it.
      ```ts
      export function setLogSink(next: LogSink): () => void {
        const previous = sink;
        sink = next;
        return () => {
          sink = previous;
        };
      }
      ```
- [x] Create `src/backend/shared/log.test.ts` with these tests:
  - [x] journald mode prefixes every line of a multi-line error text with `<3>`
  - [x] journald mode uses `<6>` for info and `<4>` for warn
  - [x] terminal mode starts with `HH:MM:SS`, adds `WARN`/`ERROR` only on the first line, and leaves continuation lines unchanged
  - [x] `log.error(topic, message, err)` appends the error's stack
  - [x] an error's `cause` and an `AggregateError`'s inner messages appear in the text (build the
        `AggregateError` from a real `Bun.Transpiler` parse failure)
  - [x] a non-`Error` value is appended
  - [x] `isJournalStream` is true for `` `${st.dev}:${st.ino}` `` of an `fstatSync` on an open temp
        file's fd, false for another `dev:ino`, and false for `undefined` or garbage
  - [x] the function returned by `setLogSink` restores the previous sink
- [x] Add `useLogs(): () => LogLine[]` to `src/backend/testing.ts`, with `LogLine = { level: LogLevel; text: string }`.
      It registers a `beforeEach` that installs a capturing sink and an `afterEach` that restores the previous one.
- [x] Make `useServer()` call `useLogs()` *after* registering its own `beforeEach`/`afterEach`. Bun runs
      `afterEach` hooks in registration order, so the server stops while capture is still on. Return
      `logs` next to `api`, `post` and `patch` (extend `TestServer`), with a comment explaining the order.
- [x] Move `waitForUrl` from `src/scripts/build.test.ts` into `src/backend/testing.ts` unchanged, and import
      it in `build.test.ts`
- [x] `src/backend/main.ts`:
  - [x] Wrap the body of `main()` in `try { … } catch (err) { log.error('server', 'failed to start', err); process.exit(1); }`
  - [x] Send the bad-hash message through `log.error('server', …)`, keeping its text
  - [x] Log migrations as `log.info('db', \`applied …\`)`
  - [x] Turn the banner into `log.info('server', …)` lines without the two-space indent
  - [x] Register `uncaughtException` and `unhandledRejection` handlers that call
        `log.error('server', 'uncaught exception' | 'unhandled rejection', err)` and then `process.exit(1)`.
        Startup is synchronous and covered by the try/catch, so these handlers matter for what runs
        after it: request callbacks outside the route wrappers, timers, sockets.
  - [x] Make `shutdown(signal)` log `stopping (${signal})` before `server.stop()`
- [x] Create `src/backend/main.test.ts`, which spawns the entry point:
  - [x] use `Bun.spawn([process.execPath, 'src/backend/main.ts'], …)` with piped stdout/stderr, as
        `build.test.ts` does
  - [x] pass `env` built from `process.env` with `JOURNAL_STREAM` deleted, plus `PORT: '0'` and
        `GAINZ_DB: join(dir(), 'gainz.sqlite')`, with `dir` from `useTempDir()`
  - [x] read the URL with the shared `waitForUrl`
  - [x] kill the child and `await proc.exited` in each test's own `try`/`finally`. Doing it in a hook
        would let `useTempDir()`'s `afterEach`, which runs first, try to remove a directory whose SQLite
        files the child still holds open, and fail with EBUSY on Windows.
  - Tests:
  - [x] stdout matches `/^\d\d:\d\d:\d\d server gainz is running on /m`
  - [x] with `JOURNAL_STREAM=8:1234`, which doesn't match the child's piped stdout, stdout still uses the
        terminal format and has no `<6>`. The journald format itself is pinned by `log.test.ts`.
  - [x] `GAINZ_PASSWORD_HASH=nope` exits with 1, and stderr contains `ERROR server GAINZ_PASSWORD_HASH is not an argon2 or bcrypt hash`
  - [x] a `GAINZ_DB` that names the temp directory itself, which SQLite can't open as a file (checked on
        Windows; CANTOPEN on Linux), exits with 1, and stderr contains `ERROR server failed to start`
        followed by the error
  - [x] `test.skipIf(process.platform === 'win32')`: `proc.kill('SIGTERM')` makes the child exit with 0
        after printing `server stopping (SIGTERM)` (Windows can't deliver SIGTERM to a handler)
- [x] `src/backend/http/errors.ts`: replace `console.error('Unhandled error:', err)` with
      `log.error('http', 'unhandled error', err)`. This is temporary; Phase 2 moves the logging to the access log.
- [x] Update `src/backend/http/errors.test.ts`: use `useLogs()` in place of `spyOn(console, 'error')` and
      assert one error line starting with `http unhandled error`
- [x] `login-throttle.ts:43`: `log.warn('auth', \`login locked for …\`)` with the same text
- [x] `transpile.ts:29`: `log.error('static', \`could not transpile ${path}\`, cause)`, dropping the `gainz: ` prefix
- [x] `hub.ts:36,50`: `log.info('dev', 'hot reload watching …/')` and `log.info('dev', 'hot reload idle')`, dropping `gainz: `
- [x] In the existing `auth.routes.test.ts` lockout test, assert with `toContainEqual` that `logs()` holds
      `{ level: 'warn', text: 'auth login locked for 60 s after 5 failed attempts' }`, using the count
      and duration the test's own clock produces. Use `toContainEqual` because Phase 2's `http` lines,
      whichever phase lands first, will sit between them.
- [x] `src/scripts/build.test.ts`: the "a module that does not parse" test goes through `build()` →
      `transpileModule()` and would print `ERROR static could not transpile …`. Call `useLogs()` in its
      `describe` and assert the line with `toContainEqual`.
- [x] `dev.routes.test.ts`: `useServer()` already captures `dev hot reload watching`. `detach()` logs
      `dev hot reload idle` on a later tick after the socket closes, so in each test that closes a
      socket, wait until `logs()` holds that line (poll with `Bun.sleep(10)`, at most 1 s) before the test
      ends, so the line can't escape after the sink is restored.
- [x] Search the other `*.test.ts` files for anything that triggers a log call outside `useServer()`
      (static transpile failures, migrations through `openDatabase` with a callback), and give each
      one `useLogs()`
- [x] docs/backend.md:
  - [x] add `shared/log.ts` to the opening paragraph's list of what sits outside `features/`
  - [x] add a `## Logging (`shared/log.ts`)` section before `## Authentication`. It covers:
    - the `log.<level>(topic, message, err?)` API and the topic convention
    - the journald prefix, `JOURNAL_STREAM` and why every line is prefixed
    - stdout versus stderr
    - the terminal format
    - `setLogSink`/`useLogs()`, and that the suite is silent
    - that logging happens at the edges (`main.ts`, `http/`, the auth facade and throttle, transpile, hub)
    - the catalog of lines (the table from this plan, kept in step with the code)
  - [x] in the login-throttle paragraph, change "logged with `console.warn`" to "logged with `log.warn`"
  - [x] in the test paragraph:
    - [x] change "eight exceptions" to "nine" and add `shared/log.test.ts`, which pins the output
          format, the journald prefix and the `JOURNAL_STREAM` check
    - [x] next to the `src/scripts/build.test.ts` sentence, add that `main.test.ts` likewise runs the
          entry point in a child process to check the banner, the startup failures and the shutdown
          line, and so isn't counted among the exceptions either
    - [x] mention `useLogs()` and that `useServer()` captures logs, so the suite prints nothing
- [x] docs/deployment.md, after the `journalctl` line in "Server setup": add that gainz tags its lines with
      syslog priorities, so `sudo journalctl _SYSTEMD_USER_UNIT=gainz.service -p warning` shows only
      warnings and errors and `-p err` only errors, and that `-f` follows the log

**Automated Verification**:

- [x] `bun test --parallel src/backend/shared/log.test.ts` passes
- [x] `bun test --parallel src/backend/main.test.ts` passes
- [x] `bun test --parallel src/scripts/build.test.ts` passes (banner regex and `hot reload: on` check)
- [x] `bun test --parallel` passes
- [x] `bun test --parallel 2>&1 | Select-String -Pattern '^(<[346]>)?(\d\d:\d\d:\d\d )?(WARN |ERROR )?(http|auth|server|db|static|dev) '`
      prints nothing (no output is the pass condition)
- [x] `git grep -n "console\." -- src/backend ":!*.test.ts"` prints nothing
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

### Phase 2: Access log

Dependencies: Phase 1

Add the request wrapper that logs every API call with its body, takes over 500 logging with the
request attached, and logs any route's 5xx. The table-walking loop moves from the guard into
`http/routing.ts` so both wrappers share it.

**Tasks**:

- [x] `src/backend/http/routing.ts`: move `RouteHandler`, `METHODS` and `isMethodMap` here from
      `auth.facade.ts`, and add `wrapHandlers(table, label, wrap)`, the loop from `guard()`. Bare
      functions and every verb of a method map are wrapped. A static value throws
      `` `${label}: ${path} is a static value and cannot be wrapped` ``, with `${method} ` before
      `${path}` inside a method map.
- [x] `auth.facade.ts`: make `guard()` `return wrapHandlers(table, 'auth guard', wrap)` while auth is on, and
      remove the moved helpers
- [x] Create `src/backend/http/access-log.ts`:
      ```ts
      const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
      const MAX_BODY = 1024;

      /** Wraps every handler so each /api request, and any response ≥ 500, is logged with its duration. */
      export function accessLog(table: RouteTable): RouteTable {
        return wrapHandlers(table, 'access log', (handler) => async (req, server) => {
          const start = performance.now();
          const copy = WRITES.has(req.method) ? req.clone() : null;
          let res: Response | undefined;
          let error: unknown;
          try {
            res = await handler(req, server);
          } catch (err) {
            error = err;
            res = errorResponse(err);
          }
          // undefined = a WebSocket upgrade (/dev/ws); nothing to log
          if (res !== undefined) { /* decide, build the line, log */ }
          return res;
        });
      }
      ```
  - [x] The line is `${req.method} ${url.pathname}${url.search} ${res.status} ${Math.round(ms)}ms`, plus
        ` ${describeBody(text)}` when `copy` is set and its text isn't empty
  - [x] It is logged when `url.pathname === '/api' || url.pathname.startsWith('/api/') || res.status >= 500`,
        at `log.error('http', line, error)` for 500 and up, otherwise `log.info('http', line)`
  - [x] `describeBody(text)` parses the text as JSON:
    - a parse failure returns `[${byteLength} bytes, not JSON]`
    - otherwise it replaces the value of every `password` key at any depth (objects in arrays
      included) with `"[redacted]"` and calls `JSON.stringify` on the result
    - output longer than `MAX_BODY` becomes `text.slice(0, MAX_BODY) + `…(+${rest} more)``
  - [x] the body text is read after the handler has run, and only when the line will be logged, so it
        never delays the handler, and a POST to a static path (the 405) is never read
- [x] `src/backend/http/routes.ts`: make `allRoutes` return `accessLog({ ...metaRoutes(auth), …, ...staticRoutes() })`,
      and extend its doc comment to mention the access log as the outermost wrapper
- [x] `src/backend/http/errors.ts`: `errorResponse` no longer logs. It renders an `HttpError`, or a 500
      for anything else, and its doc comment says the access log does the logging.
- [x] `src/backend/http/server.ts`: `error: (err) => { log.error('http', 'unhandled error outside a route', err); return errorResponse(err); }`,
      with a comment that the access log normally catches first
- [x] `src/backend/http/errors.test.ts`: the 500 test asserts `logs()` is empty
- [x] Create `src/backend/http/access-log.test.ts`. Most tests use `useServer()` and filter `logs()` to
      the `http ` lines:
  - [x] `GET /api/health` logs `http GET /api/health 200 <n>ms` at info, matched with a regex on `\d+ms`
  - [x] a query string appears in the line
  - [x] a `POST` that creates an exercise logs its JSON body
  - [x] a `PATCH` with a validation error logs at info with status 400 and the body
  - [x] a `DELETE` without a body logs no trailing body
  - [x] `POST /api/auth/login` logs `{"password":"[redacted]"}`
  - [x] a nested `password` key in a body is redacted
  - [x] a non-JSON body logs `[<n> bytes, not JSON]` and never the raw text
  - [x] a body over 1024 characters is cut and ends with `…(+<n> more)`
  - [x] a static request such as `GET /` logs nothing, and neither does `POST /` (405)
  - [x] `GET /api/nope` (the /api 404) logs at info with 404
  - [x] with a server started directly on `Bun.serve({ port: 0, routes: accessLog({ '/api/boom': () => { throw new Error('boom'); }, '/broken': () => new Response('x', { status: 500 }) }) })`
        and stopped in `afterEach`:
    - [x] `/api/boom` answers 500 `{ error: 'Internal server error' }`, and one error entry's text holds the line and `Error: boom`
    - [x] `/broken` logs at error with no stack
  - [x] `accessLog({ '/x': new Response('') })` throws `access log: /x is a static value and cannot be wrapped`
- [x] docs/backend.md:
  - [x] add `access-log.ts` to the opening paragraph's `http/` list
  - [x] in the error-handling paragraph, say that the access log in `http/access-log.ts` is the outermost
        wrapper: it catches every throw from a route, answers through `errorResponse`, and logs it with the
        request; the `error` hook in `http/server.ts` is only a safety net for errors outside a route
  - [x] in "Logging", describe the access-log rules: coverage, bodies, redaction, truncation, 5xx
  - [x] in the auth guard paragraph, mention that the guard is built on `wrapHandlers()` in `http/routing.ts`,
        shared with the access log
  - [x] in the test paragraph, change the wording about `http/errors.test.ts`. The 500 branch is now
        covered over HTTP by `access-log.test.ts` through a hand-made route table, and `errors.test.ts`
        pins that `errorResponse` itself renders and doesn't log.

**Automated Verification**:

- [x] `bun test --parallel src/backend/http/access-log.test.ts` passes
- [x] `bun test --parallel src/backend/http/errors.test.ts` passes
- [x] `bun test --parallel src/backend/features/auth/auth.routes.test.ts` passes (guard on `wrapHandlers`)
- [x] `bun test --parallel` passes
- [x] the Phase 1 `Select-String` check over `bun test --parallel 2>&1` prints nothing
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

### Phase 3: Auth events

Dependencies: Phase 1

Log the outcome of every password check.

**Tasks**:

- [x] `AuthFacade.login()` in `auth.facade.ts`:
  - [x] on a wrong password, call `log.warn('auth', 'wrong password')` before `throttle.failed()`, so the
        lockout line follows it
  - [x] after `throttle.succeeded()`, call `log.info('auth', 'login')`
  - [x] log nothing while auth is off (no password is checked) or locked (the 429 shows up in the access log)
- [x] `auth.routes.test.ts`. Each assertion filters `logs()` to lines starting with `auth `, because
      Phase 2's `http` lines may interleave:
  - [x] a right password logs `auth login` at info
  - [x] a wrong one logs `auth wrong password` at warn
  - [x] the fifth wrong one logs `auth wrong password` followed by the lockout line
  - [x] a locked attempt logs neither
- [x] docs/backend.md "Authentication": a sentence that each accepted and each rejected password is
      logged (`auth login` and `auth wrong password`), and that the password itself never is, because the
      access log redacts it

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/auth/auth.routes.test.ts` passes
- [x] `bun test --parallel` passes
- [x] the Phase 1 `Select-String` check over `bun test --parallel 2>&1` prints nothing
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

**Manual Verification**:

- [x] After deploying, `sudo journalctl _SYSTEMD_USER_UNIT=gainz.service -f` on the server shows:
  - an `http` line for each API call the app makes
  - a deliberate wrong password as `auth wrong password`, highlighted as a warning
  - `-p warning` showing only warnings and errors

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- `isJournalStream` reads `fstatSync(fd, { bigint: true })`: on Windows an inode number exceeds what
  a double holds exactly, so `ino + 1` compared equal to `ino` and the test's negative case failed.
- `Bun.inspect` renders an `Error` as `error: boom` with a code frame, not `Error: boom`, so
  `access-log.test.ts` asserts `error: boom`. A plain string passed as `err` is appended as it is,
  not quoted as `Bun.inspect` would.
- `dev.routes.test.ts` does not use `useServer()` (it needs `GAINZ_DEV` set before the table is
  built), so it calls `useLogs()` itself and waits for `dev hot reload idle` in its socket test.
- `main.test.ts` also strips `GAINZ_PASSWORD_HASH` and `GAINZ_DEV` from the child's environment, so
  a developer's shell cannot change what the banner says.
- `waitForUrl`'s messages now say "the server" rather than "the built server", since `main.test.ts`
  shares it.
- The access log types its response as `Awaited<ReturnType<RouteHandler>>` and tests
  `res instanceof Response`, because a handler may return `void` for an upgrade.
- The hand-made `Bun.serve` in `access-log.test.ts` passes a no-op `websocket`, which Bun's types
  require for a `RoutesWithUpgrade` table.
- Once, under full-suite load, `dev.routes.test.ts`'s existing 2 s wait for a watcher event timed
  out; it passed in every run after, and that wait predates this change.

## References

- Planning conversation, 2026-10-06: scope (operations view), access-log coverage, journald
  priorities, test sink, bodies on every write, query strings
- `docs/agents/plans/2026-10-05-cookie-login.md`: the startup `auth:` line and the lockout warning
- systemd.exec(5): `SyslogLevelPrefix=` (default yes) and `$JOURNAL_STREAM`
- `src/backend/features/auth/auth.facade.ts:83-120`: the guard's table walk that `wrapHandlers()` comes from
- `src/scripts/build.test.ts:19,86`: the banner regex and the `hot reload: on` check
- `docs/deployment.md:86`: how the server log is read
