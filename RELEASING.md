## Releasing Theme Check Action

1. Check the Semantic Versioning page for info on how to version the new release: [semver.org](http://semver.org).

2. Run [`git changelog`](https://github.com/tj/git-extras) to update `CHANGELOG.md`.

3. Run `export version=1.1.1` to set the version number for the new release (replace 1.1.1 with the version number you're releasing).

4. Run `bin/release v$version` to push a new tag
    - If anything goes wrong during the release process, you may:
      - 4.1. Run `bin/rollback-release v$version` to delete a published tag
      - 4.2. Run `bin/re-release v$version` to re-release the tag

5. Open the [release page](https://github.com/Shopify/theme-check-action/releases/new) to create a new release.

6. Select the **Publish this Action to the GitHub Marketplace** checkbox.

7. Select the tag created in step 4.

8. Set the title to  v1.1.1 (replace 1.1.1 with the version number you're releasing).

9. Use the changelog items as the description.

10. Click on **Publish release** to publish the new release to the GitHub Marketplace.
