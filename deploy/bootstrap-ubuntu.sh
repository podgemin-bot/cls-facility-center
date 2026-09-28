#!/usr/bin/env bash
# One-time provisioning for the CLS Facility Center host (Ubuntu ARM64 / Ampere A1).
# Idempotent: safe to re-run after a failure. Never uploads Windows artifacts;
# the app is always built on this machine.
set -Eeuo pipefail

CLS_USER="${CLS_USER:-cls}"
APP_ROOT="${APP_ROOT:-/opt/cls-facility}"
ENV_DIR="${ENV_DIR:-/etc/cls-facility}"
ENV_FILE="$ENV_DIR/env"
DATA_ROOT="${DATA_ROOT:-/srv/cls-data}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/cls}"
RELEASES_DIR="$APP_ROOT/releases"
REPO_DIR="$APP_ROOT/repo"
DEPLOY_KEY="${DEPLOY_KEY:-/root/.ssh/cls_deploy_key}"
GIT_REPO="${GIT_REPO:-git@github.com:podgemin-bot/cls-facility-center.git}"
NODE_VERSION="${NODE_VERSION:-22.12.0}"
DB_NAME="${DB_NAME:-cls_facility}"
DB_USER="${DB_USER:-cls_app}"
DB_ADMIN_USER="${DB_ADMIN_USER:-cls_admin}"
CLS_HOST="${CLS_HOST:-}"
ACME_EMAIL="${ACME_EMAIL:-}"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || die "run as root: sudo -E bash deploy/bootstrap-ubuntu.sh CLS_HOST=... ACME_EMAIL=..."
# shellcheck source=/dev/null
. /etc/os-release
[[ ${ID:-} == ubuntu ]] || warn "expected Ubuntu, found ${ID:-unknown}"
case "$(uname -m)" in
  aarch64|arm64) ;;
  *) warn "expected aarch64 (Ampere A1), found $(uname -m) — continuing" ;;
esac
[[ -n "$CLS_HOST" && -n "$ACME_EMAIL" ]] || \
  warn "CLS_HOST/ACME_EMAIL empty — Caddy will be installed but not configured"

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg git rsync xz-utils ufw unattended-upgrades

# ------------------------------------------------------------- service identity
log "creating service user $CLS_USER and directories"
id -u "$CLS_USER" >/dev/null 2>&1 || \
  useradd --system --home-dir "$APP_ROOT" --shell /usr/sbin/nologin "$CLS_USER"
install -d -m 0750 -o root -g "$CLS_USER" "$APP_ROOT" "$ENV_DIR"
install -d -m 0755 -o root -g root   "$APP_ROOT/bin" "$RELEASES_DIR"
install -d -m 0700 -o "$CLS_USER" -g "$CLS_USER" \
  "$DATA_ROOT" "$DATA_ROOT/room-photos" "$DATA_ROOT/floor-plans" "$BACKUP_ROOT"

# ------------------------------------------------------------------ node (pinned)
NODE_PREFIX="/usr/local/lib/nodejs"
NODE_BIN="$NODE_PREFIX/node-v$NODE_VERSION-linux-arm64"
if [[ -x "$NODE_BIN/bin/node" ]] && [[ "$("$NODE_BIN/bin/node" -v)" == "v$NODE_VERSION" ]]; then
  log "node $NODE_VERSION already installed"
else
  log "installing node $NODE_VERSION (linux-arm64 tarball)"
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-arm64.tar.xz" -o "$tmp/node.tar.xz"
  mkdir -p "$NODE_PREFIX"
  tar -xJf "$tmp/node.tar.xz" -C "$NODE_PREFIX"
  rm -rf "$tmp"
fi
ln -sfn "$NODE_BIN/bin/node" /usr/local/bin/node
ln -sfn "$NODE_BIN/bin/npm" /usr/local/bin/npm
ln -sfn "$NODE_BIN/bin/npx" /usr/local/bin/npx
[[ "$(/usr/local/bin/node -v)" == "v$NODE_VERSION" ]] || die "node version mismatch after install"
/usr/local/bin/node -v

# ---------------------------------------------------------------------- mariadb
if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  log "installing mariadb-server"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server mariadb-client
else
  log "mariadb already installed"
fi

