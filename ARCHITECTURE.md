# ARCHITECTURE

## Layout

- `extension/src/shared/` is the only code both sides use: the extension imports nothing from `webview/`, and the webview nothing but `shared/`; the lint rules in `.oxlintrc.json` and the `tsconfig.extension.json` and `tsconfig.webview.json` checks enforce it
- `view.ts` coordinates the view: it saves through `storage.ts`, changes the repository through `operations.ts`, and runs git through `git/`
- `tabState.ts`, `refs.ts` and `history/` work out what a tab shows without git or VS Code, so the unit tests run them outside VS Code
- `git/` runs the git CLI, apart from `repository.ts`, which uses the Git extension API

## State

### Tabs and Replay

- The webview is recreated every time the modal opens, so the extension keeps each tab's state, including the last message of each kind the page shows (`Shown` in `tabState.ts`)
- Opening a tab, or the modal, replays those messages first, so it shows up at once as it was left, and then refreshes, which sends only what changed since
- Not replayed: messages that happen once, like `reveal` and `error`; answers the page asks for again, like `commitPage`, `fileDiff` and `hashLookup`; and what is sent anyway, like `layout`, `tabs` and `bookmarks`
- Messages about a tab carry its root, as they can arrive after the user switched tabs; the extension drops those for a tab that isn't shown anymore, apart from the ones it saves for their tab, like `setBookmarks` and `scrolled`

### Preloading

- The pointer resting on a tab preloads it: the extension loads it as it first opens, at what is checked out, keeping its messages without posting them
- Opening a preloading tab waits for the preload, then replays and refreshes like a tab opened before; a failed preload leaves the tab to load the usual way

### Refreshes

- The Git extension's change events refresh the shown tab once they stop for 300 ms: the uncommitted changes always, and the history only when the fingerprint of `HEAD` and every ref changed
- One load or refresh runs at a time per tab, as two history loads at once could let the older one win; refreshes asked for meanwhile fold into one more after it, which goes to every page that asked, as a watcher of an older page can ask after a newer page did
- A tab's first load waits for a running refresh instead of folding into it
- A reload keeps the list's place: the page reports the commit at the top of the list and how far it is scrolled into it once scrolling stops, and the new list starts there

### History Generations

- Every list the extension lays out gets a new generation, which the page asks for pages of commits with; answers for an older generation are dropped on both sides, and so is a list that took longer to send than a newer one
- The history is loaded once per fingerprint; collapsing or expanding merges only lays out the loaded history again

### Merge Collapsing

- Like Sublime Merge: the shown commits are the tips of unmerged branches and `HEAD`, the first parents of shown commits, and every parent of an expanded merge
- The setting applies to every merge; each tab keeps the merges the user toggled against it, which a change of the setting clears; tabs in the background lay out their history again when they come back
- Jumping to a commit hidden in collapsed merges expands those merges

### Storage

- Per workspace: `tabs`, the repository roots of the open tabs, and `activeTab`
- Per user: `recentRepositories`, which + offers; `columnWidths`, `collapseMerges`, `filesMode` and `changesView`, synced across machines
- Per user, not synced, as the roots are paths on this machine: the bookmarks by repository root, under `vips` for historical reasons, as bookmarks were called that at first; a repository without an entry gets its main branch as a bookmark when it first opens

## Decisions

### Tooling

- Use Oxlint instead of ESLint, because typescript-eslint does not support TypeScript 7 yet

### UI

- The view is a custom editor opened with the internal `_workbench.openWith` command and group `-4`, because that is the only way for an extension to open an editor in the modal editor part

### Git Integration

- Use the built-in VS Code Git extension API for anything it supports well, and call the git CLI for anything it can't do or does too slowly
- The commit list is every commit of `HEAD`, the branches, the remotes and the tags from `git rev-list`, kept by the extension per tab, so the list knows its full size up front and locations can jump to any commit's position; it took about 0.5 s for 190k commits
- Commits are loaded by hash with `git log --stdin --no-walk --raw` instead of the Git extension API, because the API only counts files with `--shortstat`, which diffs every file's contents and took 8 s instead of 0.1 s for 300 commits in a large repository
- Commit files and patches come from `git show`, because the Git extension API only diffs ranges (`a...b`), which fails for root commits
