---
date: 2026-10-05T13:57:20.210410+00:00
git_commit: b55db9ee49f7abf2ceeb72964c6c785dfb487bec
branch: main
topic: 'Cookie login'
tags: [plan, auth, backend, frontend, deployment]
status: implemented
---

# PLAN: Cookie login

gainz has no authentication; the README asks for a reverse proxy with auth in front of it. HTTP
Basic Auth is the obvious proxy answer, but an app added to a phone's home screen re-prompts for it
on almost every launch, because browsers keep Basic credentials only for the browser session (and
iOS standalone mode handles the prompt badly). This plan puts a password login into the app that
sets a long-lived, signed, `HttpOnly` cookie, so a phone logs in once and stays logged in. Turning
gainz into an installable PWA (manifest, icons, service worker) is a separate, later plan.

## Acceptance Criteria

- With `GAINZ_PASSWORD_HASH` unset (or empty), everything behaves exactly as today; the startup log
  says `auth: off` and `GET /api/health` reports `"auth": false`.
- With it set, every `/api/*` request except `/api/health`, `/api/auth/login`, `/api/auth/logout`
  and the `/api` 404 catch-all answers `401 { "error": "Not logged in" }` without a valid
  `gainz_session` cookie. Pages, modules and vendor files stay public.
- `POST /api/auth/login` with `{ "password": "<right>" }` answers `204` and sets
  `gainz_session=<expiresAt>.<signature>; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`,
  where the signature is HMAC-SHA256 over `gainz_session.<expiresAt>`, keyed by
  `GAINZ_PASSWORD_HASH`.
- A guarded request whose cookie was issued more than a day ago gets a fresh 90-day cookie on its
  response. An expired, tampered, malformed or old-password cookie is a 401.
- After 5 consecutive wrong passwords, login answers `429` with `Retry-After` for 60 s, doubling with
  each further failure up to 3600 s. A correct login or a restart resets the count. Valid cookies
  keep working throughout.
- `POST /api/auth/logout` answers `204` and expires the cookie.
- A malformed `GAINZ_PASSWORD_HASH` (not an argon2 or bcrypt hash) stops the server at startup with
  a clear message.
- In the app, any 401 from the API sends you to `/login?next=<path>` without an error toast. A
  successful login returns you to `next` (same-origin paths only) or to `/`. A wrong password shows
  inline on the login page.
- On `/login` the header shows only the brand and the theme toggle. Elsewhere a "Log out" button
  ends both link lists.
- `bun run hash-password` prompts twice without echoing and prints an argon2id hash.
- In production the hash comes from `/home/gainz/app/gainz.env`. The service does not start
  without that file, and `gainz-deploy` rolls back a release that reports `"auth": false`.

## Technical Key Decisions and Tradeoffs

1. **Signed stateless cookie, keyed by the password hash:** `<expiresAt>.<base64url HMAC-SHA256>`,
   no sessions table and no second secret.
   - Why: the least code and configuration. Changing the password invalidates every cookie, which
     is the "log out everywhere" for a lost phone.
   - Impact: logout only clears the cookie in that browser. A copied cookie stays valid until it
     expires or the password changes.
2. **Auth is off when the hash is unset:** works like `GAINZ_DEV`.
   - Why: `bun start`, `bun run seed` and the ~20 existing route test files stay untouched.
   - Impact: production is protected twice, by `EnvironmentFile=` without `-` (the service won't
     start without the file) and by the deploy script's `auth: true` check.
3. **Only `/api/*` is guarded, by wrapping the data features' route tables in `allRoutes()`:** the
   static, meta, dev and auth routes stay public. Logout is public too, since all it does is expire
   a cookie.
   - Why: the frontend code is public in the repository anyway, and a guarded shell would need a
     hand-kept allowlist of the modules the login page imports.
   - Impact: no middleware layer. `AuthFacade.guard(table)` returns the same table with every
     handler wrapped.
4. **The login is an SPA view:** a new frontend `auth` feature with `gz-login` at `/login`, which
   posts JSON.
   - Why: consistent with the rest of the app.
   - Impact: `http.ts` (foundation, which may not import `app/`) dispatches a `gz:unauthorized`
     event on a 401. `gz-app` listens for it and navigates, and `toastError()` stays silent for 401s.
