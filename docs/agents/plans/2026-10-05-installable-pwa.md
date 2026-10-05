---
date: 2026-10-05T14:58:34.242359+00:00
git_commit: 3564cd6e26b2688f2cdb450e19c06517ccf14791
branch: main
topic: 'Make gainz an installable PWA'
tags: [plan, frontend, static, build, theme, pwa]
status: implemented
---

# PLAN: Make gainz an installable PWA

gainz is used mostly on an Android phone at the gym. The cookie-login plan
(`docs/agents/plans/2026-10-05-cookie-login.md`) made a home-screen app stay logged in and left
"turning gainz into an installable PWA (manifest, icons, service worker)" to a later plan. This is
that plan, scoped to **installability only**. It adds a web app manifest, a real icon, and a status
and title bar that match the header. It adds no service worker and no offline support.

## Acceptance Criteria

- Chrome on Android installs gainz as a real app (WebAPK, not a browser shortcut), and desktop
  Chrome/Edge offer "Install gainz". Both work from the browser menu, and the installed app opens
  standalone at `/`.
- The home-screen and launcher icon is a white barbell on `#2563eb`. It fills Android's adaptive
  mask (maskable) and is never shown on a white plate.
- The browser tab's favicon is the same barbell SVG; the emoji data URI is gone.
- The status bar (Android) and title bar (desktop) match the header: `#fff` in light mode,
  `#202024` in dark. They are right on first paint and follow the in-app theme toggle immediately.
- `bun run build` serves the manifest and every icon byte-for-byte identical to the sources, and
  the PNGs are not corrupted.
- No service worker: nothing about requests, caching, auth or the 401 → `/login` flow changes.
- Saving the manifest or an icon under `bun run start:dev` reloads the page.

## Technical Key Decisions and Tradeoffs

1. **Installable only, no service worker.**
   - Why: Chrome has not required a service worker with a `fetch` handler for installing from the
     menu since Chrome 108 (Android) and 112 (desktop), and shows its own offline page for an
     installed app without one. An empty pass-through handler only slows every request, which is
     why Chrome's team stopped requiring it.
   - Impact: there is no automatic install banner (`beforeinstallprompt` still needs a fetch
     handler); you install from the browser menu. Offline support is left for a later plan.
2. **Android and desktop Chrome only, not iOS.**
   - Why: those are the devices gainz is used on.
   - Impact: no `apple-touch-icon` and no `apple-mobile-web-app-*` meta tags.
3. **A hand-drawn SVG source plus committed PNGs** in `src/frontend/icons/`.
   - Why: Android's WebAPK path needs raster icons at 192 and 512. With SVG icons alone, Chrome
     on Android refuses the install and offers a plain shortcut. Bun has no rasterizer, and a
     dependency (resvg, sharp) for a file that will hardly ever change isn't worth it.
   - Impact: the PNGs are rasterized once, in a browser, during implementation. `docs/frontend.md`
     records the one-off procedure for redoing them.
4. **The single-file build carries binary files as base64.**
   - What changes: `EmbeddedFile` gets an optional `base64: true`. `embedWebRoot()` base64-encodes
     a file whose MIME type is not text and keeps text files as strings, so `stamp()` still edits
     the index page as text. `EmbeddedWebFiles` decodes each such file once, in its constructor,
     with `Uint8Array.fromBase64` (present in Bun 1.4.2 and typed by `bun-types` and
     `lib.esnext.typedarrays`).
   - Why: `file.text()` (`embed.ts:33-35`) corrupts PNG bytes, and base64 survives the
     `JSON.stringify` that writes `EMBEDDED` into `gainz.js`.
   - Impact: changes to `embedded.ts`, `embed.ts` and `web-files.ts`, plus a byte-exact build test.
5. **The manifest is a static file at `/manifest.webmanifest`.**
   - Why: Bun's MIME lookup already answers `.webmanifest` with `application/manifest+json`
     (measured on 1.4.2), and the frontend is public, so the existing `/*` route serves it.
   - Impact: no new route and no new controller code.
6. **theme-color follows the in-app theme.**
   - What changes: `index.html` gets one `<meta name="theme-color">`, placed before the inline
     script. The script sets it from the stored choice, or from the system setting, before first
     paint. `applyTheme()` in `theme.ts` updates it on every change.
   - Why: the bar should blend into the header, which is `--card`. Meta tags with media queries
     would follow only the system and disagree with the toggle.
   - Impact: the two hex values exist three times (`app.css`'s `--card`, the inline script, and
     `theme.ts`), because the inline script runs before any stylesheet or module. A test keeps the
     copies equal.
