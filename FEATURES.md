# FEATURES

- What a git client can do, and how much of it Fastforward does

- Fastforward: ✅ Yes, 🟡 Partial, 👁 View only (shown, but nothing can be done with it), ❌ No

- Tier, a judgement call from what Fork, Sourcetree, GitKraken, Tower, SmartGit, Sublime Merge, GitHub Desktop and VS Code offer: Core is in nearly every client, Common in most full clients, Advanced in a few, Niche rarely outside the CLI

- The git command is the usual one for the feature; where Fastforward runs another, the notes say so

## Summary

- Fastforward shows nearly all a repository holds, but changes it only by checking out, fetching, pulling by fast-forward, pushing, and pushing a tag

| Category | Features | ✅ | 🟡 | 👁 | ❌ |
| --- | --- | --- | --- | --- | --- |
| Repositories | 12 | 6 | 0 | 0 | 6 |
| Working tree | 11 | 3 | 0 | 0 | 8 |
| Committing | 10 | 0 | 0 | 0 | 10 |
| History and graph | 25 | 13 | 4 | 0 | 8 |
| Diffs | 26 | 20 | 2 | 0 | 4 |
| Files | 9 | 3 | 0 | 0 | 6 |
| Branches | 16 | 9 | 1 | 0 | 6 |
| Tags | 10 | 4 | 0 | 0 | 6 |
| Remotes | 18 | 8 | 3 | 0 | 7 |
| Merging and rewriting | 11 | 0 | 0 | 0 | 11 |
| Conflicts | 6 | 0 | 0 | 1 | 5 |
| Stashes | 7 | 2 | 0 | 0 | 5 |
| Worktrees | 6 | 3 | 0 | 0 | 3 |
| Submodules and large files | 6 | 0 | 1 | 0 | 5 |
| More git | 8 | 0 | 0 | 0 | 8 |
| Hosting | 6 | 0 | 0 | 0 | 6 |
| App | 10 | 4 | 3 | 0 | 3 |
| **All** | **197** | **75** | **14** | **1** | **107** |

| Tier | Features | ✅ | 🟡 | 👁 | ❌ |
| --- | --- | --- | --- | --- | --- |
| Core | 52 | 29 | 3 | 1 | 19 |
| Common | 79 | 30 | 8 | 0 | 41 |
| Advanced | 51 | 15 | 3 | 0 | 33 |
| Niche | 15 | 1 | 0 | 0 | 14 |

## Repositories

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Open a repository | Open a folder and find the repository it is in | `git rev-parse --show-toplevel` | Core | ✅ Yes | Browse..., `ff` or `ff <folder>` in a terminal, Open in Fastforward in the Windows Explorer menu |
| Recent repositories | Reopen a repository opened before | — | Core | ✅ Yes | Removed from the list with its X or Delete |
| Several repositories at once | Keep repositories open side by side | — | Common | ✅ Yes | Tabs, dragged into any order or sorted A-Z, preloaded in the background |
| Create a repository | Start a repository in a folder | `git init` | Core | ❌ No | |
| Clone | Copy a remote repository | `git clone` | Core | ❌ No | |
| Clone options | Clone shallow, partial, one branch, or with submodules | `git clone --depth`, `--filter`, `--single-branch`, `--recurse-submodules` | Advanced | ❌ No | |
| Shallow repositories | Show a history cut off at a depth | — | Advanced | ✅ Yes | Reloads the history when the shallow boundary moves |
| Outside changes | Refresh when git or an editor changes the repository | — | Core | ✅ Yes | Watches the working tree and the git folder; refs, changes and worktrees refresh on their own |
| Large repositories | Stay fast with long histories and big diffs | `git rev-list` | Core | ✅ Yes | Reads the whole history up front, draws only the rows in view, loads large files on demand |
| Repository settings | Edit the name, email and other config of a repository | `git config` | Common | ❌ No | Reads the push and fetch config, never writes it |
| Open in other tools | Open the repository in a terminal, editor or file manager | — | Common | ❌ No | The other way works: `ff` opens Fastforward from a terminal |
| Maintenance | Collect garbage, repack, check integrity | `git gc`, `git maintenance`, `git fsck` | Niche | ❌ No | |