5. **90-day sliding session, renewed at most once a day:** the issue time is `expiresAt − 90 days`,
   and a guarded response re-sets the cookie once that is more than a day ago.
6. **Global in-memory login backoff:** no `X-Forwarded-For` trust, since behind the proxy every
   client is `127.0.0.1`.
   - Impact: someone hammering the login can delay your next login, but never a phone that already
     holds a cookie.
7. **Configuration is passed in explicitly:** `startServer(db, port, auth)`. Only `main.ts` reads
   `GAINZ_PASSWORD_HASH`.
   - Why: each test file picks its own hash and clock through `useServer({ auth })` without changing
     `process.env`.
   - Impact: the throttle and the cookie expiry read an injectable `now()`, so backoff and expiry
     are tested without waiting.
8. **The cookie is always `Secure`:** HTTPS ends at a reverse proxy in production, and browsers
   accept `Secure` cookies from `http://localhost`.
   - Impact: logging in from another device over plain HTTP on the LAN won't stick. That setup is
     out of scope.
9. **The CSRF protection is `SameSite=Lax` plus JSON request bodies:** a cross-site form can't send
   `application/json`, and a cross-site `fetch` doesn't carry a Lax cookie. No token is needed.

## Current State

```
Bun.serve({ routes: allRoutes(db), error: errorResponse })      src/backend/http/server.ts:8
 ├─ /api/health, /api, /api/*      metaRoutes()                  public, deploy health check
 ├─ /api/stats/…                   statsRoutes(db)
 ├─ /api/exercises/…               exerciseRoutes(db)
 ├─ /api/workouts/…                workoutRoutes(db)
 ├─ /api/sets/…                    setRoutes(db)
 ├─ /dev/ws                        devRoutes()                   GAINZ_DEV=1 only
 └─ /vendor/…, /*                  staticRoutes()                frontend + SPA fallback
```

- `src/backend/http/routes.ts:21` spreads the tables together. There is no middleware and no `fetch`
  fallback.
- `src/backend/http/errors.ts:18` exports `badRequest`, `notFound` and `conflict`, and `errorResponse`
  turns an `HttpError` into `{ error, details }`.
- `src/backend/main.ts` reads `PORT` and logs `database:` (and `hot reload: on`).
- `src/backend/testing.ts:30`: `useServer()` starts `startServer(openDatabase(':memory:'), 0)` per
  test.
- `src/frontend/http/http.ts:9`: one `request()` for every API call, throwing `ApiError(message,
  status)`.
- `src/frontend/ui/view.ts:59`: `GzView.reload()` toasts every error except a 404, through `toastError`
  (`src/frontend/ui/toast.ts:24`).
- `src/frontend/app/gz-app.component.ts`: the shell. `src/frontend/app/gz-header.component.ts`:
  the brand, `ul.links`, `ot-dropdown.menu` and the theme toggle.
- `deploy/gainz.service` sets no environment. `deploy/gainz-deploy:43` `healthy()` curls
  `/api/health` and rolls back on failure.

## Desired End State

```
startServer(db, port, auth: AuthOptions)
 └─ allRoutes(db, auth)
     const facade = createAuthFacade(auth)          one instance: throttle state + key
     ├─ metaRoutes(facade)                          /api/health → { status, app, auth }
     ├─ authRoutes(facade)                          POST /api/auth/login, POST /api/auth/logout
     ├─ facade.guard({                              every handler wrapped:
     │     ...statsRoutes(db),                        no/invalid cookie  → throw unauthorized()
     │     ...exerciseRoutes(db),                     valid               → handler(req)
     │     ...workoutRoutes(db),                      issued > 1 day ago  → + Set-Cookie (renewed)
     │     ...setRoutes(db) })                        auth off            → handler(req) untouched
     ├─ devRoutes()
     └─ staticRoutes()

Browser:
 view ─► GET /api/… ─► 401 ─► http.ts: dispatch 'gz:unauthorized', throw ApiError(401)
                                  │                     └─► toastError: silent for 401
                                  ▼
            gz-app: navigate('/login?next=' + encodeURIComponent(path + search))
                                  ▼
            gz-login: authFacade.login(pw) ─► 204 + Set-Cookie ─► navigate(nextPath(search, origin))
```

Login page (narrow screen):

