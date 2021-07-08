#!/usr/bin/env bash

set -eou pipefail

theme_root="${INPUT_THEME_ROOT:-.}"
theme-check "$theme_root"
