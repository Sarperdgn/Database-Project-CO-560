#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null
command -v python3 >/dev/null
docker compose version >/dev/null
docker info >/dev/null
# Every harness owns and cleans up its unique project, including certificates.
for suite in rbac fine-grained-security security-audit unix-socket; do
  printf '\n=== %s ===\n' "$suite"
  bash "scripts/test-${suite}-local.sh"
done
printf '\nAll MariaDB security demonstrations passed.\n'