```
┌──────────────────────────────────┐
│ gainz                         ◐  │   ← header: brand + theme toggle only
├──────────────────────────────────┤
│                                  │
│  Log in                          │
│                                  │
│  Password                        │
│  ┌────────────────────────────┐  │
│  │ ••••••••                   │  │
│  └────────────────────────────┘  │
│  Wrong password.                 │   ← .error-text, only after a failure
│                                  │
│  [          Log in           ]   │
└──────────────────────────────────┘
```

Header elsewhere:

```
wide:    gainz lifting log    Dashboard  Workouts  Exercises  Log out │ ◐
narrow:  gainz                                                   ◐ │ ☰
                                                       ┌─────────────┐
                                                       │ Dashboard   │
                                                       │ Workouts    │
                                                       │ Exercises   │
                                                       │ Log out     │
                                                       └─────────────┘
```

## Abstractions and Code Reuse

- `src/shared/dto/`
  - `auth.ts` - new: `LoginRequestDto { password: string }`
  - `meta.ts` - `HealthDto` gains `auth: boolean`
- `src/backend/http/`
  - `errors.ts` - add `unauthorized = (message = 'Not logged in') => new HttpError(401, message)`
  - `routes.ts` - `allRoutes(db, auth)`: build one `AuthFacade`, pass it to `metaRoutes`, spread
    `authRoutes(facade)`, wrap the four data tables in `facade.guard({...})`
  - `server.ts` - `startServer(db, port, auth: AuthOptions = { passwordHash: null })`
- `src/backend/features/auth/` (new feature)
  - `auth.facade.ts` - `AuthOptions { passwordHash: string | null; now?: () => number }`,
    `AuthFacade`, `createAuthFacade(options)`, `isPasswordHash(value)`
    - `enabled()` - `passwordHash !== null`
    - `login(dto)` - validates first, whether or not auth is on (`password` must be a non-empty
      string of at most 1000 characters, else `badRequest`). With auth off it then returns
      `{ kind: 'ok', cookie: null }`. With auth on it calls `throttle.begin()`, which returns
      `{ kind: 'locked', retryAfter }` when locked and otherwise reserves the attempt synchronously,
      before any `await`. Then `await Bun.password.verify` runs. A success calls `throttle.succeeded()`
      and returns `{ kind: 'ok', cookie }`. A failure keeps the reservation as a failure and throws
      `unauthorized('Wrong password')`.
    - `logoutCookie()` - the expired cookie (`Max-Age=0`, same attributes)
    - `guard(table: RouteTable): RouteTable` - wraps every handler, either a bare function or each
      verb of a method map, and forwards both `(req, server)`. A static `Response` value (none
      exists in the data tables) would bypass the guard, so `guard` throws at startup if it meets
      one.
  - `auth.routes.ts` - `authRoutes(facade)`: `/api/auth/login` `{ POST }`, `/api/auth/logout`
    `{ POST }`
  - `auth.routes.test.ts` - end-to-end tests (below)
  - `internal/auth.controller.ts` - `AuthController.login(req)`: `readJsonObject` →
    `translateToLoginRequestDto` → `facade.login` → `204` with `Set-Cookie`, or
    `json({ error }, 429, { 'Retry-After': String(seconds) })`. `logout()`: `204` with the expired
    cookie.
  - `internal/auth.translator.ts` - `translateToLoginRequestDto(body)`: cast only, like every
    translator
  - `internal/session-cookie.ts` - `COOKIE_NAME = 'gainz_session'`, `SESSION_MS = 90 days`,
    `RENEW_AFTER_MS = 1 day`, `issue(key, now): string` (the `Set-Cookie` value, built with
    `new Bun.Cookie(...).serialize()`), `check(key, value, now): 'valid' | 'renew' | 'invalid'`.
    The HMAC uses `new Bun.CryptoHasher('sha256', key)` over `gainz_session.<expiresAt>` and is
    compared with `crypto.timingSafeEqual` after a length check.
  - `internal/login-throttle.ts` - `LoginThrottle(now)`: `begin(): { kind: 'locked'; retryAfter: number } | { kind: 'go' }`
    (seconds) and `succeeded()`. `begin()` counts the attempt as a failure up front, so concurrent
    guesses cannot all slip past the check while `verify` is pending. `succeeded()` resets the count.
    `FREE_ATTEMPTS = 5`, `BASE_LOCK_S = 60`, `MAX_LOCK_S = 3600`.
