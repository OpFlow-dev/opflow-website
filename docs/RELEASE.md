# Release

## Release Readiness

Before tagging/releasing:

1. `npm run qa` passes.
2. Docs reflect process/behavior changes.
3. Commit history follows Conventional Commits.

## Versioning Guidance

- Use semantic versioning (`MAJOR.MINOR.PATCH`) for release tags.
- Suggested mapping:
  - `feat` -> minor bump
  - `fix` -> patch bump
  - breaking change (`!` or `BREAKING CHANGE`) -> major bump

## Changelog Inputs

Generate release notes from Conventional Commit history grouped by type:

- Features
- Fixes
- Documentation
- Maintenance

## Release Steps

1. Ensure default branch is green and up to date.
2. Create release PR if batching is used.
3. Tag release version.
4. Deploy using `docs/DEPLOYMENT.md`.
5. Record post-release validation results.
