#!/usr/bin/env bash

set -eou pipefail

# Disable analytics
mkdir -p ~/.config/shopify && cat <<-YAML > ~/.config/shopify/config
[analytics]
enabled = false
YAML

shopify theme check "$theme_root"