## Working tree

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Status | List the changed, added, deleted and untracked files | `git status --porcelain=v2` | Core | ✅ Yes | An Uncommitted changes row on top of the graph, with a count |
| Staged and unstaged apart | Show the index and the working tree separately | `git diff --cached`, `git diff` | Core | ✅ Yes | All Changes against HEAD, Staged, and Unstaged against the index |
| Ignored files | List the files `.gitignore` hides | `git status --ignored` | Advanced | ❌ No | |
| Stage and unstage files | Add files to the index, or take them out | `git add`, `git restore --staged` | Core | ❌ No | The staged and unstaged views are read-only |
| Stage hunks or lines | Stage part of a file | `git apply --cached` | Common | ❌ No | |
| Discard changes | Throw away the changes of files, hunks or lines | `git restore`, `git apply -R` | Core | ❌ No | |
| Remove untracked files | Delete files git doesn't track | `git clean` | Common | ❌ No | |
| Ignore a file | Add a path or pattern to `.gitignore` | — | Common | ❌ No | |
| Hide local edits | Keep edits of tracked files out of the status | `git update-index --assume-unchanged`, `--skip-worktree` | Niche | ❌ No | |
| Move and remove tracked files | Rename or delete files through git | `git mv`, `git rm` | Niche | ❌ No | |
| Symbolic links | Show links as links rather than files | — | Advanced | ✅ Yes | Marked in the files; the diff names the target of each side, whether git makes real links or not |

## Committing

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Commit | Record the staged changes | `git commit` | Core | ❌ No | |
| Message editor | Write a subject and body, with length guides | — | Core | ❌ No | |
| Amend | Change the last commit | `git commit --amend` | Core | ❌ No | |
| Sign commits | Sign with GPG or SSH | `git commit -S` | Common | ❌ No | |
| Verify signatures | Show whether a commit's signature is good | `git log --format=%G?` | Advanced | ❌ No | |
| Trailers | Add Co-authored-by and other trailers | `git commit --trailer` | Advanced | ❌ No | |
| Fixup and squash commits | Make commits a rebase folds in | `git commit --fixup`, `--squash` | Advanced | ❌ No | |
| Commit hooks | Run pre-commit and commit-msg hooks, or skip them | `git commit --no-verify` | Common | ❌ No | Hooks git runs on checkout do run |
| Commit templates | Start the message from `commit.template` | — | Advanced | ❌ No | |
| Generated messages | Draft the message from the diff with AI | — | Advanced | ❌ No | |

## History and graph

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Commit list | List the commits, newest first | `git log` | Core | ✅ Yes | `git rev-list --date-order`, read whole, so the list knows its size and jumps anywhere |
| Graph | Draw the lanes of branches and merges | `git log --graph` | Core | ✅ Yes | Up to 12 lanes in 8 colors, folding the rest into the last |
| All branches or one | Show every ref's history, or HEAD's only | `git log --all`, `git log HEAD` | Common | ✅ Yes | Solo, remembered per repository |
| Chosen branches | Show the history of chosen branches only | `git log <ref>...` | Common | 🟡 Partial | Solo shows HEAD's only |
| Hidden branches | Leave chosen branches out of the graph | `git log --exclude` | Advanced | ❌ No | |
| Collapsed merges | Fold the commits a merge brought in into its row | — | Advanced | ✅ Yes | On by default; Space or a click expands one |
| First parent | Follow the mainline only | `git log --first-parent` | Advanced | 🟡 Partial | Collapsed merges come close; Mod+Down selects the first parent |
| Sort order | Sort by date or topology | `--date-order`, `--topo-order`, `--author-date-order` | Advanced | 🟡 Partial | Date order only |
| Ref labels | Show branches, remote branches, tags and HEAD on their commits | `git log --decorate` | Core | ✅ Yes | Bubbles, tags shaped as tags, remote tags, bookmarked hashes |
| Uncommitted changes in the graph | Draw the working tree as a row leading to HEAD | — | Common | ✅ Yes | |
| Stashes in the graph | Draw stashes on the commits they were made on | — | Common | ✅ Yes | |
| Commit details | Show the author, committer, date and whole message | `git show -s` | Core | ✅ Yes | Alt peeks over a row, Alt+click pins it |
| Copy a hash or message | Put a commit's hash or message on the clipboard | — | Core | 🟡 Partial | The text of a pinned message can be selected; no command copies a hash |
| Jumps | Select HEAD, the upstream or the first parent | — | Common | ✅ Yes | H, U, Mod+Down |
| Back and forward | Retrace the selected commits like a browser | — | Advanced | ✅ Yes | Alt+Left and Alt+Right, the mouse buttons, held for a list |
| Bookmarks | Keep branches, tags or commits at hand | — | Advanced | ✅ Yes | Kept by the app per repository, not as refs |
| Search messages and people | Find commits by message, author or committer | `git log --grep`, `--author`, `--committer` | Core | ✅ Yes | Runs `git log` and matches in the app, ignoring case |
| Find a hash | Go to a commit from the start of its hash | `git rev-parse --disambiguate` | Common | ✅ Yes | Lists every commit it may be |
| Search the content | Find commits that add or remove some text | `git log -S`, `-G` | Advanced | ❌ No | |
| Filter by date or path | Narrow the list to dates or paths | `git log --since`, `--until`, `-- <path>` | Advanced | ❌ No | |
| Reflog | List where HEAD and the branches have been | `git reflog` | Advanced | ❌ No | |
| Notes | Show the notes attached to commits | `git notes` | Niche | ❌ No | |
| Avatars | Show the authors' pictures | — | Common | ❌ No | |
| Links in messages | Link issue numbers and URLs in messages | — | Advanced | ❌ No | |
| Statistics | Count commits per author and over time | `git shortlog -sn` | Niche | ❌ No | |

