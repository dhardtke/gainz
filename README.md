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
bun run hash-password         # prompts twice, prints an argon2id hash
PORT=8080 GAINZ_DB=/var/lib/gainz/gainz.sqlite GAINZ_PASSWORD_HASH='<hash>' bun /opt/gainz/gainz.js
```

The target machine needs Bun 1.4 or newer and nothing else — no checkout, no
`node_modules` and no `.sql` files. Migrations apply on start, as they do under
`bun start`. Hot reload is not available in the built file; `GAINZ_DEV` is
ignored there.

Pushes to `main` deploy automatically through GitHub Actions and a self-hosted
runner; [`docs/deployment.md`](docs/deployment.md) describes the server setup.

## Security

The server has a built-in password login, enabled by `GAINZ_PASSWORD_HASH`
(create the hash with `bun run hash-password`). Once logged in, a browser keeps a
signed cookie for 90 days, renewed as it is used; changing the password logs
every device out. The cookie is `Secure`, so put HTTPS in front of the server
(a reverse proxy) before exposing it; `http://localhost` works without it.

Without the variable the server is open to anyone who can reach it, and it binds to all
interfaces — fine on your own machine or inside a private network, never on the
internet.

## Documentation

- [`AGENTS.md`](AGENTS.md) — every script, including test, typecheck, lint and
  format, and an index of the documentation.
- [`docs/`](docs) — how the two halves are arranged and why, plus the coding and
  styling guidelines.
