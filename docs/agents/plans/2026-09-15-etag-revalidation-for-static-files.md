---
date: 2026-09-15T21:31:05.530136+00:00
git_commit: b030f0e13196c716285bcd6d7b76a956d5dd0977
branch: main
topic: 'Revalidate static responses with content-hash ETags'
tags: [plan, backend, static, caching, http]
status: complete
---

# PLAN: Revalidate static responses with content-hash ETags

Every static response is sent `Cache-Control: no-cache`, which tells the browser to check with
the server before reusing a cached copy. But no response carries a validator (`ETag` or
`Last-Modified`), so that check always downloads the full body again. The vendor stylesheet is the
exception: it is cached for an hour and can go stale after a `bun install` that upgrades Pico.

This plan gives every successful static response a strong `ETag` hashed from its body and answers a
matching `If-None-Match` with an empty `304`. Browsers still never use a stale file, but a reload of
an unchanged file costs a request and a few headers instead of the whole file. The vendor
stylesheet moves to `no-cache` like everything else.

## Acceptance Criteria

- Every `200` from the static feature carries a strong `ETag` hashed from the exact body sent:
  transpiled `.ts` modules, other files under `src/frontend/`, `index.html` (served for `/` and as the
  single-page fallback), and `/vendor/pico.css`.
- A `GET` or `HEAD` whose `If-None-Match` matches the current tag gets a `304` with an empty body,
  `ETag` and `Cache-Control: no-cache`. A tag matches when it appears in a comma-separated list,
  when the header is `*`, or when it carries a `W/` prefix.
- A request with a stale tag, or with no `If-None-Match` header, gets the full `200`.
- Changing a served file's contents changes its `ETag`.
- `/vendor/pico.css` is served with `Cache-Control: no-cache` instead of `public, max-age=3600`.
- The `404` (frontend and vendor), `405` and `500` (transpile failure and missing vendor file)
  responses are built exactly as today and carry no `ETag`.
- `Content-Type` for plain files is still the type Bun infers from the extension, with no
  hand-written map.
- `docs/backend.md` describes how static responses are revalidated.
- `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test` pass.

## Technical Key Decisions and Tradeoffs

1. **What the ETag is based on:** `Bun.hash` of the exact body sent, written as a quoted strong tag
   (`"<base-36 hash>"`).
   - Why: the tag changes exactly when the bytes change. A body that is only touched keeps its tag,
     and a same-size edit made within the same millisecond still gets a new one, which a tag built
     from mtime and size would miss. For a transpiled module the output also depends on the Bun
     version, and hashing the output covers that. `Bun.hash` of a 1.8 KB file measured about 0.4 µs.
   - Impact: a `304` still reads the file, or transpiles the module (about 76 µs); only the
     transfer is saved. That transfer is the waste being fixed.
2. **Where the logic lives:** a private `#respond` on `StaticController`, with no new module.
   - Why: all four response sites are already in the controller, `static.routes.ts` may import
     nothing from `internal/` except the controller, and the tests stay end-to-end over HTTP rather
     than adding another exception to the list in `docs/backend.md`.
   - Impact: `static.routes.ts` and the lint boundaries are untouched.
3. **Plain files are read into bytes, not streamed as a `BunFile`:** the body is `await file.bytes()`
   and `Content-Type` is `file.type`.
   - Why: the tag must be hashed from the same bytes that are sent. Hashing one read and then
     streaming a second read would let a file edited between the two go out under the wrong tag.
     `file.type` is the MIME database lookup that `new Response(Bun.file(x))` uses, and on Bun 1.4.2
     it gave identical values for `.css` (`text/css;charset=utf-8`), `.html`
     (`text/html;charset=utf-8`), `.svg`, `.woff2` and a file with no extension
     (`application/octet-stream`).
   - Impact: the types still come from Bun's MIME database with no hand-written map, but the
     sentence in `docs/backend.md` that says the type is left to `new Response(Bun.file(x))` has to
     be reworded.
4. **`If-None-Match` is matched as RFC 9110 describes:** the header is split on commas and each
   entry trimmed; `*` matches; a `W/` prefix is ignored when comparing (weak comparison).
   - Why: browsers send back only the tag they were given, but a plain string comparison would get
     lists and proxies wrong.
   - Impact: a small helper function sits beside `#respond`.
5. **The vendor stylesheet is revalidated like everything else:** `no-cache` plus an `ETag`.
   - Why: it closes the window of up to an hour during which a browser keeps a stale Pico after
     `bun install`, and each revalidation now costs only a `304`.
   - Impact: the comment at `static.controller.ts:21` about lockfile versioning goes away.

## Current State

