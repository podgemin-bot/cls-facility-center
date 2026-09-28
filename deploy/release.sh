#!/usr/bin/env bash
# Deploy a release of CLS Facility Center on this ARM64 host.
# Builds from git on the machine, runs migrations once, swaps the release
# symlink, restarts systemd and health-checks. Rolls the symlink back on failure.
# Note: database migrations are never rolled back automatically.
set -Eeuo pipefail

CLS_USER="${CLS_USER:-cls}"
APP_ROOT="${APP_ROOT:-/opt/cls-facility}"
ENV_DIR="${ENV_DIR:-/etc/cls-facility}"
ENV_FILE="${ENV_DIR:-/etc/cls-facility}/env"
VERIFY_ENV_FILE="${ENV_DIR:-/etc/cls-facility}/verify.env"
RELEASES_DIR="$APP_ROOT/releases"
REPO_DIR="$APP_ROOT/repo"
CURRENT_LINK="$APP_ROOT/current"
SERVICE="${SERVICE:-cls-facility}"
PORT="${PORT:-3000}"
HEALTH_URL="http://127.0.0.1:$PORT/login"
KEEP="${KEEP:-3}"
REF="origin/main"
RUN_FULL=0
RUN_VERIFY_FRESH=0
DRY_RUN=0
ASSUME_YES=0
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"

usage() {
  cat <<EOF
usage: release.sh [options]

  --ref <sha|branch>  what to deploy (default: origin/main)
  --keep N            releases to keep on disk (default: $KEEP)
  --full              also run lint, tests and typecheck (CI normally covers this)
  --verify-fresh      run db:verify-fresh on a throwaway DB before migrating
  --yes               skip the confirmation prompt
  --dry-run           build only, do not migrate, swap or restart
EOF
}

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="${2:?--ref needs a value}"; shift 2 ;;
    --keep) KEEP="${2:?--keep needs a value}"; shift 2 ;;
    --full) RUN_FULL=1; shift ;;
    --verify-fresh) RUN_VERIFY_FRESH=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

[[ ${EUID} -eq 0 ]] || die "run as root: $APP_ROOT/bin/release.sh"
[[ "$KEEP" =~ ^[0-9]+$ ]] && (( KEEP >= 2 )) || die "--keep must be a number >= 2"
[[ -s "$ENV_FILE" ]] || die "$ENV_FILE is missing — run deploy/bootstrap-ubuntu.sh first"
[[ -d "$REPO_DIR/.git" ]] || die "$REPO_DIR is not a git repo"
command -v flock >/dev/null || die "flock is required (apt-get install util-linux)"

exec 9>/var/lock/cls-deploy.lock
flock -n 9 || die "another deploy is running (lock /var/lock/cls-deploy.lock)"

