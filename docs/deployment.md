# Deployment

## Running a build

```sh
bun run build                 # dist/gainz.js + dist/gainz.js.map + dist/bun-version
scp dist/gainz.js* server:/opt/gainz/
bun run hash-password         # prompts twice, prints an argon2id hash
PORT=8080 GAINZ_DB=/var/lib/gainz/gainz.sqlite GAINZ_PASSWORD_HASH='<hash>' bun /opt/gainz/gainz.js
```

The target needs only Bun 1.4 or newer. Migrations apply on start, and `GAINZ_DEV` is ignored. The
session cookie is `Secure`, so put an HTTPS reverse proxy in front; `http://localhost` works
without one. See "Authentication" and "Single-file build" in `docs/backend.md`.

The rest of this document covers this repository's own server.

## How a deploy works

Every push to `main` runs `.github/workflows/ci.yml`. The `check` job runs format, lint, typecheck,
tests and the build on GitHub and uploads `dist/`. The `deploy` job runs on a self-hosted runner on
the server, which accepts no inbound connections, and pipes the build into
`sudo -u gainz gainz-deploy <sha>`. The `deploy` job is skipped unless the push changed something
the build reads: `src/` other than `*.test.ts`, `package.json`, `bun.lock`, `bunfig.toml`,
`tsconfig.json` or `.bun-version`. A push whose previous head is unknown, such as a force push,
always deploys. Pull requests get the `check` job only. Actions are pinned to
commit SHAs, and CI's Bun comes from `.bun-version`.

The runner's user, `gh-runner`, may run only `/usr/local/bin/gainz-deploy` as `gainz`
(`deploy/gh-runner.sudoers`), and nothing as root. gainz runs as a systemd user service of `gainz`
(`deploy/gainz.service`), kept running by lingering.

`deploy/gainz-deploy`:

1. unpacks the build into `/home/gainz/app/releases/<sha>`
2. installs the Bun named in `bun-version` into `/home/gainz/app/bun/<version>`, verified against
   the release's `SHASUMS256.txt`, and links it as the release's `bun`
3. stops the service and snapshots the database into `/home/gainz/app/backups`
4. points `/home/gainz/app/current` at the release and starts the service
5. rolls back release, Bun and database if `/api/health` does not answer `"auth":true` within 30
   seconds
6. keeps five releases and ten snapshots

Each release runs on the Bun that built it, so upgrading Bun is just the pull request that bumps
`.bun-version`. The paths and port 3000 are constants at the top of the script.

## Server setup

Once, on the Fedora server, with the repository's `deploy/` directory copied over:

```sh
sudo dnf install -y curl unzip tar util-linux
sudo useradd --system --create-home --home-dir /home/gainz --shell /sbin/nologin gainz
sudo loginctl enable-linger gainz
sudo -u gainz mkdir -p /home/gainz/app /home/gainz/.config/systemd/user
sudo -u gainz sh -c 'umask 077 && cat > /home/gainz/app/gainz.env' <<'EOF'
GAINZ_PASSWORD_HASH='<hash>'
EOF
sudo install -o gainz -g gainz -m 0644 deploy/gainz.service /home/gainz/.config/systemd/user/gainz.service
sudo systemctl --user -M gainz@ daemon-reload
sudo systemctl --user -M gainz@ enable gainz
sudo install -m 0755 deploy/gainz-deploy /usr/local/bin/gainz-deploy
sudo install -m 0440 deploy/gh-runner.sudoers /etc/sudoers.d/gh-runner
```

The first deploy creates the release, the database and Bun, and starts the service. CI never
updates `deploy/gainz.service` or `deploy/gainz-deploy`: after changing one, rerun its `install`
line, and for the unit also `daemon-reload` and `restart gainz`.

Then the runner, with a token from _Settings → Actions → Runners → New self-hosted runner_:

```sh
sudo useradd --system --create-home --home-dir /var/lib/gh-runner --shell /sbin/nologin gh-runner
sudo -u gh-runner mkdir /var/lib/gh-runner/actions-runner
cd /var/lib/gh-runner/actions-runner
sudo -u gh-runner sh -c 'curl -fsSL <runner tarball URL> | tar -xz'
sudo ./bin/installdependencies.sh
sudo -u gh-runner ./config.sh --unattended --url https://github.com/dhardtke/gainz --token <token> \
  --labels gainz-prod --name "$(hostname)"
sudo ./svc.sh install gh-runner && sudo ./svc.sh start
```

If the runner service fails with `203/EXEC`, SELinux is blocking `runsvc.sh`:

```sh
sudo semanage fcontext -a -t bin_t '/var/lib/gh-runner/actions-runner/runsvc\.sh'
sudo restorecon -v /var/lib/gh-runner/actions-runner/runsvc.sh
```

Finally, create the `production` environment (_Settings → Environments_) and restrict it to `main`.

### Reverse proxy

The HTTPS reverse proxy must connect over loopback and append the client's address to
`X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`; Caddy
does it on its own). The login throttle keys on the last entry, and trusts the header only from
`127.0.0.1` or `::1`; without it, every client shares one throttle again. gainz sends its own
`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy`; the
proxy adds `Strict-Transport-Security`, since only it knows the site is served over HTTPS.

## Operating

```sh
sudo systemctl --user -M gainz@ status gainz
sudo journalctl _SYSTEMD_USER_UNIT=gainz.service -f        # -p warning or -p err to filter
curl -s http://127.0.0.1:3000/api/health
```

The password hash comes from `bun run hash-password` and lives in `/home/gainz/app/gainz.env`
(mode `0600`). Keep it in single quotes, or systemd expands its `$` signs. Without the file the
service does not start. To change the password, replace the hash and restart the service; this
logs every device out.