- `src/backend/features/meta/`
  - `meta.routes.ts` - `metaRoutes(auth: AuthFacade)`
  - `internal/meta.controller.ts` - `MetaController(auth)`; `health()` adds `auth: auth.enabled()`
- `src/backend/main.ts` - read `GAINZ_PASSWORD_HASH` (empty → null), exit 1 if it fails
  `isPasswordHash`, pass `{ passwordHash }`, log `auth:`
- `src/backend/testing.ts` - `useServer(options: { auth?: AuthOptions } = {})`, passed to
  `startServer`
- `src/scripts/hash-password.ts` - new entry point, plus `hash-password.test.ts`
- `src/frontend/http/`
  - `errors.ts` - export `UNAUTHORIZED_EVENT = 'gz:unauthorized'`
  - `http.ts` - on `response.status === 401` dispatch `new Event(UNAUTHORIZED_EVENT)` on
    `globalThis` (which is `window` in a browser; `http.test.ts` runs without `useDom()`, where
    `window` does not exist) before throwing
- `src/frontend/ui/toast.ts` - `toastError` returns early for an `ApiError` with status 401
- `src/frontend/features/auth/` (new feature)
  - `auth.routes.ts` - `authRoutes`: `/^\/login\/?$/`, no `nav`
  - `auth.facade.ts` - `AuthFacade.login(password)`, `logout()`; `authFacade` singleton
  - `internal/auth.api.ts` - `post('/auth/login', { password })`, `post('/auth/logout')`
  - `internal/next-path.ts` - `nextPath(search: string, origin: string): string`. It resolves
    `next` with `new URL(next, origin)` and returns `url.pathname + url.search` only when
    `url.origin === origin` and the pathname is not `/login`; otherwise it returns `/`. Resolving
    the URL instead of checking a prefix also rejects `/\evil.example` and `/<TAB>/evil.example`.
  - `gz-login.component.ts` + `.css` - a `GzElement` (not a `GzView`: it loads nothing)
- `src/frontend/app/`
  - `routes.ts` - spread `authRoutes` last
  - `gz-app.component.ts` - listen for `UNAUTHORIZED_EVENT` on `window`
  - `gz-header.component.ts` + `.css` - a `login` class on `nav` while on `/login`, and a Log out
    button in both lists

## Logging & Observability

Startup, auth on / off:

```
gainz is running on http://localhost:3000/
  database: data/gainz.sqlite
  auth: on
```

```
  auth: off (GAINZ_PASSWORD_HASH is not set)
```

Malformed hash (exit code 1):

```
GAINZ_PASSWORD_HASH is not an argon2 or bcrypt hash; create one with `bun run hash-password`
```

A lockout, logged once each time it starts (`console.warn`, so it shows in the journal):

```
login locked for 60 s after 5 failed attempts
```

`GET /api/health` → `{ "status": "ok", "app": "gainz", "auth": true }`. The deploy script reads it.

## Implementation

### Phase 1: Backend auth gate

Dependencies: None

After this phase the API is protected whenever `GAINZ_PASSWORD_HASH` is set and can be driven with
curl. With the variable unset nothing observable changes except the health body and the startup line.

**Tasks**:

- [x] `src/shared/dto/auth.ts`: add `LoginRequestDto`. `src/shared/dto/meta.ts`: add `auth: boolean`
      to `HealthDto`.
- [x] `src/backend/http/errors.ts`: add `unauthorized(message = 'Not logged in')`.
- [x] `features/auth/internal/session-cookie.ts`: `issue` / `check` as described above. The cookie
      value is `${expiresAt}.${signature}`, with `expiresAt` in epoch ms and `signature` base64url.
      `check` answers `'invalid'` for a missing, malformed, tampered or expired value, `'renew'` when
      `now - (expiresAt - SESSION_MS) > RENEW_AFTER_MS`, and `'valid'` otherwise. Attributes:
      `path: '/'`, `httpOnly: true`, `secure: true`, `sameSite: 'lax'`, `maxAge: SESSION_MS / 1000`.
- [x] `features/auth/internal/login-throttle.ts`: count consecutive failures, with `begin()`
      reserving each attempt as a failure synchronously. From the 5th failure on, each one locks for
      `min(60 · 2^(failures − 5), 3600)` s and logs the lockout line. While locked, `begin()` returns
      the remaining whole seconds, rounded up. `succeeded()` resets.
