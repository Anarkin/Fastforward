# LIMITATIONS

This file only observes and documents the codebase mainly for human readers; the codebase is the single source of truth. It should be updated whenever a limit in the codebase changes.

## Diff

- A file over 1500 changed lines is left out of a commit's patch and loads when opened, as the webview would freeze laying it out
- Once a commit's patch would pass 20000 changed lines, every later file is left out and loads when opened, for the same reason
- Once the old and new text of a commit's files would pass 16 MB, every later file is left out and loads when opened, as a minified file counts as one line however long
- Once the paths of a commit's patch would pass 16000 characters, every later file is left out and loads when opened; git is passed the files kept rather than those left out, so the command line stays under the 32767 characters Windows allows
- A file over 2 MB has its whole text shown as binary and not used for colors, and an untracked one's patch is diffed again on every refresh
- Only the first 50 untracked files get line counts and are part of the All Changes or Unstaged patch, as each one is read on its own to count its lines and diffed on its own with `git diff --no-index`
- A block of over 40000 removed by added lines, or 1 million words and punctuation marks compared, has its lines paired in order instead of by similarity, as pairing compares every removed line with every added one
- A removed and an added line paired up with over 1 million tokens of one by those of the other, each word, run of spaces and punctuation mark counting as one, are marked as changed in full, like lines with no word in common, instead of word by word, as the word diff's table grows with both counts
- Find in a diff stops collecting matches at 10000, and its count then reads 10000+, as each match is marked in the page
- An image over 192 MB is not previewed, as each image shown is read whole into the page
- The images previewed are kept in the page up to 256 MB, forgetting the least recently shown
- A Markdown preview loads no remote image, so opening a file tells no server, and opens only https and mail links
- A side of a Markdown file over 2 MB is not read, so its preview stays empty
- Find in a diff does not search a preview, as it searches the lines of the diff

## Syntax

- A side showing a line past its 5000th is tokenized from its hunks alone, as tokenizing is sequential, so a late line costs every line before it, and only the first 5000 lines shown of a side, or of a file shown entire, are colored
- Once the sides of the open files take 20000 lines, counting a side tokenized from its hunks alone by its lines shown up to the 5000 it colors, later sides are tokenized from their hunks alone, as each whole text is read in full and tokenized up to its last line shown
- A line over 2000 characters is not colored, through Shiki's `tokenizeMaxLineLength`, as minified lines take long to tokenize
- A code block in a Markdown preview over 5000 lines is not colored, for the same reason as a side of a diff
- The colors kept are bounded at 100000 lines or 8 million characters, forgetting the least recently used texts, and a text over 2 million characters is never kept, bounding the webview's memory

## History

- A tab opened on a history of over 5000 commits first shows 25 rows from its newest 5000 commits, read from HEAD, the stashes and the refs updated within 60 days of the newest one, leaving out the count of a merge whose merged commits go on past them, until the whole history is read, as that takes seconds in large repositories
- The graph draws at most 12 lanes, drawing lines past the last lane on it
- The commit list scrolls through at most 8 million pixels, about 160000 commits, as Chromium can't lay out much taller elements; a longer list's scrollbar moves one to one only over its first and last million pixels and in proportion between them, and scrolling on from a commit jumped to moves the scrollbar back when it reaches either end
- Collapsing merges hides the commits a mainline of plain commits had when `git pull` merged it into a branch that then became the mainline, as that merge looks just like merging a branch
- A commit search stops at 50 matches and asks to narrow it down, and needs at least 3 characters to search commit messages, authors and committers, as each search walks every commit
- A hash needs at least 4 hex digits to be looked up, so 3 only search commit messages, authors and committers
- A hash prefix lists at most 20 commits
- The ref search draws at most 200 refs per group, and the ref tree at most 200 folders and refs under a folder, counting the rest, as repositories can have thousands of refs
- Back keeps at most 100 steps, showing 20 in its menu

## Other

- A git command fails past 256 MB of output, as Node's `maxBuffer` must be set to some limit
- A fetch is stopped and reported as failed after 5 minutes
- Quitting stops every git at once but a checkout or fast-forward, which it waits at most 30 seconds for, as stopping one midway can leave the working tree half switched
- Opening a repository runs the commands its git config names, as git itself does, such as clean filters while reading the working tree and credential helpers or `core.sshCommand` while fetching; only a `core.fsmonitor` hook is never run, while git's built-in fsmonitor daemon still is, read as on or off the first time the app runs git in a folder
- On Linux, which has no recursive file watching, every folder that is not ignored takes one of the system's inotify watches, and past `fs.inotify.max_user_watches` the rest are not watched and the error is logged
- The login shell's PATH, read on macOS and Linux, is waited for at most 5 seconds, then the app starts with the PATH it was given, so a profile waiting for input does not keep the window from opening
- `git --version` is waited for at most 10 seconds when the app looks for git, past which git counts as missing
- Updates are checked for when the app starts and 4 hours after each check ends
- On Windows, only an app set up by the installer updates itself, not one run from `win-unpacked`
- On macOS, an update is only announced, with a link to its release, as Squirrel.Mac installs only updates signed with a Developer ID, and the app is only ad-hoc signed
- At most 4 notices are shown, dropping the oldest
- At most 20 recent repositories are kept, dropping the oldest
