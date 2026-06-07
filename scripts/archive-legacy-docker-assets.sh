#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TS="${TS:-$(date +%Y%m%d-%H%M%S)}"
ARCHIVE_DIR="${ROOT_DIR}/archive/legacy/${TS}"

mkdir -p "${ARCHIVE_DIR}"

move_if_exists() {
  relative_path="$1"
  src="${ROOT_DIR}/${relative_path}"
  if [ ! -e "${src}" ]; then
    return 0
  fi
  dest="${ARCHIVE_DIR}/${relative_path}"
  mkdir -p "$(dirname "${dest}")"
  mv "${src}" "${dest}"
  printf '%s\n' "${relative_path}" >> "${ARCHIVE_DIR}/ARCHIVED_FILES.txt"
}

move_if_exists "docker/mem0"
move_if_exists "scripts/clone-mem0.sh"
move_if_exists "scripts/clone-mem0.ps1"
move_if_exists "searxng"
move_if_exists "vendor/mem0"

echo "Archived legacy Docker assets to ${ARCHIVE_DIR}"