- [x] `features/auth/auth.facade.ts`: `AuthOptions`, `isPasswordHash` (`/^\$(argon2(id|i|d)|2[aby])\$/`),
      and `AuthFacade` with `enabled`, `login`, `logoutCookie` and `guard`. The guarded wrapper reads
      `req.cookies.get(COOKIE_NAME)`. On `'invalid'` it throws `unauthorized()`. On `'renew'` it awaits
      the handler and appends `Set-Cookie` with `issue(...)` to the response. When auth is off,
      `guard` returns the table unchanged. Type the wrapper against `RouteTable`'s value shapes. If
      Bun's types make that awkward, keep the one unavoidable cast inside `guard` with a comment, as
      `testing.ts` does for `body()`.
- [x] `features/auth/internal/auth.translator.ts`, `internal/auth.controller.ts`, `auth.routes.ts` as
      described above. A lockout answers before the password is verified, so a locked login costs no
      hashing.
- [x] `features/meta`: `metaRoutes(auth)` and `MetaController(auth)`, with health reporting
      `auth: auth.enabled()`.
- [x] `src/backend/http/routes.ts` and `server.ts`: thread `AuthOptions` through, as in the Desired
      End State, and update the registry's doc comment to name the guard.
- [x] `src/backend/main.ts`: read and validate the hash, pass it, and log the `auth:` line.
- [x] `src/backend/testing.ts`: `useServer({ auth })`.
- [x] `src/scripts/hash-password.ts`: when stdin is a TTY, prompt `Password: ` and `Again: ` on
      stderr, reading in raw mode with no echo (Enter ends, Backspace deletes, Ctrl+C exits 130).
      When it isn't a TTY, read the first line of stdin, so it can be piped. Refuse an empty password
      or a mismatch (exit 1). Print `await Bun.password.hash(pw)` (argon2id by default) to stdout.
- [x] `package.json`: add `"hash-password": "bun run src/scripts/hash-password.ts"`.
- [x] `features/auth/auth.routes.test.ts`, with
      `const hash = await Bun.password.hash('right', { algorithm: 'bcrypt', cost: 4 })` to keep it
      fast, a mutable clock `let now` reset to `Date.UTC(2026, 0, 1)` in a `beforeEach`, and
      `useServer({ auth: { passwordHash: hash, now: () => now } })`. `useServer` rebuilds the server,
      and with it the throttle, for every test.
- [x] Add the auth-off cases to `src/backend/features/meta/meta.routes.test.ts`, whose `useServer()`
      already runs with defaults; a file gets one `useServer`, so they cannot share
      `auth.routes.test.ts`.
- [x] `src/scripts/hash-password.test.ts`: spawn the script with `stdin` piped `"s3cret\n"`, and
      assert exit 0 and `await Bun.password.verify('s3cret', stdout.trim())`. Also assert that an
      empty line exits 1.
- [x] `src/scripts/build.test.ts`: a second `describe` with its own `beforeAll`/`afterAll` that spawns
      the built file with `GAINZ_PASSWORD_HASH` set (and on its own port), waits with the file's
      existing readiness helper, and expects `GET /api/workouts` → 401 and `/api/health` →
      `"auth": true`. The existing spawn stays as it is.
- [x] `docs/backend.md`: add `auth/` to the feature list; a section "Authentication (`features/auth/`)"
      covering the cookie format, the key, the 90-day sliding renewal, the guard in `allRoutes`, the
      public routes, the throttle, the off switch and why it is safe in production; the
      `errors.ts` sentence ("exports exactly `badRequest`, `notFound` and `conflict`") gains
      `unauthorized` and the 401, and the 429 answered by the controller; the sentence that every
      cross-feature arrow lands on a `ports/` (lines 19–23) gains the second kind, a facade, naming
      `meta` → `AuthFacade`; `metaRoutes(auth)` in the
      composition paragraph; `useServer({ auth })` in the tests paragraph; `hash-password` among the
      `src/scripts/` entry points.
- [x] `README.md` "Security": the server has a built-in password login, enabled by
      `GAINZ_PASSWORD_HASH` (from `bun run hash-password`). It expects HTTPS in front, since the
      cookie is `Secure`. Without the variable it is open, as before. "Deploy": add the variable to
      the example.
- [x] `AGENTS.md` (`CLAUDE.md` is a symlink to it): add `bun run hash-password` to the command list.

