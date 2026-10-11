# LIMITATIONS

This file only observes and documents the codebase mainly for human readers; the codebase is the single source of truth. It should be updated whenever a limit in the codebase changes.

## Diff

- A file over `25000` changed lines is left out of a commit's patch, or of the uncommitted changes', and loads when opened, as the page would freeze laying it out
- Once a commit's patch, or the uncommitted changes', would pass `25000` changed lines, every later file is left out and loads when opened, for the same reason
- Once a patch would pass `16 MB`, every later file is left out and loads when opened, as a minified file counts as one line however long
- A commit's patch counts toward the `16 MB` the files left out for their lines too, as git still sends them, and the uncommitted changes' patch counts the old and new text of each file it keeps
- A commit's patch is read only up to where it passes `25000` changed lines or `16 MB`, so the files left out after that show no count of their changed lines
- Once the paths of the uncommitted changes' patch would pass `16000` characters, every later file is left out and loads when opened; git is passed the files kept rather than those left out, so the command line stays under the `32767` characters Windows allows
- A file over `2 MB` has its whole text shown as binary and not used for colors, and an untracked one's patch is diffed again on every refresh
- Only the first `50` untracked files get line counts and are part of the patch of the uncommitted changes, or of a comparison with them, the rest being left out and loading when opened, as each one is read on its own to count its lines and diffed on its own with `git diff --no-index`
- An untracked text file over `2 MB` gets no line count and is left out of the patch of the uncommitted changes, or of a comparison with them, loading when opened, rather than being read whole to count its lines
- The patches of untracked files are kept by the main process up to `32 million` characters for each tab, forgetting the least recently used, so a refresh diffs only those changed since
- A block whose removed lines times its added lines pass `40000`, or whose words and punctuation marks compared pass `1 million`, each counting once for every line on the other side, has its lines paired in order instead of by similarity, as pairing compares every removed line with every added one
- Side by side, once pairing a block would take a diff past `4 million` words and punctuation marks compared, that block and every one after it have their lines paired in order, as side by side pairs every block before the diff is drawn
- A removed and an added line paired up whose counts of tokens multiplied pass `1 million`, each word, run of spaces and punctuation mark counting as one token, are marked as changed in full, like lines with no word in common, instead of word by word, as the word diff's table grows with both counts
- Find in a diff stops collecting matches at `10000`, and its count then reads `10000+`, as each match is marked in the page
- Find in a diff does not search a file left out of a patch until it loads, as its lines are not in the page, and says how many such files it skipped
- An image over `192 MB` is not previewed, as each image shown is read whole into the page
- At most `8` images up to `8 MB` and `2` larger ones are read at once, the rest waiting their turn, as each is read whole by the app too, and a Markdown preview asks for every image it links at once; an image read from git is first asked for only if it is up to `8 MB`, so a larger one takes a second git
- The images previewed are kept in the page up to `256 MB`, or as many as are shown when those take more, forgetting the least recently shown
- A Markdown preview loads no remote image, so opening a file tells no server, and opens only https and mail links
- A Markdown preview shows no image whose path passes through a symlink, as git sees no file there, so a link can't lead it outside the repository or to a server
- A side of a Markdown file over `2 MB` is not read, so its preview stays empty
- Find in a diff does not search a preview, as it searches the lines of the diff

## Syntax

- A side showing a line past its `5000`th is tokenized from its hunks alone, as tokenizing is sequential, so a late line costs every line before it, and only the first `5000` lines shown of a side, or of a file shown entire, are colored
- Once the sides of the open files take `20000` lines, counting a side tokenized from its hunks alone by its lines shown up to the `5000` it colors, later sides are tokenized from their hunks alone, as each whole text is read in full and tokenized up to its last line shown
- A line over `2000` characters is not colored, through Shiki's `tokenizeMaxLineLength`, as minified lines take long to tokenize
- A code block in a Markdown preview over `5000` lines is not colored, for the same reason as a side of a diff
- The colors kept are bounded at `100000` lines or `8 million` characters, forgetting the least recently used texts, and a text over `2 million` characters is never kept, bounding the page's memory
- The texts of files read from git for colors or Markdown previews are kept by the main process up to `16 million` characters, forgetting the least recently used, so a diff shown again reads none from git

## History

