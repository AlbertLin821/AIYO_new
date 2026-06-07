# Docker Legacy Assets

The new active stack no longer ships `mem0`, `searxng`, or `pgadmin` containers.

## Archive targets

The archive script moves these assets into `archive/legacy/<timestamp>/`:

- `docker/mem0`
- `scripts/clone-mem0.sh`
- `scripts/clone-mem0.ps1`
- `searxng/`
- `vendor/mem0`

## Why they are legacy now

- `docker/mem0` and `vendor/mem0` only existed to build the retired Mem0 sidecar stack.
- `scripts/clone-mem0.*` only supported that retired sidecar flow.
- `searxng/` is no longer part of the minimum supported AIYO stack.
- `pgadmin` is removed from the active Compose spec because it is not required for app, DB, or AI gateway validation.

## Archive command

```bash
scripts/archive-legacy-docker-assets.sh
```

After the move, only documentation references and the archive manifest should remain outside `archive/legacy/`.