**Automated Verification**:

- [x] `auth.routes.test.ts` with auth on:
  - [x] `GET /api/workouts` without a cookie → 401 `{ error: 'Not logged in' }`; `POST /api/workouts`
        likewise
  - [x] `GET /api/health` → 200 with `auth: true`; `GET /api/nope` → 404; `GET /` → 200 HTML;
        `GET /vendor/oat.css` → 200
  - [x] `POST /api/auth/login` with the wrong password → 401 `Wrong password`; `{}`, `{ password: 1 }`
        and `{ password: '' }` → 400; a non-JSON body → 400
  - [x] the right password → 204, with a `Set-Cookie` holding `gainz_session=`, `Max-Age=7776000`,
        `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`
  - [x] that cookie as a `Cookie` header → `GET /api/workouts` 200, with no `Set-Cookie` on the
        response
  - [x] after `now += 2 days`, the same cookie → 200 with a renewed `Set-Cookie`
  - [x] after `now += 91 days`, the same cookie → 401
  - [x] a changed signature character, a missing dot, and a non-numeric expiry → 401
  - [x] a cookie built with `issue('some other hash', now)` from `internal/session-cookie.ts` → 401
  - [x] 5 wrong passwords → 401 each; the 6th attempt, even with the right password → 429 with
        `Retry-After: 60`
  - [x] after `now += 61 s` the right password → 204; then 5 wrong → 401 each and the next → 429
        with 60 again (the success reset the count)
  - [x] without a success in between: once the first lock ends, a wrong password → 401 (it starts
        the second lock), and the attempt after it → 429 with `Retry-After: 120`
  - [x] 10 wrong logins fired at once with `Promise.all` → at least 5 of them answer 429 (attempts
        are reserved before `verify` resolves)
  - [x] during a lockout, an existing valid cookie still reads `/api/workouts` → 200
  - [x] `POST /api/auth/logout` → 204 with `Set-Cookie` holding `Max-Age=0`
- [x] `meta.routes.test.ts` with auth off: health has `auth: false`; `GET /api/workouts` without a
      cookie → 200; login with any non-empty password → 204 without `Set-Cookie`; login with `{}` →
      400 (validation runs before the off switch)
- [x] `hash-password.test.ts` and the new `build.test.ts` case pass
- [x] `bun test --parallel` passes (all existing tests unchanged)
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass

**Manual Verification**:

- [ ] `bun run hash-password` in a terminal does not echo, and a mismatch is refused
- [ ] `GAINZ_PASSWORD_HASH='<hash>' bun start` logs `auth: on`; with a garbage value it exits with
      the message above

### Phase 2: Frontend login flow

Dependencies: Phase 1

After this phase a browser is sent to the login page when logged out, stays logged in, and can log
out.

**Tasks**:

- [x] `src/frontend/http/errors.ts`: `export const UNAUTHORIZED_EVENT = 'gz:unauthorized'`.
- [x] `src/frontend/http/http.ts`: in `request()`, on `response.status === 401`, call
      `window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))` before throwing the `ApiError`.
- [x] `src/frontend/ui/toast.ts`: `toastError` returns without a toast for
      `error instanceof ApiError && error.status === 401`, with a comment saying the app redirects to
      the login page instead.
- [x] `features/auth/internal/auth.api.ts`, `auth.facade.ts`: `login(password): Promise<void>`
      and `logout(): Promise<void>`.
- [x] `features/auth/internal/next-path.ts`: `nextPath(search)` as described above.
- [x] `features/auth/gz-login.component.ts` + `.css`: a `<section>` with `<h1>Log in</h1>` and a
      `<form>`. It holds a hidden `<input name="username" autocomplete="username" value="gainz">` so
      iOS and Android password managers save the entry, a
      `<label>Password <input type="password" name="password" autocomplete="current-password" required autofocus></label>`,
      a `<p class="error-text" role="alert" hidden>` and `<button type="submit">Log in</button>`.
      On submit it calls `preventDefault`, sets `aria-busy` on the button, and runs
      `authFacade.login(value)`. Then it either navigates to
      `nextPath(location.search, location.origin)`, or shows
      `Wrong password.` for a 401, the server's message for a 429, and `errorMessage(error)`
      otherwise. The page is styled with Oat's form styles; the CSS only constrains the width
      (`max-inline-size` on the section) per `docs/styling-guidelines.md`.