- A tab opened on a history whose HEAD, stashes and recent refs reach `5000` commits or more first shows `25` rows from their newest `5000` commits until the whole history is read, as that takes seconds in large repositories
- The recent refs of that first view are those whose commits were committed within `60 days` of the newest of the refs' commits, however recently the refs were made or moved
- That first view leaves out the count of a merge whose merged commits go on past its `5000` commits
- A repository without a commit-graph has no such first view, waiting for the whole history, as git would sort its whole history to find its newest commits
- When refs add commits that git would put among the old ones, at most `100000` of the newest commits are read again to place them, past which the whole history is read again, as placing them works through each commit read on the main process
- The graph draws at most `12` lanes, drawing the commits and lines of the lanes past them on the last one
- The commit list scrolls through at most `8 million` pixels, about `160000` commits, as Chromium can't lay out much taller elements; a longer list's scrollbar moves one to one only over its first and last million pixels and in proportion between them, and scrolling on from a commit jumped to moves the scrollbar back when it reaches either end
- Collapsing merges hides the commits a mainline of plain commits had when `git pull` merged it into a branch that then became the mainline, as that merge looks just like merging a branch
- A commit search stops at `50` matches and asks to narrow it down, and needs at least `3` characters to search commit messages, authors and committers, as each search walks every commit
- A hash needs at least `4` hex digits to be looked up, so `3` only search commit messages, authors and committers
- A hash prefix lists at most `20` commits
- The ref search draws at most `200` refs per group, the ref tree at most `200` folders and refs under a folder, and the stashes at most `200`, searched or not, counting the rest, as repositories can have thousands of refs
- Back keeps at most `100` steps, and the Back and Forward menus each show `20`

## Other

- A git command fails past `256 MB` of output, bounding the memory its output takes, the commit list's included though it is parsed while git sends it, so a history of over about `3 million` commits fails to load, but not a commit search's, which keeps only its matches
- A path that is not valid UTF-8, such as a Latin-1 name made on Linux, is read with `�` in place of each part that isn't, a name git and the disk know no file by, as the app can pass git a path only as UTF-8; such a file shows its changes only in the patch of all of a commit's files, or of all the uncommitted changes if it is tracked and no file is left out of it, none when selected on its own or opened after being left out of a patch; its text on disk can't be read, so its working tree side is colored from its hunks alone and previews no Markdown, it can't be opened through Show All Files, and an untracked one's lines aren't counted
- A fetch is stopped and reported as failed after `5 minutes`, but not the one git makes by itself in a partial clone for the objects a read needs, such as an old commit's files
- Fetching in the background waits at most `35791 minutes` between rounds, about `25 days`, however long `autoFetchMinutes` sets, as a timer can't wait longer
- Quitting, or restarting into an update, stops every git at once but a checkout or fast-forward, waiting at most `30 seconds` in all for those, counting one started while it waits, as stopping one midway can leave the working tree half switched
- On Windows, which stops git with no chance to clean up, the index lock of a checkout or fast-forward stopped on quitting is then removed, but not the locks of a fetch stopped as it updates refs
- A page whose process is gone, such as killed or out of memory, is loaded again, but not when it goes again within `1 minute` of that, leaving the window blank, as a page that goes as it loads would go again and again
- Opening a repository runs the commands its git config names, as git itself does, such as clean filters while reading the working tree and credential helpers or `core.sshCommand` while fetching, but never a `core.fsmonitor` hook, while git's built-in fsmonitor daemon still runs, read as on or off the first time the app runs git in a folder, nor an external diff or textconv driver, as diffs are shown as git computes them
- Fetching in the background never asks for credentials, running no askpass program, as no one may be there to answer, so a remote whose credential helper can't give them without asking fails each round, telling only of the first failure until a fetch succeeds
- On Linux, which has no recursive file watching, every folder that is not ignored takes one of the system's inotify watches, and past `fs.inotify.max_user_watches` the rest are not watched and the error is logged; the folders are asked again whether they are ignored when a `.gitignore` or `.git/info/exclude` changes, but not when the file `core.excludesFile` names does
- On Windows and macOS, a worktree whose folder, or a git folder kept outside it, can't be watched, or stops being watched, as when a network share drops, shows no change made outside the app in that folder until it is opened again, and a notice says so
- On Windows, the folders that hold the shown worktree, or its git folders kept outside it, as a linked worktree's are, can't be renamed or moved, as Windows keeps the folders above a watched one from being renamed
- The login shell's PATH, read on macOS and Linux, is waited for at most `5 seconds`, then the app starts with the PATH it was given, so a profile waiting for input does not keep the window from opening
- `git --version` is waited for at most `10 seconds` when the app looks for git, past which git counts as missing
- Updates are checked for when the app starts and `4 hours` after each check ends, until one is downloaded, after which none is checked for until the app restarts
- On Windows, only an app set up by the installer updates itself, not one run from `win-unpacked`
- On Linux, only an app run as an AppImage, or one with the `package-type` file the deb build adds to its `resources` folder, updates itself, not an AppImage extracted with `--appimage-extract`, as the updater replaces the AppImage it was started from
- On macOS, an update is only announced, with a link to its release, as Squirrel.Mac installs only updates signed with a Developer ID, and the app is only ad-hoc signed
- The window can't be made smaller than `1280` by `720` pixels, or the narrowest and shortest work areas of the screens present when it opens, when those are smaller, so the commit list and the columns beside it keep their least widths
- At most `4` notices are shown, dropping the oldest, and one that is not an error closes itself after `8 seconds`
- After a checkout, the notice of the commits left on no branch or tag names at most `5` of them, counting the rest
- At most `20` recent repositories are kept, dropping the oldest, counting those open in tabs, which the list leaves out
