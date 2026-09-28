#!/usr/bin/env bash
# Backup CLS Facility Center: MariaDB dump + private image storage.
# Local copies stay in $BACKUP_ROOT; when OCI_BUCKET is set the same files are
# uploaded to OCI Object Storage (7 daily + 4 weekly) using the instance
# principal, so no API keys have to live on the host.
set -Eeuo pipefail

ENV_DIR="${ENV_DIR:-/etc/cls-facility}"
ENV_FILE="$ENV_DIR/env"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/cls}"
DATA_ROOT="${DATA_ROOT:-/srv/cls-data}"
KEEP_DAYS="${KEEP_DAYS:-7}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
DB_ONLY=0

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only) DB_ONLY=1; shift ;;
    -h|--help) echo "usage: backup.sh [--db-only]"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ ${EUID} -eq 0 ]] || die "run as root (systemd timer runs it as root)"
[[ -s "$ENV_FILE" ]] || die "$ENV_FILE is missing"
install -d -m 0700 "$BACKUP_ROOT"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL missing from $ENV_FILE}"
: "${PRIVATE_STORAGE_ROOT:?PRIVATE_STORAGE_ROOT missing from $ENV_FILE}"

DUMP_BIN="$(command -v mariadb-dump || command -v mysqldump || true)"
[[ -n "$DUMP_BIN" ]] || die "mariadb-dump/mysqldump not found (apt-get install mariadb-client)"

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
' "$DATABASE_URL" "$MYSQL_DEFAULTS"

DB_NAME="$(node -e 'process.stdout.write(new URL(process.argv[1]).pathname.replace(/^\//, ""))' "$DATABASE_URL")"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DOW="$(date -u +%u)"

log "dumping $DB_NAME"
DB_FILE="$BACKUP_ROOT/db-$STAMP.sql.gz"
"$DUMP_BIN" --defaults-extra-file="$MYSQL_DEFAULTS" \
  --single-transaction --quick --routines --events --triggers \
  --default-character-set=utf8mb4 --hex-blob --databases "$DB_NAME" | gzip -9 > "$DB_FILE"
chmod 600 "$DB_FILE"
gzip -t "$DB_FILE" || die "dump failed integrity check"
log "db dump: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

if (( DB_ONLY == 0 )); then
  if [[ -d "$DATA_ROOT" ]]; then
    PHOTO_FILE="$BACKUP_ROOT/photos-$STAMP.tar.gz"
    log "archiving $DATA_ROOT"
    tar -C "$(dirname "$DATA_ROOT")" -czf "$PHOTO_FILE" --warning=no-file-changed "$(basename "$DATA_ROOT")" \
      || die "image archive failed"
    chmod 600 "$PHOTO_FILE"
    tar -tzf "$PHOTO_FILE" >/dev/null || die "image archive failed integrity check"
    log "image archive: $PHOTO_FILE ($(du -h "$PHOTO_FILE" | cut -f1))"
  else
    warn "$DATA_ROOT not found — no image archive"
  fi
fi

log "pruning local backups older than $KEEP_DAYS days"
find "$BACKUP_ROOT" -maxdepth 1 -type f -mtime "+$KEEP_DAYS" -print -delete

# --------------------------------------------------------------------- OCI upload
if [[ -z "${OCI_BUCKET:-}" ]]; then
  log "OCI_BUCKET not set — local backup only (set it in $ENV_DIR/backup.env for offsite copies)"
  exit 0
fi

command -v oci >/dev/null || die "OCI_BUCKET is set but the oci CLI is missing"
OCI_AUTH_ARGS=(--auth instance_principal)
if [[ "${OCI_AUTH:-instance_principal}" != "instance_principal" ]]; then
  OCI_AUTH_ARGS=()
fi
namespace="$(oci os ns get "${OCI_AUTH_ARGS[@]}" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => process.stdout.write(JSON.parse(raw).data));
')"
[[ -n "$namespace" ]] || die "could not resolve the OCI object storage namespace"

if ! oci os bucket exists --namespace "$namespace" --bucket-name "$OCI_BUCKET" "${OCI_AUTH_ARGS[@]}" >/dev/null 2>&1; then
  die "bucket $OCI_BUCKET is missing. Create it once with:
  oci os bucket create --namespace $namespace --name $OCI_BUCKET --compartment-id <your-compartment-id> --access-type Private"
fi

upload() {
  local file="$1" name="$2"
  oci os object put --namespace "$namespace" --bucket-name "$OCI_BUCKET" \
    --file "$file" --name "$name" "${OCI_AUTH_ARGS[@]}" >/dev/null
  echo "uploaded $name"
}

prune_prefix() {
  local prefix="$1" keep="$2"
  mapfile -t objects < <(
    oci os object list --namespace "$namespace" --bucket-name "$OCI_BUCKET" \
      --prefix "$prefix" --fields name "${OCI_AUTH_ARGS[@]}" \
      | node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
  for (const item of JSON.parse(raw).data) console.log(item.name);
});
' | sort -r
  )
  local total=${#objects[@]}
  if (( total > keep )); then
    for (( i = keep; i < total; i++ )); do
      oci os object delete --namespace "$namespace" --bucket-name "$OCI_BUCKET" \
        --name "${objects[$i]}" "${OCI_AUTH_ARGS[@]}" >/dev/null && echo "deleted ${objects[$i]}"
    done
  fi
}

log "uploading to oci bucket $OCI_BUCKET (namespace $namespace)"
upload "$DB_FILE" "daily/$(basename "$DB_FILE")"
if (( DB_ONLY == 0 )) && [[ -f "${PHOTO_FILE:-}" ]]; then
  upload "$PHOTO_FILE" "daily/$(basename "$PHOTO_FILE")"
fi
if [[ "$DOW" == "7" ]]; then
  log "Sunday — also copying to weekly/"
  upload "$DB_FILE" "weekly/$(basename "$DB_FILE")"
  if [[ -f "${PHOTO_FILE:-}" ]]; then upload "$PHOTO_FILE" "weekly/$(basename "$PHOTO_FILE")"; fi
fi

log "pruning remote copies (daily $KEEP_DAILY, weekly $KEEP_WEEKLY)"
prune_prefix "daily/" "$KEEP_DAILY"
prune_prefix "weekly/" "$KEEP_WEEKLY"
log "backup complete"
