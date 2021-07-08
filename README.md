# shopify/theme-check-action

[About this repo](#about-this-repo) | [Usage](#usage) | [Configuration](#configuration)

## About this repo

[Theme Check](https://github.com/shopify/theme-check) on Shopify Theme Pull Requests using GitHub Actions.

## Usage

Add `shopify/theme-check-action` to the workflow of your Shopify theme.

```yml
# .github/workflows/theme-check.yml
name: Theme Check
on: [push]
jobs:
  theme-check:
    name: Theme Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Theme Check
        uses: shopify/theme-check-action@v1
        with:
          theme_root: '.' # optional, could be './dist'
```

## Configuration

The `shopify/theme-check-action` accepts the following arguments:

* `theme_root` - (optional, default: `'.'`) Path from repo root to the root of the theme (e.g. `'./dist'`).
* `flags` - (optional) theme-check command line flags. (e.g. `'--fail-level suggestion'`)
* `version` - (optional, default: latest) specific theme-check version to use.