## Diffs

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Commit diff | Show the files a commit changed and their patch | `git show` | Core | ✅ Yes | With the lines added and removed per file |
| Merge diff | Show what a merge changed | `git show --diff-merges=<format>` | Common | 🟡 Partial | Against the first parent only, no combined diff |
| Working tree diffs | Diff the unstaged, the staged, or all against HEAD | `git diff`, `git diff --cached`, `git diff HEAD` | Core | ✅ Yes | Untracked files show as added |
| Compare two commits | Diff any two commits | `git diff <a> <b>` | Common | ✅ Yes | Mod+click the second; the first selected is the old side |
| Compare with the working tree | Diff a commit against the uncommitted changes | `git diff <a>` | Common | ✅ Yes | Mod+click the Uncommitted changes row |
| Compare from the merge base | Show what a branch adds since it forked | `git diff <a>...<b>` | Common | ❌ No | Comparing two tips shows the changes of both |
| Inline and side by side | Show the two sides in one column or two | — | Core | ✅ Yes | Side by side by default |
| Changed words | Mark the words that changed within lines | `git diff --word-diff` | Common | ✅ Yes | Pairs each changed line with the one it most resembles |
| Syntax highlighting | Color the code of the diff | — | Common | ✅ Yes | `shiki`, with VS Code's TextMate grammars |
| Ignore whitespace | Leave out changes of whitespace alone | `git diff -w` | Common | ✅ Yes | On by default; files with only whitespace changes are named |
| Show whitespace | Draw the spaces, tabs and line ends | — | Advanced | ✅ Yes | `.` |
| Context | Show more lines around the changes, or the whole file | `git diff -U<n>` | Common | ✅ Yes | The whole file, for one file or pinned for all; no expanding a few lines at a time |
| Line wrapping | Wrap long lines | — | Common | ✅ Yes | W |
| Find in the diff | Search the diff's text | — | Common | ✅ Yes | Mod+F |
| Next change | Move from change to change | — | Common | ✅ Yes | J and K, from the files too |
| Minimap | Mark the changes on a strip beside the diff | — | Advanced | ✅ Yes | |
| Renames and copies | Pair a moved file's old and new path | `git diff -M`, `-C` | Core | ✅ Yes | Notes the ones without changes |
| Mode and type changes | Show changes of mode, and files that became links | — | Common | ✅ Yes | |
| Binary files | Say a file is binary instead of showing a patch | — | Core | ✅ Yes | |
| Image diff | Show the two sides of an image | — | Common | ✅ Yes | Side by side, with size; SVG switches between source and image; no swipe or onion skin |
| Rendered Markdown | Show Markdown rendered | — | Niche | ✅ Yes | `markdown-it`, with the HTML GitHub keeps and the relative images at that revision |
| Large diffs | Stay responsive on huge changes | — | Common | ✅ Yes | Large files load when asked for |
| Diff algorithm | Choose Myers, patience or histogram | `git diff --diff-algorithm=<name>` | Advanced | 🟡 Partial | Always histogram |
| External diff tool | Open a diff in another app | `git difftool` | Common | ❌ No | |
| Diff drivers | Diff through the drivers and filters of `.gitattributes` | `git diff --ext-diff`, `--textconv` | Niche | ❌ No | Turned off with `--no-ext-diff --no-textconv` |
| Save as a patch | Export a diff or commits as patches | `git diff`, `git format-patch` | Advanced | ❌ No | |