# systemd reads this file with quotes intact. An unquoted "&" in DATABASE_URL
# would be a background operator once bash sources it, so refuse to run instead.
if grep -nE '^[A-Za-z_][A-Za-z0-9_]*=[^"'"'"']*&' "$ENV_FILE" >/dev/null 2>&1; then
  die "$ENV_FILE has an unquoted '&' in a value — wrap every value in double quotes"
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL missing from $ENV_FILE}"
: "${PRIVATE_STORAGE_ROOT:?PRIVATE_STORAGE_ROOT missing from $ENV_FILE}"
if [[ "$PRIVATE_STORAGE_ROOT" != /* ]]; then
  die "PRIVATE_STORAGE_ROOT must be an absolute path (got $PRIVATE_STORAGE_ROOT)"
fi
case "$PRIVATE_STORAGE_ROOT" in
  */public|*/public/*) die "PRIVATE_STORAGE_ROOT must not live under public/" ;;
esac

NODE_BIN="$(command -v node)"
NODE_SCALED="$("$NODE_BIN" -p 'process.versions.node.split(".").slice(0,2).map(Number).reduce((a,b)=>a*100+b)')"
if (( NODE_SCALED < 2212 )); then die "node >= 22.12 required, found $("$NODE_BIN" -v)"; fi

# mysql client credentials in a 0600 file so they never show up in ps or history
MYSQL_DEFAULTS="$(mktemp)"
trap 'rm -f "$MYSQL_DEFAULTS"' EXIT
chmod 600 "$MYSQL_DEFAULTS"
"$NODE_BIN" -e '
const fs = require("node:fs");
const url = new URL(process.argv[1]);
fs.writeFileSync(process.argv[2], [
  "[client]",
  `host=${url.hostname}`,
  `port=${url.port || 3306}`,
  `user=${decodeURIComponent(url.username)}`,
  `password=${decodeURIComponent(url.password)}`,
  "",
].join("\n"));
' "$DATABASE_URL" "$MYSQL_DEFAULTS"

log "preflight"
if ! systemctl is-active --quiet mariadb; then die "mariadb is not running"; fi
if ! mariadb-admin --defaults-extra-file="$MYSQL_DEFAULTS" ping >/dev/null 2>&1; then
  die "cannot reach the database as the app user — check DATABASE_URL"
fi
AVAIL_MB="$(df -Pm "$APP_ROOT" | awk 'NR==2 {print $4}')"
if (( AVAIL_MB <= 3000 )); then die "only ${AVAIL_MB}MB free on $APP_ROOT — need more than 3GB to build"; fi

git -C "$REPO_DIR" fetch --prune origin
SHA="$(git -C "$REPO_DIR" rev-parse "$REF^{commit}")"
SHORT_SHA="$(git -C "$REPO_DIR" rev-parse --short "$SHA")"
RELEASE_ID="${RELEASE_ID}-${SHORT_SHA}"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
CURRENT_TARGET="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
if [[ -n "$CURRENT_TARGET" && -f "$CURRENT_TARGET/.deploy-sha" ]] && \
   [[ "$(cat "$CURRENT_TARGET/.deploy-sha")" == "$SHA" ]]; then
  log "$SHORT_SHA is already live — nothing to do"
  exit 0
fi

if (( ASSUME_YES == 0 && DRY_RUN == 0 )) && [[ -t 0 ]]; then
  read -r -p "Deploy $SHORT_SHA and restart $SERVICE? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || die "aborted"
fi

log "building release $RELEASE_ID from $REF"
rm -rf "$RELEASE_DIR"
install -d -m 0755 -o root -g root "$RELEASE_DIR"
git -C "$REPO_DIR" archive --format=tar "$SHA" | tar -x -C "$RELEASE_DIR"
printf '%s\n' "$SHA" > "$RELEASE_DIR/.deploy-sha"
date -u +%Y-%m-%dT%H:%M:%SZ > "$RELEASE_DIR/.deploy-time"
cd "$RELEASE_DIR"

log "npm ci (slowest step on ARM64)"
/usr/local/bin/npm ci --no-audit --no-fund
log "prisma generate"
/usr/local/bin/npx prisma generate

if (( RUN_FULL )); then
  log "lint + typecheck + tests"
  /usr/local/bin/npm run lint
  /usr/local/bin/npx tsc --noEmit
  /usr/local/bin/npm test
else
  warn "skipping lint/tests/typecheck — make sure CI is green for $SHORT_SHA"
fi

log "next build on $(uname -m) with node $("$NODE_BIN" -v)"
/usr/local/bin/npm run build

if (( RUN_VERIFY_FRESH )); then
  log "verifying migrations on a throwaway database (Linux case-sensitive check)"
  [[ -s "$VERIFY_ENV_FILE" ]] || \
    die "--verify-fresh needs $VERIFY_ENV_FILE with VERIFY_ADMIN_DATABASE_URL (root-only, 0600)"
  set -a
  # shellcheck disable=SC1090
  . "$VERIFY_ENV_FILE"
  set +a
  : "${VERIFY_ADMIN_DATABASE_URL:?VERIFY_ADMIN_DATABASE_URL missing from $VERIFY_ENV_FILE}"
  DATABASE_URL="$VERIFY_ADMIN_DATABASE_URL" /usr/local/bin/npm run db:verify-fresh
  unset VERIFY_ADMIN_DATABASE_URL
fi

if (( DRY_RUN )); then
  log "dry run: build succeeded, nothing migrated or switched"
  exit 0
fi

log "dumping the database before migrating"
if [[ -x "$APP_ROOT/bin/backup.sh" ]]; then
  "$APP_ROOT/bin/backup.sh" --db-only || die "pre-migration backup failed — refusing to migrate"
else
  warn "backup.sh missing — migrating without a fresh backup"
fi

log "prisma migrate deploy"
/usr/local/bin/npx prisma migrate deploy

chown -R "$CLS_USER:$CLS_USER" "$RELEASE_DIR"

log "switching current -> releases/$RELEASE_ID"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"

log "restarting $SERVICE"
systemctl restart "$SERVICE"

log "health-checking $HEALTH_URL"
healthy=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL"; then healthy=1; break; fi
  sleep 2
done

if (( healthy == 0 )); then
  warn "health check failed — rolling back"
  if [[ -n "$CURRENT_TARGET" && -d "$CURRENT_TARGET" ]]; then
    ln -sfn "$CURRENT_TARGET" "$CURRENT_LINK.next"
    mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
    systemctl restart "$SERVICE"
    for _ in $(seq 1 15); do curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL" && break; sleep 2; done
    warn "rolled back to $(basename "$CURRENT_TARGET")"
  else
    warn "no previous release to roll back to"
  fi
  die "deploy failed — journalctl -u $SERVICE -n 100 --no-pager (DB migrations are not rolled back)"
fi

log "live: $SHA"
/usr/local/bin/npm run user:list 2>/dev/null | head -20 || warn "user:list failed (is $CLS_USER able to read DATABASE_URL?)"

log "pruning old releases (keeping $KEEP)"
if (( KEEP < 100 )); then
  while read -r old; do
    if [[ "$old" == "$RELEASE_DIR/" ]]; then continue; fi
    if [[ "$old" == "${CURRENT_TARGET:-/nonexistent}/" ]]; then continue; fi
    rm -rf "$old" && echo "removed $old"
  done < <(ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n "+$(( KEEP + 1 ))")
fi
df -h "$APP_ROOT" | tail -1
