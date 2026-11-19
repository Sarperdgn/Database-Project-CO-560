#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Compatibility entry point. The implementation is committed, not generated.
printf '%s\n' 'Unix-socket authentication is included in the default image and fresh-volume initialization.' 'Running the isolated verification suite; existing databases are untouched.'
exec bash scripts/test-unix-socket-local.sh