## Files

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Browse a revision | List every file of a commit | `git ls-tree -r` | Common | ✅ Yes | Show All Files, the unchanged with the changed |
| A file at a revision | Show a file as a commit has it | `git show <rev>:<path>` | Common | ✅ Yes | Show the Entire File |
| Filter the files | Narrow the files to those matching a search | — | Common | ✅ Yes | Every word must be in the path or the old path |
| File history | List the commits that changed a file | `git log --follow -- <path>` | Common | ❌ No | |
| Blame | Show who last changed each line | `git blame` | Common | ❌ No | |
| Line history | List the commits that changed some lines | `git log -L` | Advanced | ❌ No | |
| Restore a file | Put back a file as a revision has it | `git restore --source=<rev> -- <path>` | Common | ❌ No | |
| Save a file | Save a file as a revision has it | `git show <rev>:<path>` | Advanced | ❌ No | |
| Open a file | Open a file in an editor, or show it in its folder | — | Common | ❌ No | |

## Branches

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Local branches | List the local branches | `git branch` | Core | ✅ Yes | In the search, grouped into folders by `/` |
| Remote branches | List the remote branches | `git branch -r` | Core | ✅ Yes | |
| Switch | Check out a branch | `git switch` | Core | ✅ Yes | Never overwrites ignored files |
| Check out a remote branch | Make a local branch that tracks it | `git switch -c <name> --track <remote>/<name>` | Core | ✅ Yes | Switches to the local branch instead when there is one, and fast-forwards it |
| Check out a commit | Detach HEAD at a commit or tag | `git switch --detach` | Common | ✅ Yes | Names the commits left on no branch or tag |
| Carry changes | Keep the local changes when switching | `git switch --merge` | Common | ❌ No | Says why git refused |
| Create | Make a branch | `git branch`, `git switch -c` | Core | ❌ No | |
| Rename | Rename a branch | `git branch -m` | Core | ❌ No | |
| Delete | Delete a branch | `git branch -d`, `-D` | Core | ❌ No | |
| Delete a remote branch | Delete a branch on its remote | `git push --delete` | Common | ❌ No | |
| Upstream | Set or unset the branch a branch tracks | `git branch --set-upstream-to`, `--unset-upstream` | Common | 🟡 Partial | Set only when publishing |
| Ahead and behind | Count the commits to pull and to push | `git rev-list --left-right --count` | Core | ✅ Yes | On the checked-out branch's bubble, since the last fetch; notes an upstream gone |
| Fast-forward another branch | Move a branch that isn't checked out to its upstream | `git fetch . <upstream>:<branch>` | Advanced | ✅ Yes | Pull on any branch's bubble; knows branches checked out in other worktrees |
| Find a branch | Search the branches | — | Common | ✅ Yes | |
| Favorites | Keep chosen branches at hand | — | Advanced | ✅ Yes | Bookmarks |
| Branching models | Start and finish features and releases | `git flow` | Advanced | ❌ No | |

## Tags

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Tags | List the tags | `git tag` | Core | ✅ Yes | |
| Remote tags | Show the tags each remote has | `git ls-remote --tags` | Advanced | ✅ Yes | Listed after each fetch and kept by the app, not as refs |
| Check out a tag | Detach HEAD at a tag | `git switch --detach <tag>` | Common | ✅ Yes | |
| Push a tag | Send a tag to a remote | `git push <remote> <tag>` | Core | ✅ Yes | A button on each tag the remote lacks; refused when the remote has it on another commit |
| Push all tags | Send every tag, or those of pushed commits | `git push --tags`, `--follow-tags` | Common | ❌ No | |
| Create | Make a lightweight or annotated tag | `git tag`, `git tag -a` | Core | ❌ No | |
| Signed tags | Sign a tag, or verify one | `git tag -s`, `git tag -v` | Advanced | ❌ No | |
| Delete | Delete a tag | `git tag -d` | Core | ❌ No | |
| Delete a remote tag | Delete a tag on a remote | `git push --delete <remote> <tag>` | Common | ❌ No | |
| Tag message | Show an annotated tag's message | `git tag -n` | Common | ❌ No | |

