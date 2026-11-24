# FEATURES-DIFF

<!-- prettier-ignore-start -->

- What a diff can do, and how much of it Fastforward's diff does: the diff git shows in its third column and the tabs of the diff tool comparing two files, drawn by one component

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what WinMerge, Meld, KDiff3, Beyond Compare, Kaleidoscope and the diff editor of VS Code offer: Core is in nearly every diff, Common in most, Advanced in a few, Niche in one or two, if any

- The key is the one Fastforward uses, as diff tools share few; what git diffs, a commit, the working tree or two commits, FEATURES-GIT says

- What the diff shares with the viewer and the editor, how a text is drawn, whitespace, invisible characters, wrapping, scrolling, selecting and the toggles of a find, and with every tool, the tabs and windows, the keyboard, the menus, the lists, the look and the settings of the app, [FEATURES](FEATURES.md) says

## Tabs

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Compare two files | Diff any two files, in a repository or not | Shift+F3 | Advanced | ✅ Yes | Shift+F3 in the commander, or Open with Diff in its menu of a file or of marked items, the two files marked on a side, or the file selected and the one file marked on the other side, never the cursor the other side does not show, in a diff tab of their own that follows their changes, their whole paths above the diff, as the viewer and the editor show the path of their file, a part of a folder both share kept outside the braces, coming back with its find, the match it was on, its scroll and the keyboard as they were left, once shown again, reloaded or moved to another window; files alike, or alike but for whitespace or their encoding, a byte order mark too, say so on the header of their paths; images side by side, as a commit shows them; no Markdown preview |
| Versions of a file | Diff two versions of a file as git keeps them | Shift+F3 | Advanced | ✅ Yes | Shift+F3 or Open with Diff on one file alone in the commander, marked or selected, Open with Diff in the menu of a file in a repository anywhere, and Shift+F3 in the viewer and the editor, the editor comparing the file as saved: the file on disk against the index while it is staged, against its newest commit while it differs from it, and otherwise what its newest commit changed, or the version viewed against the one before it; a notice says when git keeps no earlier version; a button for each side in the header, listing the versions as the viewer does, disabled for a side git keeps no version of, both for files outside git, side by side ending and starting at the line between the sides, inline both in the middle with an arrow between them, a version chosen on the new side moving the old to the one before it while both are versions of one file; saved with the tab, named after the file and its two versions, the tab comparing them already shown again rather than another opened |
| Follow changes | Diff the files again once one changes | — | Common | ✅ Yes | The files are watched while their tab shows |
| Restore after a restart | Open the files compared again once the app starts | — | Common | ✅ Yes | Their tabs come back as tabs of the diff, those git saved before the diff was a tool of its own too |
| Close | Close the files compared | Esc | Core | ✅ Yes | Esc closes the tab |
| Compare folders | Diff two folders, file by file | — | Common | ❌ No | The commander marks no files that differ between its sides |
| Three-way | Compare three files, or two against their base | — | Advanced | ❌ No |  |
| Compare text | Diff text pasted or typed rather than files | — | Advanced | ❌ No |  |