- [x] `features/auth/auth.routes.ts` and `src/frontend/app/routes.ts`: register `/login`, spread last
      (no nav item).
- [x] `src/frontend/app/gz-app.component.ts`: in `connectedCallback` add a `window` listener for
      `UNAUTHORIZED_EVENT` (removed in `disconnectedCallback`). Unless `currentPath()` is `/login`,
      it calls `navigate('/login?next=' + encodeURIComponent(location.pathname + location.search))`.
- [x] `src/frontend/app/gz-header.component.ts`: in `#syncLinks`, toggle a `login` class on `nav`
      when `currentPath()` matches `/login`. Add `<li><button type="button" class="ghost" data-logout>Log out</button></li>`
      to `ul.links`, and `<button type="button" role="menuitem" data-logout>Log out</button>` to the
      menu. In `afterRender`, both run `authFacade.logout()` (a failure is toasted) and then
      `navigate('/login')`. Update the class doc comment.
- [x] `src/frontend/app/gz-header.component.css`: `nav.login .links, nav.login .menu { display: none; }`
      and `nav.login gz-theme-toggle { margin-inline-start: auto; border-inline-start: none; padding-inline-start: 0; }`.
      The Log out button in `.links` looks like the links (muted color, no padding) through Oat's
      `ghost` variant and existing tokens only, with no custom button colors.
- [x] Tests (happy-dom, `src/frontend/testing.ts` helpers):
  - [x] `http/http.test.ts`: a 401 dispatches `gz:unauthorized` once and still rejects with
        `ApiError` status 401; a 404 dispatches nothing
  - [x] `ui/toast` (wherever `toastError` is tested now, else a new `ui/toast.test.ts` with
        `useToasts()`): a 401 `ApiError` shows nothing, and a 500 still shows
  - [x] `features/auth/internal/next-path.test.ts` (origin `http://localhost`): `?next=/workouts/12`
        → `/workouts/12`; `?next=%2Fworkouts%3Fpage%3D2` → `/workouts?page=2`; missing,
        `//evil.example`, `https://evil.example`, `/\evil.example`, `/%09/evil.example`, `/login`
        and `/login?next=/x` → `/`
  - [x] `features/auth/auth.facade.test.ts`: `login('pw')` sends `POST /api/auth/login`
        `{ password: 'pw' }`; `logout()` sends `POST /api/auth/logout`
  - [x] `features/auth/gz-login.component.test.ts`: submitting posts the password and navigates to
        `next`; a 401 answer shows `Wrong password.` and stays; a 429 shows the server's message
  - [x] `app/gz-app.component.test.ts`: a `gz:unauthorized` event on `/workouts?page=2` navigates
        to `/login?next=%2Fworkouts%3Fpage%3D2`, and on `/login` it does nothing
  - [x] `app/gz-header.component.test.ts` (add `useFetch()`): on `/login`, `nav` has the `login` class; on
        `/workouts` it doesn't, and both lists hold a Log out button; clicking one sends
        `POST /api/auth/logout` and lands on `/login`
- [x] `docs/frontend.md`: add `auth/` to the feature tree and descriptions, and describe the 401 flow
      (`http.ts` event → `gz-app` → `/login?next=`, the silent `toastError`), the header's login
      state and Log out, and why `http.ts` signals with an event rather than importing the router.
      Where the doc says `app/` names no feature, add the one exception: `gz-header` imports
      `features/auth/auth.facade.ts` for Log out.

**Automated Verification**:

- [x] The tests listed above pass under `bun test --parallel`
- [x] `bun run typecheck`, `bun run lint` (import boundaries included) and `bun run fmt:check` pass

**Manual Verification**:

- [ ] With `GAINZ_PASSWORD_HASH` set and `bun start`, opening `http://localhost:3000/workouts`
      lands on `/login?next=%2Fworkouts` with no error toast, and the header shows only the brand and
      the theme toggle
- [ ] A wrong password shows "Wrong password." inline; the right one lands on `/workouts`, and a
      reload stays logged in
- [ ] Log out, from both the wide header and the narrow menu, lands on `/login`, and the API
      answers 401 again
- [ ] The login page looks right in light and dark themes and at phone width
- [ ] With the variable unset, the app behaves as before, and `/login` simply logs you in

### Phase 3: Production rollout

