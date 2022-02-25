#!/usr/bin/env bash

theme_root="${INPUT_THEME_ROOT:-.}"
flags="$INPUT_FLAGS"

export PATH="$HOME/bin:$PATH"
mkdir -p "$HOME/bin"

if [[ -n "$INPUT_VERSION" ]]; then
  gem install theme-check -N -v "$INPUT_VERSION" -n "$HOME/bin"
else
  gem install theme-check -N -n "$HOME/bin"
fi

set -eou pipefail

echo theme-check --version
theme-check --version

if [[ -z "$INPUT_TOKEN" ]]; then
  echo theme-check $flags "$theme_root"
  theme-check $flags "$theme_root"
  exit $?
fi


set +e
echo theme-check $flags -o json "$theme_root" '>' /tmp/results.json
theme-check $flags -o json "$theme_root" > /tmp/results.json
code=$?
set -e

echo NODE_PATH=/var/task/node_modules node /index.js
NODE_PATH=/var/task/node_modules node /index.js $code
exit $code
