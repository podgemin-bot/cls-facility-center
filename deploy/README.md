# Production runbook (Oracle Always Free ARM64 / Ampere A1)

Runtime: Node.js 22.12 + `npm run start` under systemd, MariaDB bound to `127.0.0.1`,
Caddy in front for TLS. No Docker, no GitHub Pages, no Vercel. The app is always
built on the VM — never copy `.next` or `node_modules` from Windows/x64.

| Path | Purpose |
| ---- | ------- |
| `/opt/cls-facility/repo` | git clone the CI/CD pipeline and operators use |
| `/opt/cls-facility/releases/<ts>-<sha>` | immutable release directories |
| `/opt/cls-facility/current` | symlink systemd runs from |
| `/opt/cls-facility/bin` | `release.sh`, `backup.sh`, `restore.sh` |
| `/etc/cls-facility/env` | app environment, `0640 root:cls`, **values stay quoted** |
| `/etc/cls-facility/verify.env` | privileged DB URL for verify/restore, `0600 root` |
| `/srv/cls-data` | `PRIVATE_STORAGE_ROOT` (`room-photos/`, `floor-plans/`) |
| `/var/backups/cls` | local dumps + image archives |

## 1. Provision the VM

In Oracle Cloud: create an **Ampere A1** shape (1–2 OCPU, 6–12 GB), Ubuntu 24.04
(arm64), add an SSH key, attach a 50 GB boot volume, and open only TCP 22/80/443 in
the VCN security list. Pick a home region near Thailand that still has A1 capacity.

```bash
scp -r deploy ubuntu@<vm>:/tmp/cls-deploy
ssh ubuntu@<vm> 'sudo -E bash /tmp/cls-deploy/bootstrap-ubuntu.sh' \
  # with CLS_HOST=cls.example.org ACME_EMAIL=ops@example.org
```

The script is idempotent and installs: pinned Node tarball, MariaDB (loopback only,
`lower_case_table_names=0`), the `cls` service user, the two database accounts,
Caddy with the site config, ufw, unattended upgrades, the systemd units, and a
read-only deploy key. It prints every file it wrote and the follow-up steps.

## 2. First deploy

```bash
sudo /opt/cls-facility/bin/release.sh --full --verify-fresh
```

`--full` runs lint, typecheck and the test suite on ARM64, `--verify-fresh` replays
all five migrations twice on a throwaway database (this is the check that only
passed on Windows so far — Linux is case-sensitive). Then set
`BETTER_AUTH_URL` in `/etc/cls-facility/env` to the real HTTPS URL and reload:

```bash
sudo sed -i "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=\"https://cls.example.org\"|" /etc/cls-facility/env
sudo systemctl restart cls-facility
```

## 3. Automated deploys

`.github/workflows/deploy.yml` runs after a green `CI` run on `main` (or manually
via `workflow_dispatch`). It copies the deploy scripts over SSH and calls
`release.sh --ref <sha>`. Add these repository secrets:

| Secret | Value |
| ------ | ----- |
| `DEPLOY_HOST` | VM hostname or IP |
| `DEPLOY_USER` | SSH user with **passwordless sudo** for `/opt/cls-facility/bin/*` |
| `DEPLOY_SSH_KEY` | private key matching the authorized key on the VM |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -p 22 <host>` — never use strict-host-key-checking off |

Because GitHub does not set a user for `workflow_run`, prefer a dedicated deploy
user whose `authorized_keys` entry restricts the command, or accept that the key
can run any command the user can.

## 4. Day-to-day

```bash
systemctl status cls-facility --no-pager
journalctl -u cls-facility -f                 # live logs
sudo /opt/cls-facility/bin/release.sh --ref <sha> --yes   # manual deploy
readlink -f /opt/cls-facility/current         # what is live
sudo /opt/cls-facility/bin/release.sh --dry-run --full    # build without going live
```

Rollback is automatic when the health check fails: the previous symlink is restored
and the service is restarted. **Database migrations are never rolled back** — take
a dump before any risky change (`backup.sh --db-only`, which `release.sh` already
does automatically).

To roll back by hand: point `current` at the older release directory and restart.

Caddy must keep forwarding the public host in `X-Forwarded-Host` (its default).
Next.js compares the browser `Origin` against `X-Forwarded-Host` for Server Actions
and rejects mismatches, so replacing Caddy with a proxy that rewrites the host will
break every save button until `serverActions.allowedOrigins` is configured.

## 5. Backups

`cls-backup.timer` runs `backup.sh` daily at 02:30 UTC. For offsite copies set in
`/etc/cls-facility/backup.env` (mode 0640):

```
OCI_BUCKET=cls-backups
OCI_AUTH=instance_principal
```

The instance principal needs a dynamic group and a policy allowing
`object-extensions`/`bucket-read` on that bucket, and the OCI CLI installed on the VM.
Uploads go to `daily/` (7 newest kept) and to `weekly/` on Sundays (4 newest kept).

```bash
sudo systemctl start cls-backup.service     # run now, logs to journalctl -u cls-backup
sudo /opt/cls-facility/bin/restore.sh --latest --verify-only   # proves a dump loads
sudo /opt/cls-facility/bin/restore.sh --latest --yes           # actually restore
```

A verify run restores into a throwaway database, reports table and user counts, then
drops it. Do this at least once before go-live, and again after the first real backup
timer fires.

## 6. Go-live checklist

- [ ] `ss -ltnp | grep 3306` shows `127.0.0.1:3306` only
- [ ] `npm run user:reset` used to rotate all dev accounts, `test-admin*` accounts deleted (`npm run user:list`)
- [ ] `BETTER_AUTH_URL` matches the public URL exactly; cookies are `Secure`
- [ ] `forged cookie` and direct hits on `/api/rooms/*/photos/*` are rejected while signed in
- [ ] `sudo reboot` → service comes back, data and photos still there
- [ ] one real `backup.sh` run uploaded, and `restore.sh --verify-only` passed