## Showing

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Inline and side by side | Show the two sides in one column or two | — | Core | ✅ Yes | Side by side by default |
| Select and copy | Select code with the pointer and copy it | Mod+C | Core | ✅ Yes | On one side at a time, as [FEATURES](FEATURES.md#common-text) says; the line numbers, the other side and the headers of files left out |
| Changed words | Mark the words that changed within lines | — | Common | ✅ Yes | Pairs changed lines by how alike they are, keeping their order |
| Moved lines | Mark lines moved rather than removed and added | — | Advanced | ❌ No |  |
| Syntax highlighting | Color the code of the diff | L | Common | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says; L chooses another for the one file shown, or Plain Text for every file |
| Context | Show more lines around the changes, or the whole file | — | Common | ✅ Yes | The whole file of the file selected, on one toggle kept for every file and on by default; no expanding a few lines at a time |
| Line wrapping | Wrap long lines | W | Common | ✅ Yes | Off by default; W; as [FEATURES](FEATURES.md#common-text) says |
| Minimap | Mark the changes on a strip beside the diff | — | Advanced | ✅ Yes | On the track of the scrollbar itself rather than a strip of its own, so each mark stands where the thumb comes to it: the changes of what is shown, a file whole or the hunks of every file of a commit, and what a find matches, marks closer than two pixels drawn as one |

## Whitespace and text

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Ignore whitespace | Leave out changes of whitespace alone | — | Common | ✅ Yes | On by default; files with only whitespace changes are named on their header |
| Show whitespace | Draw the spaces, tabs and line ends | . | Advanced | ✅ Yes | On by default; `.`; as [FEATURES](FEATURES.md#common-text) says |
| Control characters | Draw the characters that have no shape of their own | — | Common | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says |
| Invisible characters | Draw the characters that show nothing, take no room or turn text around | — | Advanced | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says |
| Line endings | Show changes of line endings, or ignore them | — | Advanced | ✅ Yes | Carriage returns are drawn with the whitespace, and ignored with it; a carriage return alone ends its line, as [FEATURES](FEATURES.md#common-text) says, though git ends a line at a line feed alone, the lines after it numbered so, in the hunks after it too |
| Encodings | Show files that aren't UTF-8 | — | Advanced | 🟡 Partial | A tab comparing two files reads each as [FEATURES](FEATURES.md#common-text) says, comparing their text, the header naming the encoding of each not read as UTF-8, and the byte order mark of UTF-8, a file of UTF-16 no longer taken for binary; the diffs of git alike, of a commit, the index and the working tree, a file git takes for binary or shows with bytes UTF-8 lacks diffed again from copies of the text of each side in UTF-8, and named on its header, the whole file shown read alike; git turns messages into UTF-8; no encoding chosen in the diff, as the viewer chooses one with E |
| Ignore case | Leave out changes of case alone | — | Advanced | ❌ No |  |

## Moving around

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Next change | Move from change to change | J, K | Common | ✅ Yes | J and K, from the files too |
| Find in the diff | Search the diff's text | Mod+F | Common | ✅ Yes | Mod+F, with the toggles [FEATURES](FEATURES.md#common-text) names |
| Occurrences | Mark the other copies of the text selected | — | Common | ✅ Yes | On both sides, as [FEATURES](FEATURES.md#common-text) says |
| Sideways | Scroll long lines across | ←, →, Shift+Wheel | Common | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says, inline as side by side |

## Not text

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Binary files | Say a file is binary instead of showing a patch | — | Core | ✅ Yes | On its header when both sides are binary, on the line of its side when added or deleted, as what holds for the whole file is said once on its header, renamed or copied without changes, its mode changed or unchanged too, and what holds for one side on that side, where its code starts: an empty file, a symbolic link and its target, no newline at its end |
| Image diff | Show the two sides of an image | — | Common | ✅ Yes | Binary images side by side, inline too, the side an image lacks hatched, with the size in a tooltip; an SVG diffs as text, and is drawn in a viewer tab; no swipe or onion skin |
| Large diffs | Stay responsive on huge changes | — | Common | ✅ Yes | Large files load when asked for; the code is drawn as cells by the GPU with WebGPU, as a file viewed is, a canvas for each side holding the rows in sight and half a screen or more around them, however many rows each line wraps onto, so long lines of prose scroll as code does; the diff saying so where a computer lets the app use no GPU |

## Changing

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Edit | Edit a side within the diff | — | Common | ❌ No | F4 on a file edits it in an editor tab, from the commander |
| Copy a change | Take a change over to the other side | — | Common | ❌ No |  |
| Save a patch | Save the diff as a patch | — | Advanced | ❌ No |  |

<!-- prettier-ignore-end -->
