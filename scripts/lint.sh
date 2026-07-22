#!/usr/bin/env sh
set -eu
bun run format:check && bun run lint && bun run typecheck
