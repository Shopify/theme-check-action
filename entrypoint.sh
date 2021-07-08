#!/usr/bin/env bash

theme_root="${INPUT_THEME_ROOT:-.}"
flags="$INPUT_FLAGS"

if [[ -n "$INPUT_VERSION" ]]; then
  gem install theme-check -N -v "$INPUT_VERSION"
else
  gem install theme-check -N
fi

set -eou pipefail

echo theme-check --version
theme-check --version

echo theme-check $flags "$theme_root"
theme-check $flags "$theme_root"