```
request ──► static.routes.ts
             ├─ /vendor/pico.css ──► StaticController.vendor()        static.controller.ts:10
             │                        200 Bun.file, text/css, public, max-age=3600   (:22-24)
             │                        404 if the specifier does not resolve          (:14)
             │                        500 if node_modules is missing                 (:19)
             └─ /*  ──► StaticController.frontend()                   :27
                         ├─ not GET/HEAD     ──► 405                                 (:28-30)
                         ├─ file exists, .ts ──► #module() ─► transpile ─► 200 js, no-cache  (:67-75)
                         │                                             └► 500 if unparsable
                         ├─ file exists      ──► 200 Bun.file, no-cache                     (:52)
                         ├─ extension-less   ──► 200 index.html, no-cache (SPA fallback)    (:57-61)
                         └─ else             ──► 404
```

Measured on Bun 1.4.2:

- A `Bun.file` response gets neither `ETag` nor `Last-Modified` from Bun.
- Bun does nothing with `If-None-Match` itself: a response that sets `ETag` is still a full `200`
  when the tag matches.
- `new Response(null, { status: 304, headers })` returned from a route handler comes back as a
  clean `304` with those headers and an empty body, for both `GET` and `HEAD`.

## Desired End State

```
            vendor()   ── bytes of pico.min.css, text/css ──┐
            frontend() ── bytes of file, file.type ─────────┤
            frontend() ── bytes of index.html, file.type ───┼──► #respond(req, body, headers)
            #module()  ── transpiled string, text/javascript┘        │
                                                                     ▼
                                               etag = `"${Bun.hash(body).toString(36)}"`
                                                                     │
                                         If-None-Match matches etag? │
                                     yes ◄───────────────────────────┴───────────────► no
                                      │                                                │
               304, empty body, ETag, Cache-Control: no-cache        200, body, ETag, Cache-Control: no-cache,
                                                                     Content-Type
```

Both `404`s, the `405` and both `500`s are built exactly as today and never pass through
`#respond`.

## Abstractions and Code Reuse

- `src/backend/features/static/internal/static.controller.ts`: the only source file that changes.
  - `StaticController.vendor`: read `file.bytes()` and return `this.#respond(req, bytes, { 'Content-Type': 'text/css;charset=utf-8' })`.
    Delete the max-age comment.
  - `StaticController.frontend`: for an existing non-`.ts` file and for the single-page-fallback
    `index.html`, return `this.#respond(req, await file.bytes(), { 'Content-Type': file.type })`.
    Delete the `// No explicit Content-Type…` comment, or shorten it to the one fact that is still
    not obvious: `file.type` is Bun's MIME lookup, so no map is kept here.
  - `StaticController.#module`: gains a `req` parameter and returns
    `this.#respond(req, code, { 'Content-Type': 'text/javascript;charset=utf-8' })`.
  - `StaticController.#respond` (new): hashes the body, returns a `304` or a `200`, and always sets
    `ETag` and `Cache-Control: no-cache`.
  - `matchesEtag(header, etag)` (new, module-level, not exported): the RFC 9110 weak comparison.
- `src/backend/features/static/static.routes.ts`: unchanged.
- `src/backend/features/static/internal/transpile.ts`: unchanged.

```ts
#respond(req: Request, body: string | Uint8Array<ArrayBuffer>, headers: Record<string, string>): Response {
  const etag = `"${Bun.hash(body).toString(36)}"`;
  const cache = { ETag: etag, 'Cache-Control': 'no-cache' };
  if (matchesEtag(req.headers.get('If-None-Match'), etag)) {
    return new Response(null, { status: 304, headers: cache });
  }
  return new Response(body, { headers: { ...headers, ...cache } });
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) {
    return false;
  }
  return header.split(',').some((entry) => {
    const tag = entry.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}
```

The body is typed `Uint8Array<ArrayBuffer>`, which is what `file.bytes()` returns. With the DOM lib
loaded, `BodyInit` accepts only ArrayBuffer-backed views, so a bare `Uint8Array`
(`Uint8Array<ArrayBufferLike>`) may fail `bun run typecheck`.

