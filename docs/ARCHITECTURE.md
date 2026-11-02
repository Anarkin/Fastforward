# ARCHITECTURE

## Decisions

- Put all text people read, logs included, in the i18n dictionary, `app/src/shared/strings.ts`, as whole sentences, to support localization and globalization
- The page is not trusted: the main process checks everything the page sends before it acts on it, as the page shows content from outside the app
- Use `oxlint` instead of `eslint`, because `typescript-eslint` does not support TypeScript 7 yet
- Use `shiki` with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- Syntax is colored in a module worker, which loads the grammars and the WebAssembly, keeping tokenizing off the page's main thread; it colors a slice of time at a time, so jobs take turns, and sends a file viewed in parts as its lines are done, each colored range packed in four bytes, as objects took 25 times the memory, about 190 MB for 10 MB of code
- Image previews are fetched by the page from the app's own protocol rather than sent as messages, so the page can tell an image too large from one that failed
- Markdown is rendered with `markdown-it`, which VS Code's preview uses too
- Mermaid diagrams in Markdown are drawn with `mermaid` on the page's main thread, as VS Code's preview draws them, since it measures text in the DOM and can't run in a worker; each is shown as an image of its SVG, so the styles a document puts in a diagram can't reach the page
- PDFs are drawn with the viewer components of `pdfjs-dist` inside the page, not in an iframe, with its worker a bundle of its own; the page reads a PDF by ranges through PDF.js's range transport, as PDF.js asks for ranges itself only over HTTP, and runs no scripts, forms or editors of a PDF; the place in each PDF is kept by the PDF's own ID, so it follows the file when moved

### Git, `git`

- Use the installed `git` CLI for everything, without bundling one; it needs git 2.52 or later on the PATH
- Read objects through one `git cat-file --batch-command` kept running per folder, and the files and patch of a commit through `git diff-tree --stdin`, rather than a git started for each read, as each start costs a fraction of a second on Windows; each stops after 30 seconds idle, as an idle git holds pack files Windows then cannot delete, when its tab closes, and at most sixteen are kept in all, the idle ones stopped first; a request no longer wanted stops the git answering it, as what it prints next would be read for the request after; reads over 1 MB go to a git started for them, so the requests after them do not wait; each answer of `diff-tree` is checked against a marker made anew each time the app starts, and the hash asked for; `keepGitRunning` in the settings turns them off as soon as it is saved, and any failure falls back to a git started for the read
- Ask a git kept running only for what an object id names, as it reads the index and refs once: a commit is diffed against its first parent named with it, as `diff-tree --stdin` diffs a commit only the first time it is asked for it alone, and a root commit is read by a git started for it
- Diff with 3 lines of context, no context joining hunks, the indent heuristic and no order file, whatever the diff config says, as `diff-tree` reads less of it than `git show`, and a commit read either way must look the same
- Start git from a pool of up to four worker threads rather than the main process, each git on a thread not busy starting another, as starting a process on Windows can hold the thread starting it for hundreds of milliseconds, which held up every message of the app and every git started after it
- The git tool checks every hash and path the page sends against the history and the repository
- The commit list is read whole up front with `git rev-list` and kept by the main process per worktree, so the list knows its full size and locations can jump to any commit's position
- The tags of each remote are listed with `git ls-remote --tags` after each fetch and kept in the app's state rather than as refs, as git keeps no remote-tracking refs for tags, and refs would show up in other tools; it costs one more connection per remote after each fetch

### Commander, `commander`

- Folders are listed on Windows with `NtQueryDirectoryFile` through `koffi`, a page of entries at a time off the main thread, as Node can't read the hidden attribute or the size of files the system holds open, such as `pagefile.sys`; elsewhere with Node's `readdir` and `lstat`
- Native calls go through `koffi` while they are plain C functions; COM or Objective-C would go in an addon of our own
- Folders that need an administrator are read by a helper, the app itself started elevated in a mode of its own, as Total Commander does, rather than by restarting the app elevated, which would elevate the shells and git too and cut off drag and drop with other windows; it connects back over a named pipe the app opens, proves itself with a secret given only to it, only lists folders, and quits when the app goes

### Terminal, `terminal`

- Use `xterm.js` with its WebGL renderer on the page and `node-pty` for the shells, as VS Code does
- Run the shells in a utility process of their own, so a crash in the native code of `node-pty` or a flood of output can't stop or slow the window and the other tools
