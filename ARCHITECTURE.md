# ARCHITECTURE

## Layout

- `extension/src/shared/` is the only code both sides use: the extension imports nothing from `webview/`, and the webview nothing but `shared/`; the lint rules in `.oxlintrc.json` and the `tsconfig.extension.json` and `tsconfig.webview.json` checks enforce it
- `view.ts` coordinates the view: it saves through `storage.ts`, changes the repository through `operations.ts`, and runs git through `git/`
- `tabState.ts`, `refs.ts` and `history/` work out what a tab shows without git or VS Code, so the unit tests run them outside VS Code
- `git/` runs the git CLI, apart from `repository.ts`, which uses the Git extension API

## Decisions

### Tooling

- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet

### UI

- The view is a custom editor opened with the internal `_workbench.openWith` command and group `-4`, because that is the only way for an extension to open an editor in the modal editor part

### Git Integration

- Use the built-in VS Code Git extension API for anything it supports well, and call the git CLI for anything it can't do or does too slowly
- The commit list is every commit of `HEAD`, the branches, the remotes and the tags from `git rev-list`, kept by the extension per tab, so the list knows its full size up front and locations can jump to any commit's position; it took 0.5 s for 190k commits
- Commits are loaded by hash with `git log --stdin --no-walk --raw` instead of the Git extension API, because the API only counts files with `--shortstat`, which diffs every file's contents and took 8 s instead of 0.1 s for 300 commits in a large repository
- Commit files and patches come from `git show`, because the Git extension API only diffs ranges (`a...b`), which fails for root commits
