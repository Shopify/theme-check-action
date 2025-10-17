v2.2.0 / 2025-10-17
==================

  * Bump actions/checkout from 4.2.2 to 5.0.0 (#61)
  * Use exit code 0 when a report is available (#62)
  * Bump undici from 5.28.4 to 5.29.0 (#57)

v2.1.3 / 2025-06-16
==================

  * Fix annotations for pull requests (#50)
  * update github actions to commits (#56)
  * Bump undici from 5.28.1 to 5.28.4 (#40)

v2.1.2 / 2024-05-10
==================

  * Don't install `@shopify/theme` from v3.59 onward
  * Allow for experimental CLI versions

v2.1.1 / 2024-04-04
==================

  * Revert "Add direct support for bun, pnpm and yarn" -- issues with pnpm

v2.1.0 / 2024-04-04
==================

  * Add support for different package managers (thank you @andershagbard)

v2.0.1 / 2024-02-14
==================

  * Don't pass the `--dev-preview` flag for Shopify CLI versions >= 3.55.0

v2.0.0 / 2024-01-05
===================

  * Theme Check 2.0 and Shopify CLI 3.50+ support
  * Remove support for Ruby Theme Check (v1)

v1.3.1 / 2024-01-05
===================

  * Merge pull request #29 from snacsnoc/update-checkout-v3-node16-compatibility
  * Update ci.yml to use checkout@v3
  * Update README.md to reflect upgrade to checkout@v3

v1.3.0 / 2023-11-28
===================

  * Run Theme Check with the most updated version of objects, filters, and tags ([#19](https://github.com/Shopify/theme-check-action/pull/19))

v1.2.0 / 2022-02-28
===================

## Features

  * Add support to only annotate files with diffs in them ([#3](https://github.com/shopify/theme-check-action/issues/3), [#9](https://github.com/shopify/theme-check-action/issues/9))
  * Add the `base` input argument

v1.1.1 / 2022-02-28
===================

  * Throttle the requests to respect the rate limits ([#8](https://github.com/shopify/theme-check-action/issues/8))
  * GH Actions Checks: Submit the checks in batches ([#7](https://github.com/shopify/theme-check-action/issues/7))

v1.1.0 / 2022-02-25
===================

## Features

  * Add GitHub Annotation support
  * Add the `token` input argument

v1.0.0 / 2021-07-08
===================

  * Initial release
