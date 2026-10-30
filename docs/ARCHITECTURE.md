# ARCHITECTURE

## Decisions

- Put all text people read, logs included, in the i18n dictionary, `app/src/shared/strings.ts`, as whole sentences, to support localization and globalization
- The page is not trusted: the main process checks everything the page sends before it acts on it, as the page shows content from outside the app
- Use `oxlint` instead of `eslint`, because `typescript-eslint` does not support TypeScript 7 yet
- Use `shiki` with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- Syntax is colored in a module worker, which loads the grammars and the WebAssembly, keeping tokenizing off the page's main thread
- Image previews are fetched by the page from the app's own protocol rather than sent as messages, so the page can tell an image too large from one that failed
- Markdown is rendered with `markdown-it`, which VS Code's preview uses too
- Mermaid diagrams in Markdown are drawn with `mermaid` on the page's main thread, as VS Code's preview draws them, since it measures text in the DOM and can't run in a worker; each is shown as an image of its SVG, so the styles a document puts in a diagram can't reach the page

### Git, `git`

- Use the installed `git` CLI for everything, without bundling one; it needs git 2.52 or later on the PATH
- The git tool checks every hash and path the page sends against the history and the repository
- The commit list is read whole up front with `git rev-list` and kept by the main process per worktree, so the list knows its full size and locations can jump to any commit's position
- The tags of each remote are listed with `git ls-remote --tags` after each fetch and kept in the app's state rather than as refs, as git keeps no remote-tracking refs for tags, and refs would show up in other tools; it costs one more connection per remote after each fetch

### Commander, `commander`

- Folders are listed on Windows with `NtQueryDirectoryFile` through `koffi`, a page of entries at a time off the main thread, as Node can't read the hidden attribute or the size of files the system holds open, such as `pagefile.sys`; elsewhere with Node's `readdir` and `lstat`
- Native calls go through `koffi` while they are plain C functions; COM or Objective-C would go in an addon of our own

### Terminal, `terminal`

- Use `xterm.js` with its WebGL renderer on the page and `node-pty` for the shells, as VS Code does
- Run the shells in a utility process of their own, so a crash in the native code of `node-pty` or a flood of output can't stop or slow the window and the other tools
