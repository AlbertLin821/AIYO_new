#!/bin/bash
set -e

# 建立 Mem0 應用層使用的資料庫（與預設 postgres 庫分離）。
# 使用明確查詢，避免部分環境下 \gexec 行為不一致。
exists="$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = 'mem0_app'")"
if [ "$exists" != "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE mem0_app"
fi