## Remotes

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Remotes | List the remotes and their URLs | `git remote -v` | Core | 🟡 Partial | Remote branches are grouped by remote; no URLs |
| Manage remotes | Add, rename and remove remotes, change their URLs | `git remote add`, `rename`, `remove`, `set-url` | Common | ❌ No | |
| Fetch | Fetch every remote | `git fetch --all` | Core | ✅ Yes | |
| Fetch one remote | Fetch a chosen remote | `git fetch <remote>` | Common | ❌ No | |
| Prune | Drop the branches deleted on the remote | `git fetch --prune` | Common | ✅ Yes | Only for remotes whose fetch writes into `refs/remotes`, unless the config says otherwise |
| Fetch in the background | Fetch every few minutes | — | Common | ✅ Yes | Every minute by default, every open repository |
| Fetch status | Show when the last fetch ran, and whether it failed | — | Advanced | ✅ Yes | |
| Pull by fast-forward | Fetch, then fast-forward to the upstream | `git pull --ff-only` | Core | ✅ Yes | `git fetch --all`, then `git merge --ff-only`; says why when ahead or diverged |
| Pull by merging | Fetch, then merge the upstream | `git pull --no-rebase` | Core | ❌ No | |
| Pull by rebasing | Fetch, then rebase onto the upstream | `git pull --rebase` | Core | ❌ No | |
| Push | Send the new commits to the upstream | `git push` | Core | ✅ Yes | Follows `push.default`, `pushRemote` and the branch's merge config; refuses what `git push` would |
| Publish | Push a branch without an upstream and track it | `git push -u <remote> <branch>` | Core | ✅ Yes | With a single remote only |
| Choose the remote | Pick the remote to push or publish to | — | Common | ❌ No | Says it's unclear with several remotes |
| Force push | Overwrite the remote branch | `git push --force-with-lease` | Common | ❌ No | Refuses to push a diverged branch |
| Push another branch | Push a branch that isn't checked out | `git push <remote> <branch>` | Advanced | ✅ Yes | Push on any branch's bubble |
| Progress | Show how far a transfer got, and stop it | `--progress` | Common | 🟡 Partial | Shows it running, no progress or stop; a fetch or push silent for 5 minutes is stopped |
| Authentication | Sign in to remotes | credential helpers, SSH agent | Core | 🟡 Partial | Through git's credential helpers and SSH, never a terminal prompt; background fetches never ask |
| Credentials and keys | Store tokens, make SSH keys | — | Common | ❌ No | |

## Merging and rewriting

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Merge | Merge a branch into the checked-out one | `git merge` | Core | ❌ No | |
| Squash merge | Merge a branch as one commit | `git merge --squash` | Advanced | ❌ No | |
| Rebase | Move commits onto another base | `git rebase` | Common | ❌ No | |
| Interactive rebase | Reorder, squash, edit, reword or drop commits | `git rebase -i` | Common | ❌ No | |
| Cherry-pick | Copy commits onto the checked-out branch | `git cherry-pick` | Common | ❌ No | |
| Revert | Make a commit that undoes another | `git revert` | Common | ❌ No | |
| Reset | Move the branch to a commit, softly, mixed or hard | `git reset` | Common | ❌ No | |
| Reword | Change the message of an older commit | `git rebase -i` | Advanced | ❌ No | |
| Drag and drop | Merge, rebase or cherry-pick by dragging | — | Advanced | ❌ No | |
| Operation in progress | Show a merge, rebase, cherry-pick, revert or bisect under way, and continue, skip or abort it | `--continue`, `--skip`, `--abort` | Common | ❌ No | Pull says when a branch is being rebased or bisected |
| Undo | Undo the last operation | `git reflog`, `git reset` | Advanced | ❌ No | |

## Conflicts

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Conflicted files | List and mark the files in conflict | `git ls-files -u` | Core | 👁 View only | Diffed against our side, not marked as conflicts |
| Ours or theirs | Resolve a file by taking one side | `git checkout --ours`, `--theirs` | Common | ❌ No | |
| Merge editor | Resolve in a three-way editor | — | Common | ❌ No | |
| External merge tool | Resolve in another app | `git mergetool` | Common | ❌ No | |
| Mark resolved | Stage a resolved file | `git add` | Core | ❌ No | |
| Reuse resolutions | Replay resolutions recorded before | `git rerere` | Niche | ❌ No | |

