# ARCHITECTURE

## Decisions

- Put all text people read, logs included, in the i18n dictionary, `app/src/shared/strings.ts`, as whole sentences, to support localization and globalization
- The page is not trusted: the main process checks everything the page sends before it acts on it, as the page shows content from outside the app
- Use `oxlint` instead of `eslint`, because `typescript-eslint` does not support TypeScript 7 yet
- Use `shiki` with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- Markdown is rendered with `markdown-it`, which VS Code's preview uses too
- Mermaid diagrams in Markdown are drawn with `mermaid` on the page's main thread, as VS Code's preview draws them, since it measures text in the DOM and can't run in a worker
- PDFs are drawn with the viewer components of `pdfjs-dist` inside the page, not in an iframe; the page reads a PDF through PDF.js's range transport, as PDF.js asks for ranges itself only over HTTP, and runs no scripts, forms or editors of a PDF

### Git, `git`

- Use the installed `git` CLI for everything, rather than a library or a git bundled with the app
- The commit list is kept whole by the main process per worktree, rather than read a page at a time as it scrolls, so the list knows its full size and locations can jump to any commit's position

### Commander, `commander`

- Folders are listed on Windows with `NtQueryDirectoryFile` through `koffi`, a page of entries at a time off the main thread, as Node can't read the hidden attribute or the size of files the system holds open, such as `pagefile.sys`
- Native calls go through `koffi`, COM interfaces too, called through their tables of functions, rather than an addon of our own, which would need a compiler and binaries built for each platform; the menu of Windows runs its own message loop on the main thread, as Explorer's does, so the app waits while it is open
- Folders that need an administrator are read by a helper, the app itself started elevated in a mode of its own, as Total Commander does, rather than by restarting the app elevated, which would elevate the shells and git too and cut off drag and drop with other windows

### Terminal, `terminal`

- Use `xterm.js` with its WebGL renderer on the page and `node-pty` for the shells, as VS Code does
- Run the shells in a utility process of their own, so a crash in the native code of `node-pty` or a flood of output can't stop or slow the window and the other tools
