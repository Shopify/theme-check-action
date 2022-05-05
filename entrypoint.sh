#!/usr/bin/env bash

theme_root="${INPUT_THEME_ROOT:-.}"
flags="$INPUT_FLAGS"

export PATH="$HOME/bin:$PATH"
mkdir -p "$HOME/bin"

function run() {
  echo '$' "$@" 1>&2
  "$@"
}

if [[ -n "$INPUT_VERSION" ]]; then
  gem install theme-check -N -v "$INPUT_VERSION" -n "$HOME/bin"
else
  gem install theme-check -N -n "$HOME/bin"
fi

set -eou pipefail

run theme-check --version

if [[ -z "$INPUT_TOKEN" ]]; then
  run theme-check $flags "$theme_root"
  exit $?
fi

set +e
run theme-check $flags -o json "$theme_root" > /tmp/results.json
code=$?

if [[ -n $INPUT_BASE ]]; then
  run git fetch origin $INPUT_BASE
  run git diff --name-only --diff-filter=ACMRTUB origin/$INPUT_BASE > /tmp/diff.log
fi

set -e

NODE_PATH=/var/task/node_modules node /index.js $code
exit $code
