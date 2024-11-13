## Releasing Theme Check Action

1. Check the Semantic Versioning page for info on how to version the new release: [semver.org](http://semver.org).

2. Make sure you are on main

```sh
git fetch origin main
git checkout main
git reset --hard origin/main
```

3. Update the changelog using the git-extra's [`git changelog`](https://github.com/tj/git-extras).

```sh
git changelog
```

4. Commit and push the changelog update (to main, it's OK)

```sh
git add CHANGELOG.md
git commit -m "Update CHANGELOG.md"
git push origin main
```

5. Set the version number, and release the tag (and rerelease the minor tag, and update the major branch)

```sh
export VERSION=v2.X.X
scripts/release $VERSION
```

6. Create a GitHub release for the changes

```sh
git fetch origin
git fetch origin --tags
git reset origin $VERSION
gh release create -t $VERSION
```
