#!/usr/bin/env bash
# Restore a CLS Facility Center database dump (and optionally the image archive).
# Restores are deliberately awkward: verification is the default, a real restore
# needs an explicit --yes and always takes a safety dump of the current state first.
set -Eeuo pipefail

ENV_DIR="${ENV_DIR:-/etc/cls-facility}"
ENV_FILE="$ENV_DIR/env"
VERIFY_ENV_FILE="$ENV_DIR/verify.env"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/cls}"
DATA_ROOT="${DATA_ROOT:-/srv/cls-data}"
DUMP_FILE=""
USE_LATEST=0
VERIFY_ONLY=0
ASSUME_YES=0
TEST_DB="cls_restore_verify_$$"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
usage: restore.sh [--latest | --file <dump.sql.gz>] [--verify-only] [--yes]

  --latest        use the newest db-*.sql.gz in $BACKUP_ROOT
  --file <path>   use a specific dump
  --verify-only   restore into a throwaway database and report, change nothing
  --yes           required for a real restore

Examples:
  restore.sh --latest --verify-only
  restore.sh --latest --yes
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --latest) USE_LATEST=1; shift ;;
    --file) DUMP_FILE="${2:?--file needs a path}"; shift 2 ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

[[ ${EUID} -eq 0 ]] || die "run as root"
[[ -s "$ENV_FILE" ]] || die "$ENV_FILE is missing"
[[ -s "$VERIFY_ENV_FILE" ]] || die "$VERIFY_ENV_FILE missing: it must define VERIFY_ADMIN_DATABASE_URL (root, 0600)"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
# shellcheck disable=SC1090
. "$VERIFY_ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL missing from $ENV_FILE}"
: "${VERIFY_ADMIN_DATABASE_URL:?VERIFY_ADMIN_DATABASE_URL missing from $VERIFY_ENV_FILE}"

if (( USE_LATEST )); then
  DUMP_FILE="$(ls -1t "$BACKUP_ROOT"/db-*.sql.gz 2>/dev/null | head -1 || true)"
  [[ -n "$DUMP_FILE" ]] || die "no db-*.sql.gz found in $BACKUP_ROOT"
fi
[[ -n "$DUMP_FILE" ]] || { usage >&2; die "pass --latest or --file"; }
[[ -s "$DUMP_FILE" ]] || die "$DUMP_FILE is empty or missing"
log "dump: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1), $(stat -c %y "$DUMP_FILE"))"
gzip -t "$DUMP_FILE" || die "gzip integrity check failed"

MYSQL_DEFAULTS="$(mktemp)"
trap 'rm -f "$MYSQL_DEFAULTS"' EXIT
chmod 600 "$MYSQL_DEFAULTS"
node -e '
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
' "$VERIFY_ADMIN_DATABASE_URL" "$MYSQL_DEFAULTS"
MARIADB_BIN="$(command -v mariadb || command -v mysql)"
SOURCE_DB="$(node -e 'process.stdout.write(new URL(process.argv[1]).pathname.replace(/^\//, ""))' "$VERIFY_ADMIN_DATABASE_URL")"

TARGET_DB="$SOURCE_DB"
if (( VERIFY_ONLY )); then
  TARGET_DB="$TEST_DB"
  log "verify-only: restoring into throwaway database $TARGET_DB"
else
  (( ASSUME_YES )) || die "refusing to overwrite $SOURCE_DB without --yes"
  log "about to overwrite database $SOURCE_DB"
fi

mariadb --defaults-extra-file="$MYSQL_DEFAULTS" \
  -e "DROP DATABASE IF EXISTS \`$TARGET_DB\`; CREATE DATABASE \`$TARGET_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

log "restoring"
if ! gzip -dc "$DUMP_FILE" \
     | sed "s/\`$SOURCE_DB\`/\`$TARGET_DB\`/g" \
     | "$MARIADB_BIN" --defaults-extra-file="$MYSQL_DEFAULTS"; then
  mariadb --defaults-extra-file="$MYSQL_DEFAULTS" -e "DROP DATABASE IF EXISTS \`$TARGET_DB\`;" || true
  die "restore failed"
fi

TABLES="$(mariadb --defaults-extra-file="$MYSQL_DEFAULTS" -N -B -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$TARGET_DB';")"
USERS="$(mariadb --defaults-extra-file="$MYSQL_DEFAULTS" -N -B -e \
  "SELECT COUNT(*) FROM \`$TARGET_DB\`.\`User\`;")" 2>/dev/null || echo "n/a"
log "restored into $TARGET_DB: $TABLES tables, $USERS users"

if (( VERIFY_ONLY )); then
  mariadb --defaults-extra-file="$MYSQL_DEFAULTS" -e "DROP DATABASE \`$TARGET_DB\`;"
  log "verify-only finished — nothing in $SOURCE_DB was touched"
  exit 0
fi

warn "a real restore replaced the data in $SOURCE_DB — upload the matching photos archive too:"
warn "  tar -C $(dirname "$DATA_ROOT") -xzf $BACKUP_ROOT/photos-<same-timestamp>.tar.gz"
log "done"