7. **The manifest carries the light colors**: `theme_color: "#fff"` and
   `background_color: "#f4f4f5"`.
   - Why: a manifest has no dark variant. The meta tag overrides `theme_color` once the page has
     loaded, and `background_color` only shows on the splash screen.
   - Impact: someone using dark mode sees a light splash screen for a moment.
8. **Hot reload treats `.webmanifest`, `.svg` and `.png` as reloads** (`changes.ts`).
   - Why: those files are now part of the web root.
   - Impact: `hot.ts` needs no change, because its `HEAD` probe returns 200 for these files.

## Current State

```
src/frontend/index.html <head>
  charset, viewport, color-scheme, description, <title>
  <link rel="icon" href="data:image/svg+xml,…🏋…">   ← the only icon, an emoji in a data URI
  inline script: data-theme from localStorage        ← no theme-color, no manifest link
  oat.css, app.css, oat.js (defer), main.ts (module)

GET /anything ─▶ /* StaticController.frontend ─▶ WebFiles.page()
                    DiskWebFiles (bun start, tests):  .ts → transpiled; else Bun.file bytes + Bun.file.type
                    EmbeddedWebFiles (dist/gainz.js): pages[url] — body: string  ← text only

bun run build ─▶ embedWebRoot(): .ts → transpiled; everything else → file.text()   ← would corrupt a PNG
dev watcher   ─▶ changeFor(): .css → swap; .ts/.html → reload; anything else ignored
theme.ts      ─▶ applyTheme(): data-theme on <html> only
```

## Desired End State

```
src/frontend/
  index.html          + <meta name="theme-color">, <link rel="icon" href="/icons/icon.svg">,
                        <link rel="manifest" href="/manifest.webmanifest">; the inline script also
                        sets theme-color
  manifest.webmanifest  new
  icons/              new: icon.svg, icon-maskable.svg, icon-192.png, icon-512.png, icon-maskable-512.png
  ui/theme.ts         applyTheme() also sets theme-color

dist/gainz.js EMBEDDED.pages['/icons/icon-192.png'] = { body: '<base64>', type: 'image/png', base64: true }
              EmbeddedWebFiles decodes it once → Uint8Array, so the ETag and bytes match disk
```

What the installed app looks like on Android (light theme):

```
 Home screen               Installed app (standalone)
┌──────────────────┐      ┌────────────────────────────┐
│  ┌────┐          │      │ 9:41            ▂▄▆ █  #fff │ ← theme-color = header --card
│  │▌▐━▌▐│ gainz   │      ├────────────────────────────┤
│  └────┘          │      │ gainz   Workouts  Exercises │ ← gz-header (--card)
│  white barbell   │      │                             │
│  on #2563eb,     │      │   …                         │
│  adaptive mask   │      │                             │
└──────────────────┘      └────────────────────────────┘
                           no address bar; dark theme → #202024 bar
```

## Abstractions and Code Reuse

- `src/frontend/`
  - `manifest.webmanifest` - new. Served by the existing `/*` route.
  - `icons/icon.svg`, `icons/icon-maskable.svg` - new. Hand-written SVG sources.
  - `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` - new. Rasterized
    once from the SVGs.
  - `index.html` - `<head>`: replace the emoji icon; add the manifest link (phase 1); add the
    theme-color meta and extend the inline script (phase 2).
  - `ui/theme.ts` - `THEME_COLORS` (new export); `applyTheme()` sets the meta tag (phase 2).
  - `ui/theme.test.ts` - the document stub gains `querySelector`; new tests (phase 2).
- `src/backend/shared/embedded.ts` - `EmbeddedFile.base64?: true`.
- `src/backend/features/static/internal/`
  - `embed.ts` - `embedWebRoot()` base64-encodes non-text files; a new `isText(type)` helper.
  - `web-files.ts` - `EmbeddedWebFiles` decodes `base64` files once, in its constructor.
- `src/backend/features/static/static.routes.test.ts` - new `describe('installable app')`.
- `src/backend/features/dev/internal/changes.ts` (+ `.test.ts`) - three new reload extensions.
- `src/scripts/build.test.ts` - byte-exact manifest and icons in the built server.
- `docs/frontend.md`, `docs/backend.md` - see each phase. `README.md` and `AGENTS.md` need no
  change: nothing here affects getting the project running, and no document is added to `docs/`.

No new abstraction is needed. `StaticController`, `#respond` (ETag + `no-cache`) and Bun's MIME
lookup already cover every new file.

## Logging & Observability

There are no new logs. `bun run build` already prints how many frontend files it embedded, and the
count grows by six (the manifest and five icons).

## Implementation

### Phase 1: Installable gainz

