#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
out="../images"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

if [ $# -eq 0 ]; then
  set -- architecture distribution-layer pc-graph request-flow
fi

for name in "$@"; do
  echo "==> $name"
  tectonic --chatter minimal --outdir "$tmp" "$name.tex"
  pdftocairo -svg "$tmp/$name.pdf" "$out/$name.svg"
  pdftocairo -png -r 200 -singlefile "$tmp/$name.pdf" "$out/$name"
done