MEM_TOTAL_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
POOL_MB=$(( MEM_TOTAL_MB / 4 ))
(( POOL_MB > 1024 )) || POOL_MB=1024
log "tuning mariadb (innodb_buffer_pool_size=${POOL_MB}M, mem_total=${MEM_TOTAL_MB}M)"
install -d -m 0755 /etc/mysql/mariadb.conf.d
cat > /etc/mysql/mariadb.conf.d/60-cls.conf <<EOF
[mysqld]
bind-address = 127.0.0.1
skip-name-resolve
skip-external-locking
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
lower_case_table_names = 0
max_connections = 100
innodb_buffer_pool_size = ${POOL_MB}M
innodb_flush_log_at_trx_commit = 1
innodb_file_per_table = 1
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_error = /var/log/mysql/error.log
EOF
install -d -m 0755 -o mysql -g mysql /var/log/mysql
systemctl enable --now mariadb
systemctl reload mariadb || systemctl restart mariadb

# ------------------------------------------------------- database + app account
log "creating database $DB_NAME and least-privilege user $DB_USER"
DB_PASSWORD_FILE="$ENV_DIR/.db-password"
if [[ ! -s "$DB_PASSWORD_FILE" ]]; then
  ( umask 077; openssl rand -base64 36 | tr -d '\n/+= ' | head -c 40 > "$DB_PASSWORD_FILE" )
fi
chown root:"$CLS_USER" "$DB_PASSWORD_FILE"
chmod 0640 "$DB_PASSWORD_FILE"
DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"
DB_PASSWORD_ENC="$(/usr/local/bin/node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DB_PASSWORD")"

mariadb -u root <<EOF
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db LIKE 'test%';
DELETE FROM mysql.user WHERE User='';
FLUSH PRIVILEGES;
EOF
warn "$DB_USER can only touch $DB_NAME"

# A separate account for the two operations that need more than one database:
# db:verify-fresh (throwaway database) and restore.sh. It is deliberately not in
# /etc/cls-facility/env, so the app process never receives these credentials.
ADMIN_PASSWORD_FILE="$ENV_DIR/.db-admin-password"
if [[ ! -s "$ADMIN_PASSWORD_FILE" ]]; then
  ( umask 077; openssl rand -base64 36 | tr -d '\n/+= ' | head -c 40 > "$ADMIN_PASSWORD_FILE" )