Dependencies: None

This phase adds the icon artwork, the manifest and the `<head>` links, and makes both the
single-file build and hot reload carry the new files. Once it lands, Chrome can install gainz.

**Tasks**:

- [x] Add `src/frontend/icons/icon.svg`, the "any" icon and favicon. It is a white barbell on a
      blue rounded square:
      ```svg
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" rx="112" fill="#2563eb"/>
        <g fill="#fff">
          <rect x="96" y="240" width="320" height="32" rx="8"/>   <!-- bar -->
          <rect x="104" y="200" width="28" height="112" rx="8"/>  <!-- outer plates -->
          <rect x="380" y="200" width="28" height="112" rx="8"/>
          <rect x="136" y="176" width="40" height="160" rx="8"/>  <!-- inner plates -->
          <rect x="336" y="176" width="40" height="160" rx="8"/>
        </g>
      </svg>
      ```
- [x] Add `src/frontend/icons/icon-maskable.svg`. It is the same drawing with
      `<rect width="512" height="512" fill="#2563eb"/>` (full bleed, no `rx`) as the background.
      The barbell already sits inside the maskable safe zone, a circle of radius 204.8 around the
      center: its farthest points, the outer plates' corners such as (104, 200), are about 162 from the center. So the
      drawing is not scaled.
- [x] Rasterize `icon-192.png` (192×192) and `icon-512.png` (512×512) from `icon.svg`, and
      `icon-maskable-512.png` (512×512) from `icon-maskable.svg`, in a Chromium browser. Load the
      SVG into an `Image`, draw it with `drawImage(img, 0, 0, size, size)` onto a canvas of that
      size, and save `canvas.toBlob(…, 'image/png')`. Pass the explicit size: the SVGs carry only
      a `viewBox`, so `drawImage(img, 0, 0)` would draw them at the browser's default size, and the
      IHDR test would not notice. Look at each PNG before committing the three of them.
- [x] Add `src/frontend/manifest.webmanifest`:
      ```json
      {
        "id": "/",
        "name": "gainz — lifting log",
        "short_name": "gainz",
        "description": "gainz — a simple log for weight-lifting progress.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "theme_color": "#fff",
        "background_color": "#f4f4f5",
        "icons": [
          { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
          { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
          { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
          { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
        ]
      }
      ```
      The PNGs come first, because Chrome on Android picks the first suitable raster icon for the
      WebAPK. Run `bun run fmt` to check that the formatter accepts the file, and keep its output if
      it reformats.
- [x] `src/frontend/index.html`: replace the data-URI `<link rel="icon">` (lines 10-13) with
      `<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />` and add
      `<link rel="manifest" href="/manifest.webmanifest" />` after it.
- [x] `src/backend/shared/embedded.ts`: add `base64?: true` to `EmbeddedFile`, with a doc comment
      saying that `body` is then the base64 encoding of binary bytes rather than the text itself.
- [x] `src/backend/features/static/internal/embed.ts`:
  - Add `isText(type)`, which is true for `text/*`, `+json`, `+xml`, `application/json` and
    `application/javascript`.
  - In the non-`.ts` branch, keep `file.text()` for text. Store everything else as
    `{ body: (await file.bytes()).toBase64(), type, base64: true }`.
  - Replace the comment "The web root holds only .html, .css and .ts, so every page is text" with
    the new rule.
  - Vendor files stay text (`oat.css`, `oat.js`).
- [x] `src/backend/features/static/internal/web-files.ts`: give `EmbeddedWebFiles` its own decoded
      copy of `pages`. Its constructor maps each `base64` entry to
      `{ body: Uint8Array.fromBase64(body), type }`, so `found()` returns bytes for those entries
      and strings for the rest. Test the flag as `file.base64 === true`, because `.oxlintrc.json`'s
      `strict-boolean-expressions` rejects a bare `true | undefined` in a condition. Add a local
      type `ServedFile = { body: string | Uint8Array<ArrayBuffer>; type: string }`, use it for the
      decoded `pages` record, and change `found(file: EmbeddedFile | undefined)` to
      `found(file: ServedFile | undefined)`. `vendor()` keeps passing `EmbeddedFile`s, which fit it.
      Decoding once keeps a request from paying for it, and the ETag then hashes the same bytes as
      `DiskWebFiles` does.
- [x] `src/backend/features/dev/internal/changes.ts`: return `{ reload: url }` for `.webmanifest`,
      `.svg` and `.png` as well. Update the doc comment's "three extensions" wording.
