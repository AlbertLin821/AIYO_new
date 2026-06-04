#!/usr/bin/env sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/vendor/mem0"
MARKER="$TARGET/server/dev.Dockerfile"

if [ -f "$MARKER" ]; then
  echo "Mem0 repo already present at vendor/mem0"
  exit 0
fi

echo "Cloning mem0ai/mem0 into vendor/mem0 (repo may already vendor this path)..."
mkdir -p "$ROOT/vendor"
git clone --depth 1 https://github.com/mem0ai/mem0.git "$TARGET"
echo "Done: $TARGET"
