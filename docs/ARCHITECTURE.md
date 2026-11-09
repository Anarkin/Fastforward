# ARCHITECTURE

## Decisions

- Put all text people read, logs included, in the i18n dictionary, `app/src/shared/strings.ts`, as whole sentences, to support localization and globalization
- The page is not trusted: the main process checks everything the page sends before it acts on it, as the page shows content from outside the app
- State that several components of the page share, state of the main process and state that outlives the component showing it live in a `zustand` store, at most one per tool and one for the shell, made where it mounts, handed out by one context that throws outside it once more than one component reads it, holding every action that posts, streams included, and any batching of them, and fed the main process's state messages through the existing reducers, replies to requests for pages or ranges staying with listeners; the component that makes a store reads as little of it as it can, leaving the rest to its children; selectors return the narrowest slice, a primitive or a stable reference, never a whole sub-state of which only part is used, collections built in the reducer; a component takes as props what differs between its uses or comes from its parent's own state, and reads the rest from the store, passing elements rather than props down, none through more than one component that doesn't use it; `ui/` takes only props; other state one component uses stays in it; new memos only for an obvious cost, as a pass over a list or a parse, or an identity something depends on; so contexts don't stack and the logic is tested without React
- Use `oxlint` instead of `eslint`, because `typescript-eslint` does not support TypeScript 7 yet
- Use `shiki` with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- Lines are wrapped where Chromium would break them, as the diff lets the browser wrap them and the viewer wraps them itself: by Chromium's table between two characters of ASCII, and by ICU's line breaker beyond, asked through V8's `Intl.v8BreakIterator`, which also splits text into the characters it draws; the comparison of the two is a test, and without the iterator, as in Node, CJK characters and emoji break around them
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
- Archives are read with the command line of 7-Zip, shipped with the app at a pinned version, rather than a library such as `@zip.js/zip.js` or `7z.dll` through `koffi`, as one program reads every format a file manager meets, alike on every platform, edits those it writes, and runs in a process of its own; the commander reaches it only through a reader of archives of its own, so another can take its place
- Flat view reads the tree in the main process a few folders at a time and sends the page the files of each folder, and the page sorts and filters them in a worker of its own, which hands back their order as indexes, as sorting millions of files on the page's main thread would stall every tool for seconds

### Terminal, `terminal`

- Use `xterm.js` with its WebGL renderer on the page and `node-pty` for the shells, as VS Code does
- Run the shells in a utility process of their own, so a crash in the native code of `node-pty` or a flood of output can't stop or slow the window and the other tools