- [x] `src/backend/features/dev/internal/changes.test.ts`: test that
      `changeFor('manifest.webmanifest')`, `changeFor('icons\\icon.svg')` and
      `changeFor('icons/icon-192.png')` reload at `/manifest.webmanifest`, `/icons/icon.svg` and
      `/icons/icon-192.png`.
- [x] `src/backend/features/static/static.routes.test.ts`: add `describe('installable app')` with
      these tests:
  - `/manifest.webmanifest` answers 200 with `application/manifest+json`, an ETag and `no-cache`.
    Its body parses as JSON with `id`, `start_url` and `scope` equal to `/`, `display`
    `standalone`, a non-empty `name` and `short_name`, and `theme_color` and `background_color`.
  - Every manifest icon `src` answers 200, and its `content-type` starts with the declared `type`.
  - At least one `purpose: "any"` PNG is 192×192, one is 512×512, and one `maskable` PNG is
    512×512. Read the PNG's real width and height from the IHDR chunk (big-endian `uint32` at
    byte offsets 16 and 20) and compare them with `sizes`.
  - `/` contains `<link rel="manifest" href="/manifest.webmanifest"` and
    `<link rel="icon" href="/icons/icon.svg"`, and no longer contains `data:image/svg+xml`.
- [x] `src/scripts/build.test.ts`: add a test to `describe('single-file build')`. In the built
      server, `/manifest.webmanifest`, `/icons/icon.svg`, `/icons/icon-192.png` and
      `/icons/icon-maskable-512.png` each answer 200 with the same `content-type` as
      `Bun.file(src).type`, and with an `arrayBuffer()` byte-equal to the source file under
      `FRONTEND`. Also assert that `embedded.pages['/icons/icon-192.png']?.base64` is `true` and
      `embedded.pages['/index.html']?.base64` is `undefined`.
- [x] `docs/backend.md`:
  - In the content-type paragraph (around lines 274-278), add
    `.webmanifest` → `application/manifest+json` to the measured list.
  - In the hot-reload paragraph (lines 363-365), add `.webmanifest`, `.svg` and `.png` to what
    `changes.ts` reloads for.
  - In "Single-file build" (lines 382-391), add a sentence: a non-text file (the icons) is embedded
    as base64 with `base64: true`, because `JSON.stringify` cannot carry raw bytes, and
    `EmbeddedWebFiles` decodes it once at startup so it is served, and hashed, byte-identically
    to disk.
- [x] `docs/frontend.md`:
  - In the intro (lines 3-4), mention that `index.html` also links the manifest and the icon.
  - Add `manifest.webmanifest` and `icons/` to the directory tree (lines 8-24). Update the
    sentence after it (line 26, "What belongs to no feature sits in four directories") to cover
    the new directory and file.
  - In the "Hot reload" section, add that saving the manifest or an icon reloads the page.
  - Add a short `## Installing` section before `## Tests`. It should say:
    - The manifest makes gainz installable from the browser menu on Android and desktop Chrome.
    - Why there is no service worker: menu install does not need one, an empty fetch handler only
      costs performance, and offline support is a separate decision.
    - Why the PNGs exist next to the SVG: the Android WebAPK needs raster 192/512 icons.
    - That iOS is not targeted.
    - The one-off rasterizing procedure from the task above, for when the SVG changes.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/static/static.routes.test.ts` passes, including
      `installable app`
- [x] `bun test --parallel src/scripts/build.test.ts` passes, including the byte-exact icon test
- [x] `bun test --parallel src/backend/features/dev/internal/changes.test.ts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [ ] On desktop Chrome at the deployed HTTPS site (or `http://localhost:3000`), DevTools →
      Application → Manifest shows no errors or warnings, the icons render, and the maskable icon
      looks right in the "Show only the minimum safe area" preview.
- [ ] Desktop Chrome's menu offers "Install gainz". The installed window opens at `/` with no
      address bar and the barbell icon.
- [ ] On an Android phone, Chrome ⋮ → "Add to home screen" / "Install app" installs an app (it
      appears in the app drawer, not only as a shortcut with a Chrome badge). The launcher icon is
      the barbell filling the adaptive mask, and it opens standalone and stays logged in.
- [ ] The browser tab shows the barbell favicon instead of the emoji.

### Phase 2: Status bar follows the theme

Dependencies: Phase 1 (the `<head>` it edits)

This phase colors the Android status bar and the desktop title bar like the header, in the theme
the app is showing.

**Tasks**:

