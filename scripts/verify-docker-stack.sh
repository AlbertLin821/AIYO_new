#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
MODE="${1:-dev}"

case "${MODE}" in
  dev)
    ENV_FILE="${ROOT_DIR}/aiyo/.env.dev"
    APP_HEALTH_URL="http://127.0.0.1:3000/api/health"
    APP_SERVICE="aiyo-new-app-dev"
    DB_SERVICE="aiyo-new-postgres-dev"
    ;;
  prod-live)
    ENV_FILE="${ROOT_DIR}/aiyo/.env.prod-live"
    APP_HEALTH_URL="http://127.0.0.1:3001/api/health"
    APP_SERVICE="aiyo-new-app-prod-live"
    DB_SERVICE="aiyo-new-postgres-prod"
    ;;
  *)
    echo "Usage: $0 [dev|prod-live]" >&2
    exit 1
    ;;
esac

if [ ! -f "${ENV_FILE}" ]; then
  echo "[fail] missing env file: ${ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  key="$1"
  sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1
}

OPENWEBUI_API_KEY="$(read_env_value OPENWEBUI_API_KEY)"
OPENWEBUI_MODEL="$(read_env_value OPENWEBUI_MODEL)"

pass() { echo "[pass] $1"; }
fail() { echo "[fail] $1" >&2; exit 1; }

CURL_BIN="curl"
if command -v curl.exe >/dev/null 2>&1; then
  CURL_BIN="curl.exe"
fi

docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.yml" config >/dev/null \
  && pass "docker compose config (${MODE})" \
  || fail "docker compose config (${MODE})"

docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.yml" ps \
  || fail "docker compose ps (${MODE})"

"${CURL_BIN}" -fsS "http://127.0.0.1:11434/api/tags" >/dev/null \
  && pass "host Ollama /api/tags" \
  || fail "host Ollama /api/tags"

"${CURL_BIN}" -fsS "http://127.0.0.1:8080/health" >/dev/null \
  && pass "Open WebUI /health" \
  || fail "Open WebUI /health"

"${CURL_BIN}" -fsS "${APP_HEALTH_URL}" >/dev/null \
  && pass "${APP_SERVICE} /api/health" \
  || fail "${APP_SERVICE} /api/health"

if [ -n "${OPENWEBUI_API_KEY}" ]; then
  "${CURL_BIN}" -fsS \
    -H "Authorization: Bearer ${OPENWEBUI_API_KEY}" \
    "http://127.0.0.1:8080/api/models" >/dev/null \
    && pass "Open WebUI /api/models" \
    || fail "Open WebUI /api/models"

  if [ -n "${OPENWEBUI_MODEL}" ]; then
    "${CURL_BIN}" -fsS \
      -H "Authorization: Bearer ${OPENWEBUI_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"model\":\"${OPENWEBUI_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"請只回覆 HEALTHY\"}],\"temperature\":0}" \
      "http://127.0.0.1:8080/api/chat/completions" >/dev/null \
      && pass "Open WebUI /api/chat/completions" \
      || fail "Open WebUI /api/chat/completions"
  else
    echo "[skip] OPENWEBUI_MODEL is empty; skipping chat completion smoke test"
  fi
else
  echo "[skip] OPENWEBUI_API_KEY is empty; skipping authenticated Open WebUI checks"
fi

docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.yml" exec -T "${DB_SERVICE}" \
  pg_isready -U aiyo >/dev/null \
  && pass "${DB_SERVICE} pg_isready" \
  || fail "${DB_SERVICE} pg_isready"

docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.yml" exec -T aiyo-new-redis \
  redis-cli ping | grep -qx "PONG" \
  && pass "Redis ping" \
  || fail "Redis ping"