In line with the project's preference for few comments, neither function needs more than one line
naming RFC 9110 weak comparison. The existing comment at `static.controller.ts:51` ("assets carry a
hash-free URL, so revalidate") is the only recorded reason for `no-cache`, so it moves, shortened,
onto `#respond`.

## Logging & Observability

None. A `304` is a normal answer, not an event, and the existing log for a module that fails to
transpile is unchanged.

## Implementation

Dependencies: None.

Route all four `200` sites through `#respond`, switch the vendor stylesheet to `no-cache`, cover
the behaviour with HTTP tests, and update `docs/backend.md`.

**Tasks**:

- [x] `static.controller.ts`: add the module-level `matchesEtag(header, etag)` function.
- [x] `static.controller.ts`: add `#respond(req, body, headers)` as sketched above.
- [x] `static.controller.ts`: `vendor()` reads `await file.bytes()`, returns it through `#respond`
      with `Content-Type: text/css;charset=utf-8`, and the `max-age` comment is deleted. The
      missing-file `500` stays as it is.
- [x] `static.controller.ts`: in `frontend()`, the existing non-`.ts` file branch returns
      `this.#respond(req, await file.bytes(), { 'Content-Type': file.type })`, and the
      `Content-Type` comment is removed or cut down to one line.
- [x] `static.controller.ts`: in `frontend()`, the single-page fallback returns
      `this.#respond(req, await index.bytes(), { 'Content-Type': index.type })`.
- [x] `static.controller.ts`: `#module(path)` becomes `#module(req, path)`, its call site passes
      `req`, and its `200` goes through `#respond` with `Content-Type: text/javascript;charset=utf-8`.
      The transpile-failure `500` stays as it is.
- [x] `static.routes.test.ts`: append a new `describe('revalidation', …)` block after the existing
      one, so the `static.routes.test.ts:51` reference in `docs/backend.md` stays valid. It covers:
  - [x] `/`, `/workouts`, `/ui/app.css`, `/vendor/pico.css` and `/main.ts` each answer `200` with
        an `ETag` matching `/^"[0-9a-z]+"$/` and `Cache-Control: no-cache`.
  - [x] `/` and `/workouts` carry the same `ETag`, because both serve `index.html`.
  - [x] For `/ui/app.css`, `/vendor/pico.css` and `/workouts`, sending the received tag as
        `If-None-Match` gets a `304` with an empty body, the same `ETag` and
        `Cache-Control: no-cache`; the same holds for a `HEAD`.
  - [x] `If-None-Match` set to `"stale", <tag>`, to `W/<tag>` and to `*` each get a `304`.
  - [x] `If-None-Match: "stale"` gets a `200` with the full body.
  - [x] Editing a file changes its tag: write `src/frontend/__etag.css`, read its `ETag`, rewrite
        it with different content, then check the tag has changed and that the old tag now gets a
        `200`. Remove the file in `finally`, as `transpile.test.ts` does with `__broken.ts`.
  - [x] `/nope.css` (404), `/vendor/pico.scss` (404) and `POST /` (405) carry no `ETag`. The
        vendor-missing `500` cannot be provoked while Pico is installed and gets no test.
- [x] `transpile.test.ts`: add tests that:
  - [x] a `304` comes back for `/ui/format.ts` when its tag is sent back;
  - [x] a module's tag changes when its source changes (write `src/frontend/__etag.ts` twice with
        different exports, clean up in `finally`);
  - [x] the unparsable-module `500` in the existing `__broken.ts` test carries no `ETag`.
- [x] `docs/backend.md`, static-serving paragraphs (currently lines 170–190):
  - [x] restructure the paragraph that begins "Two things the static feature deliberately does not
        do" (line 179). Its first point, leaving `Content-Type` unset, is no longer true: every
        `200` now sets it. Say instead that plain files take `Bun.file(x).type`, the same MIME
        database lookup `new Response(Bun.file(x))` uses, so there is still no hand-written map;
        keep the measured examples. The HEAD and 405 points stay, and so does the
        `static.routes.test.ts:51` reference.
  - [x] add a paragraph on caching: every `200` is `no-cache` with a strong `ETag` hashed from the
        body, a matching `If-None-Match` (list, `*`, weak comparison) gets an empty `304`, Bun does
        neither of these itself (measured on 1.4.2), and the vendor stylesheet is revalidated like
        everything else rather than cached for an hour. Say why a content hash rather than mtime:
        it is exact, it covers transpiler output, and it is cheap at this app's sizes.
- [x] `docs/frontend.md` "Loading": if it mentions caching after the change, keep it consistent. At
      the time of writing it says nothing about caching, so no edit is expected.

**Automated Verification**:

- [x] `bun test src/backend/features/static` passes, including the new revalidation tests.
- [x] `bun test` passes.
- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.

**Manual Verification**:

- [x] With `bun start` running, open the app in a browser with DevTools → Network ("Disable cache"
      off) and reload: modules, stylesheets, `/vendor/pico.css` and the document show `304` with
      no transferred body.
- [x] Edit a component stylesheet, reload, and check that file comes back `200` with the change
      applied while the untouched files stay `304`.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- The two imports added to `static.routes.test.ts` moved the HEAD test from line 51 to 53, so the reference in `docs/backend.md` now points at `:53`.
- `oxlint` forbids non-null assertions, so the tests read a missing `ETag` as `''` instead of `!`.

## References

- `src/backend/features/static/internal/static.controller.ts` — every response site this plan changes
- `src/backend/features/static/static.routes.test.ts`, `src/backend/features/static/internal/transpile.test.ts`
- `docs/backend.md` — static serving (lines 170–190)
- `docs/agents/research/2026-09-11-static-file-serving.md` — the earlier cache policy for each kind of asset
- RFC 9110 §8.8.3 (`ETag`), §13.1.2 (`If-None-Match`), §15.4.5 (`304 Not Modified`)