- [x] `src/frontend/index.html`: add `<meta name="theme-color" content="#fff" />` **before** the
      inline `<script>`, because the script can only find elements that have already been parsed.
      Extend the script to set it, in a `try` block of its own, so blocked storage still gets the
      system color. Wrap the whole script in a `{ … }` block, so `storedTheme` does not become a
      global:
      ```js
      {
        // theme.ts and --card in ui/app.css hold the same two colors — keep them in sync.
        let storedTheme = null;
        try { storedTheme = localStorage.getItem('gainz:theme'); /* + existing data-theme code */ } catch (error) { … }
        try {
          const dark = storedTheme === 'dark' || (storedTheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
          document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#202024' : '#fff');
        } catch (error) {
          /* No matchMedia — keep the light default. */
        }
      }
      ```
      Keep the existing behavior: `data-theme` is set only for a stored choice.
- [x] `src/frontend/ui/theme.ts`: export
      `THEME_COLORS: Readonly<Record<Theme, string>> = { light: '#fff', dark: '#202024' }`, with a
      comment that these are `--card` from `app.css`, also inlined in `index.html`. In
      `applyTheme()`, also run
      `document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[current])`.
- [x] `src/frontend/ui/theme.test.ts`: give the `document` stub a `querySelector` that returns a
      `FakeElement` for `meta[name="theme-color"]` and `null` otherwise. Add these tests:
  - At load, the meta tag is set for light and for dark (system and stored).
  - `setTheme` and `toggleTheme` update it.
  - A document without the meta tag does not throw.
  - `THEME_COLORS` equals the two values of `--card: light-dark(…, …)` read from
    `src/frontend/ui/app.css`, and both values appear in the body of the inline `<script>` in
    `src/frontend/index.html`. Search only the script body, not the whole page: the meta tag's
    own `content="#fff"` would otherwise always match. This keeps the three copies in sync.
- [x] `src/backend/features/static/static.routes.test.ts`: in `installable app`, assert that `/`
      contains `<meta name="theme-color"` and that it appears before the first `<script>`.
- [x] `docs/frontend.md` "Theming": add a paragraph explaining:
    - `theme-color` colors the Android status bar and the installed desktop window's title bar.
    - It mirrors `--card` so the bar blends into the header.
    - The inline script sets it before first paint, and `applyTheme()` keeps it in step with the
      toggle.
    - The colors are duplicated in three places because the script runs before any CSS or
      module, and `theme.test.ts` keeps them equal.
    - The manifest's `theme_color` and `background_color` are the light values, because a
      manifest has no dark variant.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/ui/theme.test.ts` passes
- [x] `bun test --parallel src/backend/features/static/static.routes.test.ts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [ ] In the installed Android app, the status bar is white in light mode and `#202024` in dark
      mode, with no visible seam against the header.
- [ ] Tapping the theme toggle changes the status bar color immediately. Relaunching the app keeps
      the chosen color from the first frame.
- [ ] In the installed desktop window, the title bar follows the same colors.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- The PNGs were rasterized in headless Edge (`msedge --headless=new --dump-dom`) running the
  canvas procedure from Phase 1 on the SVGs as `data:` URIs, so the canvas stays untainted under
  `file://`. All three decode at their declared sizes and were looked at before committing.
- `ServedFile` in `web-files.ts` is an `interface`, not a `type`: oxlint's
  `consistent-type-definitions` rejects the alias.
- `changes.ts` keeps the reload extensions in a `RELOAD_EXTENSIONS` list rather than a chain of
  five `endsWith` calls.
- Phase 2's `index.html` change went in together with Phase 1's `<head>` edit, and its
  `static.routes.test.ts` assertion joined the `index page` test in `installable app`.
- Manual verification is still open: it needs a real install on desktop Chrome and on an Android
  phone.

## References

- `docs/agents/plans/2026-10-05-cookie-login.md` — defers PWA to this plan; the frontend stays public
- `docs/agents/plans/2026-09-29-single-file-build.md` — what `EMBEDDED` carries
- `docs/agents/plans/2026-09-15-etag-revalidation-for-static-files.md` — `no-cache` + ETag on every file
- `src/backend/features/static/internal/static.controller.ts:25-71` — serving, fallback, ETag
- `src/backend/features/static/internal/embed.ts:32-36` — the text-only assumption this plan lifts
- `src/backend/features/static/internal/web-files.ts:69-102` — `EmbeddedWebFiles`
- `src/frontend/index.html:10-27` — favicon and inline theme script
- `src/frontend/ui/theme.ts:48-50` — `applyTheme()`
- `src/frontend/ui/app.css:6` — `--card: light-dark(#fff, #202024)`
- [Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria)
- [web.dev: Add a web app manifest](https://web.dev/articles/add-manifest)
- [Chromium issue 40925759](https://issues.chromium.org/issues/40925759) — SVG-only manifests and install
- [MDN: Define your app icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons)
