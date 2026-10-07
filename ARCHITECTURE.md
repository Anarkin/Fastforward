# ARCHITECTURE

## Decisions

### Tooling

- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet
- Release builds are not minified, so the stack traces in `Fastforward.log` keep their names and lines; minifying saved less than 1 MB

### Git

- Use the installed git CLI for everything, without bundling one; it needs git 2.52 or later on the PATH
- On Windows, git is run as found on the PATH, usually Git for Windows' `cmd\git.exe`, rather than the real git it starts, which would lose the PATH it sets for hooks, shell aliases and credential helpers; the real git outlives the launcher being killed, so git is stopped with every process it started
- Elsewhere, git runs in a process group of its own, which is stopped whole, as git leaves the ssh or remote helper it started running, holding its output open; a stopped git's output is closed too, so it settles even when something it started escapes being stopped
- Every git still running is stopped when the app quits, as it would otherwise outlive the app, and with it the timeout that stops a stalled fetch
- On Linux, the working tree and the git folder are watched folder by folder, skipping the folders that can't affect what is shown, ignored ones included, as Node's recursive `fs.watch` there walks the whole tree synchronously, ignored folders too, with one inotify watch per file
- The commit list is every commit of `HEAD`, and, unless Solo is on, also of the branches, the remotes, the tags and the stashes, from `git rev-list`, kept by the main process per worktree, so the list knows its full size up front and locations can jump to any commit's position; it took 0.5 s for 190k commits
- Commits are loaded by hash with `git log --stdin --no-walk=unsorted`, without `--raw` or `--shortstat`; `--shortstat` diffs every file's contents and took 8 s instead of 0.1 s for 300 commits in a large repository
- Commit files and patches come from `git show`, because diffing ranges (`a...b`) fails for root commits
- Diffs use `--histogram`, as git's default Myers algorithm matches blank lines over unique ones, showing a line moved past blank lines as removed and added again
- Collapsing merges keeps expanded a merge whose first parent reaches the second parent's first-parent chain through commits only, and the second parent through merges only, as `git pull` leaves that on a mainline of merges with the mainline as the second parent, which would hide the merges that landed on it
- Auto-fetch fetches the open repositories one at a time, the active one first, and waits the interval from the end of a round, so slow remotes never overlap; a failing repository is reported once until a fetch of it succeeds

### Syntax

- Use Shiki with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- A side of a diff with lines hidden before a hunk is tokenized from its whole text, which the diff asks for by the blob ids `--full-index` puts in the patch, read in one `git cat-file --batch`, the working tree side from disk; until it comes, or when it does not match the hunks, the side is tokenized from its hunks alone
- The webview is built as ES modules split into chunks, so each language's grammar loads only when a file needs it
