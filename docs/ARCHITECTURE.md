# ARCHITECTURE

## Decisions

- Put all text people read, logs included, in the i18n dictionary, `app/src/shared/strings.ts`, as whole sentences, to support localization and globalization
- The page is not trusted: the main process checks every hash and path it sends against the history and the repository before it reaches git or the disk, as the page shows repository content
- Use `oxlint` instead of `eslint`, because `typescript-eslint` does not support TypeScript 7 yet
- Use the installed `git` CLI for everything, without bundling one; it needs git 2.52 or later on the PATH
- The commit list is read whole up front with `git rev-list` and kept by the main process per worktree, so the list knows its full size and locations can jump to any commit's position
- The tags of each remote are listed with `git ls-remote --tags` after each fetch and kept in the app's state rather than as refs, as git keeps no remote-tracking refs for tags, and refs would show up in other tools; it costs one more connection per remote after each fetch
- Use `shiki` with its Oniguruma engine, the TextMate grammars and engine VS Code uses, so scope rules carry over from VS Code; semantic tokens are left out, as they need a language server
- Syntax is colored in a module worker, which loads the grammars and the WebAssembly, keeping tokenizing off the page's main thread
- Image previews are fetched by the page from the app's own protocol rather than sent as messages, so the page can tell an image too large from one that failed
- Markdown is rendered with `markdown-it`, which VS Code's preview uses too
- In a terminal, with `--term`, the page is rendered offscreen and each changed area is sent as a sixel image, quantized to the 256 colors sixel has, with the terminal's mouse and key reports turned into input events; Windows Terminal reports 10 by 20 pixel cells whatever the font and scales each picture to its real cells, so there the page is rendered narrower and stretched to fit, taking the cells to be Cascadia Mono's unless the settings say otherwise; it runs beside a windowed copy without its single-instance lock, so both write the same state
