#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TS="${TS:-$(date +%Y%m%d-%H%M%S)}"
BACKUP_DIR="${ROOT_DIR}/backup/${TS}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] root=${ROOT_DIR}"
echo "[backup] dest=${BACKUP_DIR}"

git -C "${ROOT_DIR}" status --short > "${BACKUP_DIR}/git-status.before.txt" || true
git -C "${ROOT_DIR}" diff --binary > "${BACKUP_DIR}/working-tree.before.patch" || true

MATCHED_PATHS='
docker-compose.yml
README.md
docs
scripts
docker/mem0
searxng
vendor/mem0
aiyo/.env.example
aiyo/.env.dev.example
aiyo/.env.prod-live.example
aiyo/.env.dev
aiyo/.env.prod-live
'

printf '%s\n' "${MATCHED_PATHS}" | sed '/^[[:space:]]*$/d' > "${BACKUP_DIR}/inventory.txt"

printf '%s\n' "${MATCHED_PATHS}" | while IFS= read -r relative_path; do
  [ -n "${relative_path}" ] || continue
  src="${ROOT_DIR}/${relative_path}"
  if [ ! -e "${src}" ]; then
    continue
  fi
  dest="${BACKUP_DIR}/${relative_path}"
  mkdir -p "$(dirname "${dest}")"
  cp -a "${src}" "${dest}"
done

for container_name in aiyo-new-postgres aiyo-new-postgres-dev aiyo-new-postgres-prod mem0-memory-postgres; do
  if docker ps --format '{{.Names}}' | grep -qx "${container_name}"; then
    dump_file="${BACKUP_DIR}/${container_name}.sql"
    echo "[backup] pg_dumpall ${container_name} -> ${dump_file}"
    if ! docker exec -t "${container_name}" pg_dumpall -U aiyo > "${dump_file}" 2>/dev/null; then
      docker exec -t "${container_name}" pg_dumpall -U postgres > "${dump_file}" 2>/dev/null || true
    fi
  fi
done

echo "[backup] completed"
