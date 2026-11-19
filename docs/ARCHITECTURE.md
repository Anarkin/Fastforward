# ARCHITECTURE

- Only what nothing else can express is recorded here: a rule a test, a lint rule or a tsconfig can check belongs there instead, its reason in the name of its test

## Folders

- What each folder holds and what may import what are the tests of `app/src/test/architecture.test.ts` and `app/src/test/components.test.ts`, with the lint rules and the tsconfigs keeping each side from importing the other
- A file holds one concept: split it along its concepts once it takes a second

## Decisions

- The i18n dictionary, `app/src/lib/shared/strings.ts`, holds whole sentences, never parts to join, to support localization and globalization
- A dialog names the names, paths, branches, hashes, URLs and keys it is about on lines of their own after a sentence without them, the rest naming them in their sentence
- The page is not trusted: the main process checks everything the page sends before it acts on it, as the page shows content from outside the app
- Each window is a `BrowserWindow` loading a page of its own, rather than windows opened from one page, so a window can close without the others and no page code needs to know which document it draws in
- A tab dragged out of its row is run by the main process, as Chrome runs it, rather than by HTML drag and drop, so a window follows the pointer and the tab shows in the row it is dragged over; the window the tab left is kept see-through rather than hidden until the drop, as hiding or closing the window the pointer was pressed in ended the drag, and Electron has no move loop of the system to hand the window to
- In the `zustand` stores of the page: a store holds every action that posts, streams included, and any batching of them; the component that makes a store reads as little of it as it can, leaving the rest to its children; selectors return the narrowest slice, a primitive or a stable reference, never a whole sub-state of which only part is used, collections built in the reducer; a component takes as props what differs between its uses or comes from its parent's own state, and reads the rest from the store, passing elements rather than props down, none through more than one component that doesn't use it; new memos only for an obvious cost, as a pass over a list or a parse, or an identity something depends on
- The cursor of the text box with the focus is drawn by the page beside it, anchored to it by CSS anchor positioning, so it follows the box wherever it moves, the box's own caret hidden, as Chromium draws a block caret under the character in the character's own color and has no width for its bar
- Every scrollbar is one of the browser, drawn by the one skin of `app/src/shell/page/window.css`, rather than drawn by the page, so it takes its strip from the layout and looks alike in every tool; the page lays a cover nothing sees over the scrollbar under the pointer and takes its presses itself, as the browser steps and jumps by pixels, knowing nothing of rows, gliding or snapping, and no page can keep it from a press on its own scrollbar; a view that scrolls by itself, as a file viewed, the terminal and a text scrolled sideways, stands a scroller of the browser in for its scrollbar, as many times longer than itself as the view is than what it shows, and no longer than where its thumb is at its shortest
- Use `oxlint` instead of `eslint`, because `typescript-eslint` does not support TypeScript 7 yet
- Use `shiki` with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- Markdown is rendered with `markdown-it`, which VS Code's preview uses too
- Mermaid diagrams in Markdown are drawn with `mermaid` on the page's main thread, as VS Code's preview draws them, since it measures text in the DOM and can't run in a worker
- PDFs are drawn with the viewer components of `pdfjs-dist` inside the page, not in an iframe; the page reads a PDF through PDF.js's range transport, as PDF.js asks for ranges itself only over HTTP

### Git, `git`

- Use the installed `git` CLI for everything, rather than a library or a git bundled with the app
- The commit list is kept whole by the main process per worktree, rather than read a page at a time as it scrolls, so the list knows its full size and locations can jump to any commit's position
- A viewer tab showing a file as git keeps a version of it saves the commit or the index and the file whose history it is beside its path, as the main process never reads the view of a tab; the viewer reads a copy git takes out of the blob, made anew whenever the tab shows, so a restart or a cleared cache loses nothing

### Commander, `commander`

- Folders are listed on Windows with `NtQueryDirectoryFile` through `koffi`, off the main thread, as Node can't read the hidden attribute or the size of files the system holds open, such as `pagefile.sys`
- Native calls go through `koffi`, COM interfaces too, called through their tables of functions, rather than an addon of our own, which would need a compiler and binaries built for each platform; the menu of Windows runs its own message loop on the main thread, as Explorer's does, so the app waits while it is open
- Folders that need an administrator are read by a helper, the app itself started elevated in a mode of its own, as Total Commander does, rather than by restarting the app elevated, which would elevate the shells and git too and cut off drag and drop with other windows
- Archives are read with the command line of 7-Zip, shipped with the app at a pinned version, rather than a library such as `@zip.js/zip.js` or `7z.dll` through `koffi`, as one program reads every format a file manager meets, alike on every platform, edits those it writes, and runs in a process of its own
- Flat view sorts and filters its files in a worker of the page, which hands back their order as indexes, as sorting millions of files on the page's main thread would stall every tool for seconds
- Duplicate files are hashed in worker threads of the main process, as hashing at the speed of an SSD, about 3 GB/s for SHA-256 on one core, would keep its main thread busy most of the time
- Folder sizes are counted in worker threads of the main process, each walking folders with blocking calls, as the main thread was busy 80 to 98% of a count through the lister, a count of `C:\Program Files` took 2.9 s rather than 0.8 s and one of `C:\Windows` 15.6 s rather than 8.8 s

### Editor, `editor`

- The editor is CodeMirror 6, rather than Monaco or an editor of our own, as it draws its text in the DOM and lets decorations shape every part of it, so the text edited is laid out by the CSS and the code that lay out the diff and the viewer; Monaco measures and places every character itself, and an editor of our own would have to do the selection, input methods and undo again
- The code edited is colored by `shiki` in the worker of the colors, with the grammars of the viewer and the diff, rather than by CodeMirror's Lezer grammars, so the three color alike
- The text edited lives in the main process, as CodeMirror's `Text` with its undo history kept as JSON, as saving the settings reloads every page and a tab moves to another window by its id, so the page can't own it

### Terminal, `terminal`

- Use `xterm.js` with its WebGL renderer on the page and `node-pty` for the shells, as VS Code does
- The canvases of `xterm.js` take their CSS size from their size in device pixels, as it rounds that to whole CSS pixels, so the browser stretched them by a fraction of a pixel, blurring what they show further from their left edge
