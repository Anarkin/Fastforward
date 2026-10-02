# ARCHITECTURE

## Decisions

### Tooling

- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet

### Git

- Use the installed git CLI for everything, without bundling one; it needs git 2.52 or later on the PATH
- The commit list is every commit of `HEAD`, and, unless Solo is on, also of the branches, the remotes and the tags, from `git rev-list`, kept by the main process per tab, so the list knows its full size up front and locations can jump to any commit's position; it took 0.5 s for 190k commits
- Commits are loaded by hash with `git log --stdin --no-walk=unsorted`, without `--raw` or `--shortstat`; `--shortstat` diffs every file's contents and took 8 s instead of 0.1 s for 300 commits in a large repository
- Commit files and patches come from `git show`, because diffing ranges (`a...b`) fails for root commits
- Diffs use `--histogram`, as git's default Myers algorithm matches blank lines over unique ones, showing a line moved past blank lines as removed and added again
- Auto-fetch fetches the open repositories one at a time, the active one first, and waits the interval from the end of a round, so slow remotes never overlap; a failing repository is reported once until a fetch of it succeeds

### Syntax

- Use Shiki with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- A side of a diff with lines hidden before a hunk is tokenized from its whole text, which the diff asks for by the blob ids `--full-index` puts in the patch, read in one `git cat-file --batch`, the uncommitted side from disk; until it comes, or when it does not match the hunks, the side is tokenized from its hunks alone
- The webview is built as ES modules split into chunks, so each language's grammar loads only when a file needs it
