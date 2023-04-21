#!/usr/bin/env bash

theme_root="${INPUT_THEME_ROOT:-.}"
flags="$INPUT_FLAGS"

export PATH="$HOME/bin:$PATH"
mkdir -p "$HOME/bin"

function run() {
  echo '$' "$@" 1>&2
  "$@"
}

# This function compares two version numbers represented as strings in the
# format "x.y.z".
#
# Arguments:
#   $1: The version number to compare (string).
#   $2: The reference version number to compare against (string).
#
# Return Value:
#   returns 0 when the version is equal to or greater than the reference version
#   returns 1 when the version is less than the reference version
function is_version_at_least() {
    local IFS=.
    local i version=($1) reference=($2)

    for ((i=0; i<${#version[@]}; i++)); do
        if ((10#${version[i]} > 10#${reference[i]})); then
            return 0
        fi
        if ((10#${version[i]} < 10#${reference[i]})); then
            return 1
        fi
    done

    return 0
}

if [[ -n "$INPUT_VERSION" ]]; then
  gem install theme-check -N -v "$INPUT_VERSION" -n "$HOME/bin"
else
  gem install theme-check -N -n "$HOME/bin"
fi

set -eou pipefail

theme_check_version_with_update_docs="1.15.0"
theme_check_version="$(run theme-check --version)"
echo $theme_check_version

if is_version_at_least $theme_check_version $theme_check_version_with_update_docs; then
  flags="$flags --update-docs"
fi

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
