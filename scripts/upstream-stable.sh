#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: scripts/upstream-stable.sh <fetch|list|latest|set> [tag]

Commands:
  fetch         Fetch upstream branches plus namespaced upstream tags
  list          List namespaced upstream stable tags
  latest        Print the latest namespaced upstream stable tag
  set [tag]     Move local upstream-stable to refs/tags/upstream/<tag>
                If tag is omitted, uses the latest stable upstream tag

Examples:
  scripts/upstream-stable.sh fetch
  scripts/upstream-stable.sh list
  scripts/upstream-stable.sh latest
  scripts/upstream-stable.sh set
  scripts/upstream-stable.sh set v2026.3.2
EOF
}

list_stable_tags() {
  git tag -l 'upstream/v*' --sort=-version:refname | grep -Evi 'beta' || true
}

resolve_latest_tag() {
  local latest
  latest="$(list_stable_tags | head -n 1)"
  if [[ -z "$latest" ]]; then
    echo "No namespaced upstream stable tags found. Run: scripts/upstream-stable.sh fetch" >&2
    exit 1
  fi
  printf '%s\n' "$latest"
}

resolve_target_ref() {
  local input="${1:-}"
  local tag_name
  if [[ -z "$input" ]]; then
    tag_name="$(resolve_latest_tag)"
  elif [[ "$input" == upstream/* ]]; then
    tag_name="$input"
  else
    tag_name="upstream/$input"
  fi

  if ! git rev-parse -q --verify "refs/tags/$tag_name" >/dev/null; then
    echo "Unknown upstream tag ref: refs/tags/$tag_name" >&2
    exit 1
  fi

  printf 'refs/tags/%s\n' "$tag_name"
}

cmd="${1:-}"

case "$cmd" in
  fetch)
    git fetch upstream --prune
    ;;
  list)
    list_stable_tags
    ;;
  latest)
    resolve_latest_tag
    ;;
  set)
    shift || true
    target_ref="$(resolve_target_ref "${1:-}")"
    git branch -f upstream-stable "$target_ref"
    git branch --unset-upstream upstream-stable >/dev/null 2>&1 || true
    echo "upstream-stable -> $(git rev-parse --short "$target_ref") ($target_ref)"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
