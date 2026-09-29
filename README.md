# gainz

A small, self-hosted log for weight-lifting progress: workouts, the sets you did,
and the reps, weight and notes for each one.

- **Backend** — [Bun](https://bun.sh) serving a REST API over SQLite (`bun:sqlite`).
- **Frontend** — TypeScript custom elements and ES modules styled with
  [Oat](https://oat.ink). No framework, and no build step in
  development: there is no bundler and no output directory, and the server
  erases the types as it hands each file over, one module per request. For
  deployment, `bun run build` produces one file that carries it all.

## Quick start

Requires [Bun](https://bun.sh) 1.4 or newer.

```sh
bun install          # Oat, plus TypeScript types for development
bun run seed         # optional: a few weeks of sample history
bun start            # http://localhost:3000
```

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`) and is
created on first run. It is git-ignored — the log is your data, not source. Its
schema comes from the numbered `.sql` files in `src/backend/db/migrations`,
which the server applies on startup; `bun run migrate` does the same without
booting the server.

## Deploy

```sh
bun run build                 # dist/gainz.js + dist/gainz.js.map
scp dist/gainz.js* server:/opt/gainz/
PORT=8080 GAINZ_DB=/var/lib/gainz/gainz.sqlite bun /opt/gainz/gainz.js
```

The target machine needs Bun 1.4 or newer and nothing else — no checkout, no
`node_modules` and no `.sql` files. Migrations apply on start, as they do under
`bun start`. Hot reload is not available in the built file; `GAINZ_DEV` is
ignored there.

## Security

The server binds to all interfaces and has no authentication — it is built to run
on your own machine or inside a private network. Put it behind a reverse proxy
with auth before exposing it to the internet.

## Documentation

- [`AGENTS.md`](AGENTS.md) — every script, including test, typecheck, lint and
  format, and an index of the documentation.
- [`docs/`](docs) — how the two halves are arranged and why, plus the coding and
  styling guidelines.