## Stashes

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Stashes | List the stashes | `git stash list` | Core | ✅ Yes | In the graph and the search |
| A stash's changes | Show the files and diff of a stash | `git stash show -p` | Common | ✅ Yes | |
| Stash | Stash the changes, with a message, untracked files or the index kept | `git stash push -m`, `-u`, `-k` | Core | ❌ No | |
| Stash some files | Stash chosen files only | `git stash push -- <path>` | Advanced | ❌ No | |
| Apply or pop | Bring a stash back, keeping or dropping it | `git stash apply`, `pop` | Core | ❌ No | |
| Drop | Delete a stash, or all | `git stash drop`, `clear` | Core | ❌ No | |
| Branch from a stash | Make a branch where a stash was made and apply it | `git stash branch` | Niche | ❌ No | |

## Worktrees

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Worktrees | List a repository's worktrees | `git worktree list` | Advanced | ✅ Yes | A second row of tabs; missing ones marked |
| Switch worktrees | Move between worktrees | — | Advanced | ✅ Yes | Ctrl+PgUp and Ctrl+PgDn |
| Branches in other worktrees | Know where a branch is checked out | — | Advanced | ✅ Yes | Pull says to pull it there |
| Add | Make a worktree | `git worktree add` | Advanced | ❌ No | |
| Remove | Delete a worktree, or prune missing ones | `git worktree remove`, `prune` | Advanced | ❌ No | |
| Lock and move | Lock a worktree, or move it | `git worktree lock`, `move` | Niche | ❌ No | |

## Submodules and large files

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Submodule changes | Show the commits a submodule moved between | `git diff --submodule` | Common | 🟡 Partial | Commit diffs show the old and new hash; the status leaves submodules out |
| Open a submodule | Go into a submodule from its parent | — | Common | ❌ No | |
| Init and update | Clone and check out the submodules | `git submodule update --init --recursive` | Common | ❌ No | |
| Add and remove | Add or remove a submodule | `git submodule add`, `git rm` | Advanced | ❌ No | |
| Subtrees | Merge and split subtrees | `git subtree` | Niche | ❌ No | |
| Git LFS | Show, fetch and lock LFS files | `git lfs` | Common | ❌ No | |

## More git

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Bisect | Find the commit that brought a bug in | `git bisect` | Advanced | ❌ No | |
| Patches | Make patches, and apply them | `git format-patch`, `git am`, `git apply` | Advanced | ❌ No | |
| Sparse checkout | Check out some folders only | `git sparse-checkout` | Niche | ❌ No | |
| Archive | Export a revision as a zip or tarball | `git archive` | Niche | ❌ No | |
| Hooks | List and edit the hooks | — | Niche | ❌ No | |
| Range diff | Compare two versions of a series of commits | `git range-diff` | Niche | ❌ No | |
| Any command | Run a git command from the app | — | Advanced | ❌ No | |
| Command log | Show the git commands the app ran and what they printed | — | Common | ❌ No | |

## Hosting

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Accounts | Sign in to GitHub, GitLab, Bitbucket or Azure DevOps | — | Common | ❌ No | |
| Clone from an account | Pick a repository of the account to clone | — | Common | ❌ No | |
| Pull requests | List, make, check out and review pull requests | — | Common | ❌ No | |
| Open on the web | Open a commit, branch or file on the host | — | Common | ❌ No | |
| Checks | Show the CI status of commits | — | Advanced | ❌ No | |
| Issues | Link and show issues | — | Advanced | ❌ No | |

## App

| Feature | What it does | Git command | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Keyboard | Work every list, column and popup by keyboard | — | Common | ✅ Yes | F1 lists the shortcuts |
| Command palette | Find any command by typing | — | Advanced | ❌ No | |
| Themes | Light and dark, colors and fonts | — | Common | ✅ Yes | Follows the system; every color and font in the settings |
| Settings | Change the settings | — | Common | 🟡 Partial | JSON files, applied as saved and checked, no settings page |
| Notices | Say what happened, and why something wasn't done | — | Core | ✅ Yes | |
| Updates | Update the app | — | Common | ✅ Yes | Checks on start, every 4 hours and from the menu |
| Screen readers | Name every control to assistive technology | — | Common | 🟡 Partial | Tabs, menus, lists and trees are named |
| Languages | Show the app in other languages | — | Common | 🟡 Partial | English only, every sentence in one dictionary |
| Identities | Commit as different people per repository or folder | — | Advanced | ❌ No | |
| AI | Explain changes, draft messages, resolve conflicts | — | Advanced | ❌ No | |
