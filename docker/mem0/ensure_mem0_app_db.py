#!/usr/bin/env python3
from __future__ import annotations

import os
import re

import psycopg
from psycopg import sql


def main() -> None:
    dbname = os.environ.get("APP_DB_NAME", "mem0_app").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]+", dbname):
        raise SystemExit(f"ensure_mem0_app_db: invalid APP_DB_NAME {dbname!r}")

    conn = psycopg.connect(
        host=os.environ["POSTGRES_HOST"],
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        dbname="postgres",
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        connect_timeout=30,
        autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,))
            if cur.fetchone() is not None:
                print(f"ensure_mem0_app_db: database {dbname!r} already exists", flush=True)
                return
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
        print(f"ensure_mem0_app_db: created database {dbname!r}", flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
