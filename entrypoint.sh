#!/usr/bin/env bash

theme_root="${INPUT_THEME_ROOT:-.}"
flags="$INPUT_FLAGS"

set -eou pipefail

theme-check $flags "$theme_root"