Dependencies: Phase 1, Phase 2

After this phase production requires the password, and a deploy cannot silently ship an open server.

**Tasks**:

- [x] `deploy/gainz.service`: add `EnvironmentFile=%h/app/gainz.env` under `[Service]` (no `-`
      prefix), with a comment that a missing file must keep the service down.
- [x] `deploy/gainz-deploy`: after `healthy` succeeds, check that the health body contains
      `"auth":true` with `body=$(curl -fsS …/api/health) && [[ $body == *'"auth":true'* ]]`. No
      `curl | grep -q`: under `pipefail`, the SIGPIPE `grep -q` can cause would fail a healthy
      release. Otherwise print
      `gainz-deploy: $sha came up without auth (is GAINZ_PASSWORD_HASH in $APP/gainz.env?), rolling back`
      and take the existing rollback path. Factor that path into a `roll_back` function used by
      both failures.
- [x] `docs/deployment.md`: add a section "Password" that covers:
  - running `bun run hash-password` on a machine with a checkout;
  - creating `/home/gainz/app/gainz.env` as `gainz` with mode `0600`, holding
    `GAINZ_PASSWORD_HASH='<hash>'` in single quotes so systemd takes the `$` signs literally;
  - reinstalling the unit (`install …` + `systemctl --user -M gainz@ daemon-reload` + `restart`)
    and the deploy script (`install -m 0755 …`), both of which the CI cannot do;
  - changing the password: replace the file and restart, which logs every device out;
  - the order: the env file first, then the unit, then the script, then push.

  Also extend "Server setup" and the paragraph on what `gainz-deploy` checks.
- [x] `README.md` "Deploy": point at that section for production.

**Automated Verification**:

- [x] `bash -n deploy/gainz-deploy` passes (syntax), run through the Bash tool
- [x] `bun test --parallel`, `bun run lint` and `bun run fmt:check` still pass

**Manual Verification**:

- [ ] On the server, with the env file in place, the unit reinstalled and the service restarted,
      `curl -s http://127.0.0.1:3000/api/health` shows `"auth":true`
- [ ] With the env file temporarily renamed, `systemctl --user -M gainz@ restart gainz` fails to
      start (then rename it back and restart)
- [ ] A push to `main` deploys through the new `gainz-deploy` and reports `is live`
- [ ] On the phone: log in once in the browser, add gainz to the home screen, and open it. It asks
      once more (iOS keeps a separate cookie store for home-screen apps), then survives closing the
      app, a phone restart, and a deploy without asking again

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- `LoginThrottle` gained a `failed()` method beside `begin()` and `succeeded()`. `begin()` still
  reserves the attempt and sets the lock synchronously, but the lockout line is logged from
  `failed()`, after `verify` rejects, so a correct password on the fifth attempt no longer logs a
  lockout that `succeeded()` then cancels.
- The header's Log out buttons use the base class's `data-action="logout"` and `handleAction()`
  rather than `data-logout` wired in `afterRender()`.
- Log out is a link, `<a href="/login" data-action="logout">`, in both lists rather than a `.ghost`
  button: as a button it looked unlike the links beside it (user feedback), and styling a button
  like a link would be a custom button color. Its handler cancels the click before `gz-app` routes
  it, logs out, then navigates.
- `gz-app.component.test.ts` waits for the login view to render after the 401 redirect: `/login` is
  a matched route, and its module otherwise landed after the file's DOM was torn down.
- `docs/deployment.md` step 4 checks `"auth":true` after the push, not before: the release running
  until then predates the field.

## References

- Bun cookies: `node_modules/bun-types/docs/runtime/cookies.mdx`, `Request.cookies` in
  `node_modules/bun-types/serve.d.ts:916`
- Bun `Bun.password` and `Bun.CryptoHasher`: `node_modules/bun-types/bun.d.ts`
- MDN, `Set-Cookie` (`Secure` on localhost, `SameSite=Lax`): https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
- systemd `EnvironmentFile=` quoting: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
- `src/backend/http/routes.ts`, `src/backend/features/meta/`, `src/backend/testing.ts`,
  `src/frontend/http/http.ts`, `src/frontend/ui/toast.ts`, `src/frontend/app/gz-app.component.ts`,
  `src/frontend/app/gz-header.component.ts`, `deploy/gainz.service`, `deploy/gainz-deploy`
