# Contributing

## Ground Rules

- Preserve current visible site output unless the task explicitly requires content or UI change.
- Keep changes small, reviewable, and reproducible.
- Run `npm run qa` before opening a PR.

## Branching

- Branch from the current default branch.
- Name branches by intent, for example: `feat/qa-script-update`, `fix/metadata-check`.

## Commit Message Convention (Conventional Commits)

Use:

```text
<type>(optional-scope): <short summary>
```

Allowed types:

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation-only change
- `refactor`: code cleanup without behavior change
- `test`: tests/QA only
- `chore`: tooling or maintenance
- `ci`: pipeline/workflow changes

Examples:

- `docs(readme): add deployment port migration steps`
- `fix(qa): handle directory links in link checker`
- `chore(repo): add editorconfig and gitattributes`

## Pull Request Checklist

- [ ] Scope is focused and explained
- [ ] No unintended site content changes
- [ ] `npm run qa` passes locally
- [ ] Docs updated when behavior/process changed
- [ ] Commit messages follow Conventional Commits
