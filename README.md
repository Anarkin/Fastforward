# Fastforward

[![CI](https://github.com/Anarkin/Fastforward/actions/workflows/ci.yml/badge.svg)](https://github.com/Anarkin/Fastforward/actions/workflows/ci.yml)

- Fastforward is a git client inside VS Code: every commit of every branch, remote and tag, their files and their diffs, in a view that opens over the editor and closes out of the way
- It uses VS Code's built-in Git extension and the git it runs, so there is nothing else to set up

## Opening the View

- Run Fastforward: Toggle View from the Command Palette, or press `Ctrl+Alt+F` (`Cmd+Alt+F` on macOS) to open and close it
- Or click Fastforward on the left of the status bar
- The view opens in VS Code's modal editor, over the editors, and comes back as it was left

## Tabs

- Each tab is a repository; the first is the repository open in VS Code
- The + button opens more: a recent repository, or any folders you browse to
- The tabs are kept per workspace; close one with its × or a middle click, and sort them A-Z from the gear
- Resting the pointer on a tab loads it in the background, so it opens at once

## Commits

- The Commits column lists every commit of `HEAD`, the branches, the remotes and the tags, newest first, with a graph of their lanes; it handles hundreds of thousands of commits, loading them as you scroll
- Each row has the subject, the number of changed files, the author and the date, and bubbles for the branches, remotes and tags at the commit; the checked-out branch, or a detached `HEAD`, stands out
- The Uncommitted changes row on top has the staged, unstaged and untracked files
- Merge commits start collapsed, like in Sublime Merge, hiding the commits they brought in; click a merge's ring to expand or collapse it, or turn Collapse merge commits off in the column's gear
- Move through the list with the up and down arrow keys; click the selected commit again to clear the selection
- The list updates by itself when the repository changes, like after a commit, a checkout or a fetch, and stays where it was scrolled to

## Bookmarks

- The row under the address bar holds the bookmarks: branches, remotes, tags and commits to jump to with a click
- A repository starts with its main branch bookmarked, local and remote
- Right-click a bubble to add or remove it, or a commit row for the Bookmark submenu of its refs and the commit itself
- What is checked out is in the row too: the branch with the branch it tracks, or the detached `HEAD`
- A bookmarked ref that is gone is struck through until you remove it

## Changes and Files

- The Changes tab lists the files the selected commit changed, colored by their status, with their removed and added lines, as a list or a tree, which the column's gear switches
- The Files tab shows the whole repository at the selected commit, like the Explorer, with the changed files and the folders they are in marked
- Click a file to see its diff alone, or its whole content when the commit didn't change it; click it again for the whole commit's diff

## Diff

- The Diff column shows the changes of the selected commit, or of the selected file, with the old and new line numbers
- The header of the file you are scrolling through stays on top; click a file's header to collapse or expand it
- Files with more than 1,500 changed lines start collapsed, and are loaded only when you show them

## Address Bar

- The address bar shows the selected commit's short hash and subject
- Rest the pointer on it, or press `I`, to peek at the commit's details: its whole message, the full hash, the author and the committer, when it was authored and committed, and its branches, remotes and tags
- Click it, or press `Ctrl+L`, to search the branches, remotes and tags, each in a column of folders like `feature/`; type to filter them, move with the arrow keys and press Enter to jump to one
- Type four or more characters of a hash to go to that commit
- Right-click a branch, remote or tag in the search to check it out or bookmark it

## Back and Forward

- The back and forward buttons go through the commits you looked at, like a browser; the mouse's back and forward buttons work too
- Hold a button, or right-click it, to pick a commit from its history

## Fetch and Checkout

- The fetch button fetches every remote, dropping the branches deleted there
- Right-click a bubble to check it out, or a commit row to check out one of its branches, remotes or tags, or the commit itself
- Checking out a remote branch switches to the local branch of the same name, creating it to track the remote one, or fast-forwarding it when it is behind
- What git refuses, like a checkout that would overwrite uncommitted changes, shows up as a notification

## Keyboard Shortcuts

- `C` shows or hides the commit list, for more room for the files and the diff
- `I` peeks at the selected commit's details
- `Ctrl+L` (`Cmd+L` on macOS) opens the search
- The ? button at the right of the address bar lists them

## Layout

- Drag a column's edge to resize it, and double-click it for the default width
- The column widths, the merge setting and the Changes and Files choices are saved, and sync across machines with Settings Sync

## Requirements

- VS Code 1.130 or newer, with the built-in Git extension enabled
