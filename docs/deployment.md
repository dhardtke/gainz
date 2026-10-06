# Deployment

Every push to `main` runs `.github/workflows/ci.yml`. The `check` job runs format, lint, typecheck,
tests and the build on a GitHub-hosted runner and uploads `dist/` as an artifact. The `deploy` job
then runs on a self-hosted runner on the server, downloads that artifact and pipes it as a tar
archive into `sudo -u gainz gainz-deploy <sha>`. Pull requests get the `check` job only.

The runner lives on the server because the server accepts no inbound connections: it polls GitHub
over outbound HTTPS, so nothing needs an open SSH port. Only the deploy runs there. Dependencies,
tests and the build — everything that executes code from the repository — stay on GitHub's
machines, and the server only receives the built file.

## Privileges

A job can do anything its runner's Linux user can do, so the runner gets its own user,
`gh-runner`, with no rights beyond one sudo rule (`deploy/gh-runner.sudoers`): it may run
`/usr/local/bin/gainz-deploy` as `gainz`, and nothing as root. That script (`deploy/gainz-deploy`)
is owned by root, so neither user can change what the rule allows, and it is the only way from a
workflow to the app.

No root is needed because gainz runs as a systemd user service of the `gainz` user
(`deploy/gainz.service`), which lingering starts at boot without a login, so the deploy can stop
and start it as `gainz`. The build arrives on standard input rather than as a path because
`gainz` cannot read the runner's work directory, and should not have to.

The script unpacks the build into `/home/gainz/app/releases/<sha>`, stops the service, snapshots
the database with `VACUUM INTO` into `/home/gainz/app/backups`, points `/home/gainz/app/current`
at the new release and starts the service again. If `/api/health` does not answer within 30
seconds, or answers without `"auth":true` — the release came up with no password and would serve
the log to anyone — it puts both the previous release and the snapshot back. The snapshot is taken with the
service stopped because migrations run on start: once a new release has migrated the schema, the
old code cannot be trusted with it, so a rollback restores the database as well as the code. The
script keeps the last five releases and ten snapshots.

The server's paths are constants at the top of the script: the app in `/home/gainz/app`, the
database in its `data/gainz.sqlite`, Bun in `/home/gainz/.bun/bin/bun`, and port 3000, since the
unit sets no `PORT`. A change to any of them on the server is a change to the script.

The actions in the workflow are pinned to commit SHAs, matching the exact pinning of
dependencies in `docs/coding-guidelines.md`; a tag can be moved, a SHA cannot. The Bun that CI
runs is read from `.bun-version`, so Renovate can update it.

## Server setup

On the Fedora server, once, retire the system service, move the running build into the release
layout and start gainz as a user service:

```sh
sudo systemctl disable --now gainz
sudo rm /etc/systemd/system/gainz.service && sudo systemctl daemon-reload
sudo -u gainz sh -c 'cd /home/gainz/app && mkdir -p releases/initial \
  && mv gainz.js* releases/initial/ && ln -s releases/initial current \
  && mkdir -p /home/gainz/.config/systemd/user'
# the env file with the password hash; see "Password" below
sudo -u gainz sh -c 'umask 077 && cat > /home/gainz/app/gainz.env' <<'EOF'
GAINZ_PASSWORD_HASH='<hash>'
EOF
sudo install -o gainz -g gainz -m 0644 deploy/gainz.service /home/gainz/.config/systemd/user/gainz.service
sudo loginctl enable-linger gainz
sudo systemctl --user -M gainz@ daemon-reload
sudo systemctl --user -M gainz@ enable --now gainz
sudo install -m 0755 deploy/gainz-deploy /usr/local/bin/gainz-deploy
sudo install -m 0440 deploy/gh-runner.sudoers /etc/sudoers.d/gh-runner
```

From then on the service is inspected as the user's:
`sudo systemctl --user -M gainz@ status gainz` and `sudo journalctl _SYSTEMD_USER_UNIT=gainz.service`.

Then the runner, with a token from the repository's _Settings → Actions → Runners → New
self-hosted runner_:

```sh
sudo useradd --system --create-home --home-dir /var/lib/gh-runner --shell /sbin/nologin gh-runner
sudo -u gh-runner mkdir /var/lib/gh-runner/actions-runner
cd /var/lib/gh-runner/actions-runner
# as gh-runner, so config.sh can write here: the URL and version are on that page
sudo -u gh-runner sh -c 'curl -fsSL <runner tarball URL> | tar -xz'
sudo ./bin/installdependencies.sh
sudo -u gh-runner ./config.sh --unattended --url https://github.com/dhardtke/gainz --token <token> \
  --labels gainz-prod --name "$(hostname)"
sudo ./svc.sh install gh-runner && sudo ./svc.sh start
```

If the runner service fails with `203/EXEC`, SELinux is refusing to let systemd execute a script
labeled as state data under `/var/lib`. Label it as a program instead of switching SELinux off:

```sh
sudo semanage fcontext -a -t bin_t '/var/lib/gh-runner/actions-runner/runsvc\.sh'
sudo restorecon -v /var/lib/gh-runner/actions-runner/runsvc.sh
```

In the repository, create the `production` environment (_Settings → Environments_) and restrict
its deployment branches to `main`.

Bun on the server is upgraded by hand, as the `gainz` user, whenever `engines.bun` moves.

## Password

The app asks for a password once `GAINZ_PASSWORD_HASH` is set (see "Authentication" in
`docs/backend.md`). In production it comes from `/home/gainz/app/gainz.env`, which the unit reads
with `EnvironmentFile=` and no `-` prefix, so the service does not start at all without the file,
and `gainz-deploy` rolls back a release whose health check reports `"auth":false`.

1. On any machine with a checkout, run `bun run hash-password`. It asks for the password twice
   without echoing it and prints an argon2id hash.
2. On the server, write the hash into `/home/gainz/app/gainz.env`, owned by `gainz` with mode
   `0600`, as the server setup above does. Keep the value in single quotes:
   `GAINZ_PASSWORD_HASH='$argon2id$v=19$…'`. systemd would otherwise expand the `$` signs in it.
3. Reinstall the unit and reload it, and reinstall the deploy script. The CI can do neither: it
   only ever replaces the release.

   ```sh
   sudo install -o gainz -g gainz -m 0644 deploy/gainz.service /home/gainz/.config/systemd/user/gainz.service
   sudo systemctl --user -M gainz@ daemon-reload
   sudo systemctl --user -M gainz@ restart gainz
   sudo install -m 0755 deploy/gainz-deploy /usr/local/bin/gainz-deploy
   ```

4. Push. The deploy checks for `"auth":true` itself; `curl -s http://127.0.0.1:3000/api/health`
   shows it afterwards. A release from before the login reports no `auth` at all.

The order matters: the env file before the unit, or the restarted service will not start; the unit
before the script, or the new script would roll back every deploy of a server still running
without a password; and both before the push that carries the login.

To change the password, replace the hash in `gainz.env` and restart the service. The session
cookies are signed with the hash, so the change logs every device out.

## Before the repository goes public

A pull request's workflows run from the pull request's own files, so on a public repository a
fork could add a workflow with `runs-on: self-hosted` and get a shell as `gh-runner`. The sudo
rule keeps that from reaching root, but not from deploying an arbitrary build through
`gainz-deploy` or reaching the rest of the private network. Before switching the visibility:

- Set _Settings → Actions → General → Approval for running fork pull request workflows_ to
  _Require approval for all external contributors_, and read every workflow change before
  approving a run.
- Consider running the runner with `--ephemeral`, so each job gets a fresh registration and
  nothing a job leaves behind survives into the next one.
