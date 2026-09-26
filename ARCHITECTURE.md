# ARCHITECTURE

## Decisions

### Tooling

- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet

### UI

- The view is a custom editor opened with the internal `_workbench.openWith` command and group -4, because that is the only way for an extension to open an editor in the modal editor part

### Git Integration

- Use the built-in VS Code Git extension API for anything it supports well, and call the git CLI for anything it can't do or does too slowly
- The commit log comes from `git log --raw` instead of the Git extension API, because the API only counts files with `--shortstat`, which diffs every file's contents and took 8 s instead of 0.1 s for 300 commits in a large repository
- Commit files and patches come from `git show`, because the Git extension API only diffs ranges (`a...b`), which fails for root commits
