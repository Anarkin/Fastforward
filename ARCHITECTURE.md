# ARCHITECTURE

## Decisions

### Tooling

- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet
- Release builds are not minified, so the stack traces in `Fastforward.log` keep their names and lines; minifying saved about 1 MB
- The webview is built as ES modules split into chunks, so each language's grammar, the WebAssembly of the Oniguruma engine, markdown-it and DOMPurify load only once a file or preview needs them

### Git

- Use the installed git CLI for everything, without bundling one; it needs git 2.52 or later on the PATH
- On Windows, git is run as found on the PATH, usually Git for Windows' `cmd\git.exe`, rather than the real git it starts, which would lose the PATH it sets for hooks, shell aliases and credential helpers
- The app's own git commands run with `LC_ALL=C`, as setting up translations took a third of each git's start on Windows, about 24 ms, though Git for Windows ships none
- On Linux, the working tree and the git folder are watched folder by folder, as Node's recursive `fs.watch` there walks the whole tree synchronously, with one inotify watch per file
- The commit list is read whole up front with `git rev-list` and kept by the main process per worktree, so the list knows its full size and locations can jump to any commit's position; it took 0.5 s for 190k commits
- The commit list is parsed while git sends it and linked a slice at a time, as the main process also passes the window's input on to the page, so working on 1.5 million commits at once froze the whole window for 2.4 s
- The commit list keeps its hashes as bytes in one buffer with a hash table of its own, and its parents and shown rows as numbers, rather than an object and strings per commit, as those took 693 MB for 1.5 million commits against 98 MB
- When a repository last fetched, or failed to, is recorded by the app for the repository and all its worktrees, rather than read from `FETCH_HEAD`, as git rewrites `FETCH_HEAD` even when every remote fails, and each worktree has a `FETCH_HEAD` of its own; fetches made outside the app are not counted

### Syntax

- Use Shiki with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server

### Previews

- Image previews are fetched by the page from the app's own protocol rather than sent as messages, so the page can tell an image too large from one that failed; the working tree side is read from disk, as git diffs name it by the id it would have without storing it
- Markdown is rendered with markdown-it, which VS Code's preview uses too
