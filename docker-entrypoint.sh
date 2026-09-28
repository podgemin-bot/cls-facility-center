#!/bin/sh
# Optional fallback only; systemd is the selected production runtime.
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] applying prisma migrations..."
  node /app/node_modules/prisma/build/index.js migrate deploy --schema=/app/prisma/schema.prisma
  echo "[entrypoint] migrations done"
else
  echo "[entrypoint] DATABASE_URL not set, skipping migrations"
fi

echo "[entrypoint] starting Next.js standalone server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node /app/server.js
