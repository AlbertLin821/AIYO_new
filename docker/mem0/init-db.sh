#!/bin/sh
set -eu

APP_DB_NAME="${APP_DB_NAME:-mem0_app}"
exists="$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '${APP_DB_NAME}'")"
if [ "$exists" != "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE ${APP_DB_NAME}"
fi