fi
chown root:root "$ADMIN_PASSWORD_FILE"
chmod 0600 "$ADMIN_PASSWORD_FILE"
ADMIN_PASSWORD="$(cat "$ADMIN_PASSWORD_FILE")"
ADMIN_PASSWORD_ENC="$(/usr/local/bin/node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$ADMIN_PASSWORD")"
log "creating verification/restore account $DB_ADMIN_USER"
mariadb -u root <<EOF
CREATE USER IF NOT EXISTS '$DB_ADMIN_USER'@'127.0.0.1' IDENTIFIED BY '$ADMIN_PASSWORD';
ALTER USER '$DB_ADMIN_USER'@'127.0.0.1' IDENTIFIED BY '$ADMIN_PASSWORD';
GRANT CREATE, DROP ON *.* TO '$DB_ADMIN_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_ADMIN_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`cls_migrate_verify_%\`.* TO '$DB_ADMIN_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`cls_restore_verify_%\`.* TO '$DB_ADMIN_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF
( umask 077; cat > "$ENV_DIR/verify.env" <<EOF
# Privileged database URL used only by release.sh --verify-fresh and restore.sh.
# root-only (0600) and intentionally NOT in env, so the app process cannot read it.
VERIFY_ADMIN_DATABASE_URL="mysql://$DB_ADMIN_USER:$ADMIN_PASSWORD_ENC@127.0.0.1:3306/$DB_NAME?connectionLimit=2&acquireTimeout=30000"
EOF
)
chown root:root "$ENV_DIR/verify.env"
chmod 0600 "$ENV_DIR/verify.env"

# --------------------------------------------------------------------- env file
log "writing $ENV_FILE"
if [[ ! -s "$ENV_FILE" ]]; then
  umask 077
  BETTER_AUTH_SECRET_VALUE="$(openssl rand -base64 32)"
  cat > "$ENV_FILE" <<EOF
# Managed by deploy/bootstrap-ubuntu.sh — chmod 0640, never commit.
# Values stay quoted: DATABASE_URL contains & which bash reads as a background
# operator when this file is sourced, and systemd expects quotes around it.
DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD_ENC@127.0.0.1:3306/$DB_NAME?connectionLimit=5&acquireTimeout=30000"
BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET_VALUE"
BETTER_AUTH_URL="https://${CLS_HOST:-CHANGE_ME}"
PRIVATE_STORAGE_ROOT="$DATA_ROOT"
EOF
  unset umask
  chown root:"$CLS_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  log "generated a fresh BETTER_AUTH_SECRET and DB password"
else
  log "$ENV_FILE already exists — left untouched (edit BETTER_AUTH_URL yourself)"
fi

# ------------------------------------------------------------------- repo access
if [[ ! -d "$REPO_DIR/.git" ]]; then
  log "creating deploy key for $GIT_REPO"
  install -d -m 0700 /root/.ssh
  [[ -f "$DEPLOY_KEY" ]] || ssh-keygen -t ed25519 -N "" -C "cls-deploy@$(hostname -s)" -f "$DEPLOY_KEY"
  if GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes" \
      git clone "$GIT_REPO" "$REPO_DIR" 2>/dev/null; then
    log "clone ok"
  else
    warn "clone failed — add this deploy key in GitHub (Deploy keys, read-only), then re-run:"
    warn "  $(cat "$DEPLOY_KEY.pub")"
  fi
fi
if [[ -d "$REPO_DIR/.git" ]]; then
  chown -R root:"$CLS_USER" "$REPO_DIR"
  git -C "$REPO_DIR" config core.sshCommand \
    "ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  git -C "$REPO_DIR" fetch --prune origin
  log "repo ready: $(git -C "$REPO_DIR" rev-parse --short origin/main) on origin/main"
fi

# ----------------------------------------------------------------------- caddy
if ! command -v caddy >/dev/null 2>&1; then
  log "installing caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "$CLS_HOST" && -n "$ACME_EMAIL" ]]; then
  log "installing caddy site config for $CLS_HOST"
  install -d -m 0755 -o root -g root /var/log/caddy
  { [[ -n "$ACME_EMAIL" ]] && printf 'email %s\n' "$ACME_EMAIL"; \
    sed "s/__CLS_HOST__/$CLS_HOST/g" "$SCRIPT_DIR/Caddyfile"; } > /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile || die "invalid Caddyfile"
  systemctl enable caddy
  systemctl reload caddy || systemctl restart caddy
else
  warn "caddy not configured — edit /etc/caddy/Caddyfile (replace the host), then: systemctl reload caddy"
fi

# ------------------------------------------------------------------ deploy tools
log "installing deploy scripts and systemd units"
for f in release.sh backup.sh restore.sh; do
  install -m 0750 -o root -g root "$SCRIPT_DIR/$f" "$APP_ROOT/bin/$f"
done
for u in cls-facility.service cls-backup.service cls-backup.timer; do
  install -m 0644 -o root -g root "$SCRIPT_DIR/$u" "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now cls-backup.timer

# --------------------------------------------------------------------- firewall
log "configuring ufw (ssh/http/https only)"
ufw --force default deny incoming >/dev/null
ufw --force default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp comment 'acme http challenge' >/dev/null
ufw allow 443/tcp comment 'https' >/dev/null
ufw --force enable
ufw status
warn "confirm you can still SSH in before closing this session"

systemctl enable --now unattended-upgrades.service

log "bootstrap done"
cat <<EOF
Next steps:
  1. Edit $ENV_FILE -> set BETTER_AUTH_URL to the real https URL (keep the quotes)
  2. Confirm mariadb is loopback-only:  ss -ltnp | grep 3306
  3. If the clone failed: add the deploy key in GitHub, then re-run this script
  4. First deploy — full gate on ARM64 (lint, tests, typecheck, build, migrate):
       $APP_ROOT/bin/release.sh --full --verify-fresh
  5. Verify:  systemctl status cls-facility --no-pager
             curl -fsS http://127.0.0.1:3000/login >/dev/null && echo local ok
  6. Before go-live: rotate the dev passwords, delete test-admin* accounts, and
     prove the backups restore:  $APP_ROOT/bin/restore.sh --latest --verify-only
Files written:
  $ENV_FILE                 app environment (0640 root:$CLS_USER) — quotes required
  $ENV_DIR/verify.env       privileged DB URL for verify-fresh/restore (0600 root)
  $ENV_DIR/.db-password     app DB password (0640 root:$CLS_USER)
  $ENV_DIR/.db-admin-password   verification/restore DB password (0600 root)
  $DEPLOY_KEY               read-only deploy key for GitHub (print the .pub once)
EOF
