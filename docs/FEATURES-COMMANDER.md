# FEATURES-COMMANDER

<!-- prettier-ignore-start -->

- What a file manager can do, and how much of it Fastforward's commander does

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what Total Commander, Double Commander, Far Manager, Midnight Commander, Directory Opus, XYplorer, ForkLift, Explorer and Finder offer: Core is in nearly every file manager, Common in most, Advanced in a few, Niche in one or two, if any

- The key is the one Total Commander uses for the feature, as most two-pane file managers follow it; where Fastforward uses another, the notes say so

## Folders

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Two sides | List a folder on each of two sides | — | Common | ✅ Yes | The left starts at the root of the system drive, or `/`, the right at the folder the tab was opened with; the divider dragged between them, a double click halving them again |
| Switch sides | Move between the sides | Tab | Common | ✅ Yes | Tab and Shift+Tab |
| Open a folder | Go into a folder | Enter | Core | ✅ Yes | Enter or a double click; a link to a folder that can't be listed opens where it points |
| Parent folder | Go up a folder | Backspace | Core | ✅ Yes | Backspace, or `..` atop the list |
| Back and forward | Retrace the folders a side went through | Alt+Left, Alt+Right | Core | ✅ Yes | Alt+Left and Alt+Right, the mouse buttons and the buttons of the side, up to 100 folders per side |
| Drives | Choose the drive of a side | Alt+F1, Alt+F2 | Common | ✅ Yes | From the drive menu of each side, its letter pressed to choose it; on Windows only |
| Open on the other side | Open the selected folder, or the one shown, on the other side | Ctrl+Left, Ctrl+Right | Common | ✅ Yes | Mod+Left and Mod+Right, the folder shown for .., as its menu has it, going into a file selected when 7-Zip opens it as an archive, and saying why when 7-Zip finds an archive in it it can't open |
| Swap the sides | Exchange the folders of the two sides | Ctrl+U | Common | ❌ No |  |
| Type a path | Go to a folder by typing or pasting its path | — | Core | ❌ No | The path atop each side is shown only |
| Breadcrumbs | Go to a folder of the path by clicking it | — | Common | ❌ No |  |
| Folder tree | Show the folders as a tree | Ctrl+F8 | Common | ❌ No |  |
| Folder tabs | Keep several folders open on a side in tabs | Ctrl+T | Common | 🟡 Partial | Commander tabs among the app's tabs, each with both sides, the layout of each kept while the app runs; none per side |
| Bookmarks | Keep folders at hand to go to | Ctrl+D | Common | ✅ Yes | The star of each side, filled while its folder is bookmarked, or Ctrl+D: adds or removes the folder of the side, and lists the bookmarks sorted, keyed 1 to 9 and A to Z, removed with their X or Delete; kept in `tools.commander.bookmarks` of the user settings, shared by both sides and every tab |
| Recent folders | Go back to a folder visited before | — | Common | ❌ No | Back and forward keep only the folders of each side while the app runs |
| Outside changes | Refresh a folder when something changes it | — | Core | ✅ Yes | Watches the folders shown; a folder deleted meanwhile gives way to the nearest folder still there |
| Reread | Read the folder again | Ctrl+R | Core | ✅ Yes | F2 and Ctrl+R |
| Restore after a restart | Open each side where it was once the app starts again | — | Common | ✅ Yes | The tabs come back, each side at the folder it last listed without reading as administrator, or the nearest folder still there; a side that never moved at the folder the tab was opened with, the right, or the root; not their back and forward, filter or the side active |
| Folders of an administrator | Read folders only an administrator may open | — | Advanced | ✅ Yes | After asking, through a helper running elevated, a shield marking the side; on Windows only |

## Listing

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Details | List the name, extension, size and date of each file | Ctrl+F2 | Core | ✅ Yes | Mod+1; the names of folders in brackets, as Total Commander shows them; the widths of Ext, Size and Date dragged and saved, a double click resetting one; dates in the `dateFormat` of the settings |
| Thumbnails | Show the files as tiles of their thumbnails | Ctrl+Shift+F1 | Common | ✅ Yes | Mod+2, per side; images drawn as thumbnails, kept on disk in the cache folder of the system, up to `tools.commander.thumbnailCacheMegabytes`; inside an archive too, from copies 7-Zip takes out of it together and removed once read, an encrypted image only once the password of the archive is given; none made of files kept online only, as OneDrive's or Google Drive's, nor of the images of an archive kept online only |
| Icons | Show the icon of each file | — | Core | ✅ Yes | The system's icon of each file, the generic one until it comes, folders as a muted outline |
| Sort | Sort by name, extension, size or date, and reverse | Ctrl+F3 to Ctrl+F6 | Core | ✅ Yes | By clicking a column's header, per side, folders first, saved; by extension by default; folders by size too once counted, those not counted as if empty; no keys |
| Hidden files | Show or hide hidden and system files | — | Core | ✅ Yes | Ctrl+H, shown by default and dimmed, saved; on Windows by their attribute, elsewhere by a leading dot |
| File colors | Color files by their extension | — | Advanced | ✅ Yes | Color groups in the settings, the files whose language the viewer knows yellow by default; on macOS and Linux, the files whose exec bit lets them run and that no other group claims green as the programs, and the apps of macOS, folders named `.app`, too; a notice when an extension is in two groups |
| Group by color | Gather the files of each color together | — | Niche | ✅ Yes | Ctrl+G, in the order of the color groups, on by default |
| Filter | Show only the files whose names match what is typed | — | Common | ✅ Yes | Mod+F, or Alt and a letter, by every word anywhere in the name, counting what is left; kept for each side of a tab, through a file viewed or another tool shown, until the side shows another folder; Escape clears it |
| Quick search | Jump to a file by typing the start of its name | — | Common | 🟡 Partial | Alt and a letter starts the filter rather than jumping |
| Folder sizes | Count the size of folders | Space, Alt+Shift+Enter | Common | ✅ Yes | Space on a folder it marks, and Alt+Shift+Enter for every folder the side shows not counted yet, in four worker threads walking the folders with the calls the side lists them with, going into no link; on a side read as administrator through the helper, a folder at a time, and elsewhere the folders only an administrator may read counted as unread; shown as counted, dimmed until done, a line under the side saying how many are counted and that Esc stops it, forgetting those not done; a tooltip saying how many folders under one couldn't be read; kept while the folder changes, until the side shows another folder or reads it again with F2 or Ctrl+R; inside an archive shown at once, from what 7-Zip lists; no Ctrl+L for the total of the marked items |
| Flat view | List the files of every subfolder together | Ctrl+B | Advanced | ✅ Yes | Ctrl+B or the button of the side, the path ending in `**`: the files of every folder under the side, without the folders, shown as they are read, with no limit; the line under the side counts the files and folders read and those that couldn't be, and names the folder of the file selected; Esc stops the reading, keeping what was read; sorted by the column of the side, files of one name together, and filtered by their names alone; follows changes on Windows and macOS, and is read again with F2 or Ctrl+R; ends once the side shows another folder; the menu of Windows for the files of one folder at a time; inside an archive too, from what 7-Zip lists, following changes to the archive, its files read, copied and opened without their folders |
| Large folders | List folders of many thousands of files quickly | — | Core | ✅ Yes | On Windows read a page of entries at a time off the main thread with `NtQueryDirectoryFile`, which also reads the size of files the system holds open; only the rows in view drawn |
| Links | Show links and where they lead | — | Common | 🟡 Partial | Listed with the size and date of what they point to, and followed when opened; not marked as links |
| Repositories | Mark the folders that are git repositories | — | Niche | ✅ Yes | The git icon in the Ext column, opening it in a git tab on a click |

## Marking

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Mark files | Mark files to act on them together | Space, Insert | Core | ✅ Yes | Space and Insert mark and move down, Space counting the size of a folder it marks, Shift and the arrow keys mark what they pass, Mod+click marks one, Shift+click those up to it |
| Mark all | Mark every file | Ctrl+A | Core | ✅ Yes | Mod+A: the files and folders the side shows, only those the filter leaves, the files read so far in flat view, inside an archive too; once all are marked, it unmarks them all |
| Mark by pattern | Mark or unmark the files that match a pattern | Num+, Num− | Common | ❌ No |  |
| Invert marks | Mark the files not marked | Num* | Common | ❌ No |  |

## Files

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Open a file | Open a file in its app | Enter | Core | ✅ Yes | Enter or a double click |
| Copy | Copy files to the other side | F5 | Core | ✅ Yes | The marked items, or the selected one, into the folder of the other side, asking first; for each file there already, overwrite it, a read-only one too, the question saying so, skip it or keep both under a free name, for the rest too, folders of one name merged; dates kept, links copied as links, files cloned where the drive can; in a process of its own, its progress in a dialog with Stop, going on in the background once the dialog is closed and saying when done; in flat view the files all into the one folder; out of an archive too, taken out by 7-Zip first, and into one, 7-Zip writing it anew, after one question about the items there already; not yet in a folder read as administrator |
| Move | Move files to the other side | F6 | Core | ✅ Yes | As Copy; renamed on the same drive, whole folders at once, and across drives copied and deleted file by file, each original only once its copy is made; out of an archive too, deleted from it once moved |
| Rename | Rename a file in place | Shift+F6 | Core | ✅ Yes | The file or folder selected, in a dialog rather than in place, the name before its extension selected, saying what is wrong with a name as it is typed, as F7 does; a name of another item refused rather than replaced, a change of case alone allowed; selected once renamed; in flat view in its own folder; inside an archive too, 7-Zip writing it anew in the dialog of copies, a name the folder of the archive has refused; not yet in a folder read as administrator |
| New folder | Make a folder | F7 | Core | ✅ Yes | In the folder of the side, named in a dialog that says what is wrong with a name as it is typed, one the side lists already or one Windows refuses, and selected once made; one folder, not a path of them; inside an archive too, 7-Zip writing it anew in the dialog of copies; not yet in a folder read as administrator |
| New file | Make an empty file | Shift+F4 | Common | ❌ No |  |
| Delete | Move files to the Recycle Bin or Trash, or delete them | F8, Delete | Core | ✅ Yes | F8 and Delete to the Recycle Bin or Trash, Shift+F8 and Shift+Delete permanently, asking first; F8 and Delete permanently too on a drive whose Recycle Bin is turned off, by its setting or a policy, the question saying so, and inside an archive, from the archive; not yet in a folder read as administrator |
| Clipboard | Cut, copy and paste files | Ctrl+X, Ctrl+C, Ctrl+V | Core | 🟡 Partial | Mod+C puts the marked items, or the selected one, on the clipboard as files, which file managers, chat apps and browsers paste; Mod+V copies the files on the clipboard into the folder of the side, those cut in another app too, leaving them where they are; no cut |
| Drag and drop | Drag files between the sides and other apps | — | Core | ✅ Yes | Out to other apps and the other side as files of the system, the marked ones when a marked one is dragged, the one dragged alone otherwise; files dropped on a side, from it or another app, go into the folder dropped on or that of the side, copied or moved as the menu shown at the pointer is answered; another app dropped into copies, as Electron offers it no move, and is told a drop was copied, so it never deletes what was moved |
| Context menu | Show the system's menu for files | Shift+F10 | Common | ✅ Yes | A menu of the app on a right click, Shift+F10 or the Menu key, for the marked items, the one clicked or selected, or the folder shown on .. or the empty space: New by the terminal icon, then by the git icon Open for a folder in a repository, or Clone... and Init for a folder in none, and Edit Image for an image, which does nothing yet, and Open with 7-Zip... for a file; none inside an archive; ... last opens the menu of Windows, which Shift and a right click open straight away, extended, on Windows only |
| Properties | Show the properties of a file | Alt+Enter | Common | 🟡 Partial | From the menu of Windows |
| Copy names and paths | Put the names or paths of files on the clipboard | — | Common | ❌ No |  |
| Attributes | Change the attributes, permissions or dates of files | — | Common | ❌ No |  |
| Multi-rename | Rename many files by a pattern | Ctrl+M | Advanced | ❌ No |  |
| Undo | Undo the last operation on files | — | Advanced | ❌ No |  |

## Viewing

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| View a file | Show a file without its app | F3 | Common | ✅ Yes | In a viewer tab of its own, named and iconed after the file, keeping the text, hex or preview, the encoding, the language chosen and where it was in the file while it is open; Escape closes it |
| Quick view | Show the selected file on the other side as it is selected | Ctrl+Q | Common | ❌ No |  |
| Text | Show a file as text, of any size | — | Core | ✅ Yes | Read by byte position a screen at a time, so a gigabyte opens as fast as a kilobyte, each line of up to 64 KiB whole, as the diff shows it, a longer one in rows of 4 KiB; 2 |
| Hex | Show a file as bytes | — | Common | ✅ Yes | 1: its offset, 16 bytes a row and their printable characters |
| Encodings | Read a text in its encoding | — | Common | ✅ Yes | E: Auto, from a byte order mark or, when not UTF-8, the code page of the system; UTF-16, the Windows, ISO-8859, KOI8, DOS 866 and Mac encodings, or the bytes |
| Syntax highlighting | Color the code of a file | — | Advanced | ✅ Yes | `shiki`, with VS Code's TextMate grammars, for files up to 10 MB; L chooses the language, or Plain Text |
| Wrap and whitespace | Wrap long lines, and draw the spaces, tabs and line ends | — | Common | ✅ Yes | W and `.`, wrapping on and whitespace off by default, as in the diff |
| Find in the file | Search the text of a file | F7 | Common | ✅ Yes | Mod+F, through the whole file in its encoding, counting the matches and marking them in the text, the bytes and the hex |
| Images | Preview images | — | Common | ✅ Yes | 3: fitted, or at their real size with F, an SVG drawn among them |
| Markdown | Preview Markdown rendered | — | Advanced | ✅ Yes | 3: `markdown-it`, its code colored, its diagrams drawn and its images next to it shown |
| PDF | Preview PDFs | — | Common | ✅ Yes | 3: `pdfjs-dist`, read by ranges, searched with Mod+F, zoomed with Mod and the wheel, opened again where it was left; none locked with a password |
| Media | Play audio and video | — | Common | ❌ No |  |
| Other documents | Preview office documents and others | — | Advanced | ❌ No |  |
| Edit | Edit a file | F4 | Core | ❌ No |  |
| Compare files | Diff two files | — | Common | ✅ Yes | Shift+F3, the two files marked on a side or the file of each side, in a git tab of their own that follows their changes, two images side by side; a notice says how to pick them when none are |

## Archives

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Browse an archive | Go into an archive as into a folder | Ctrl+PgDn | Common | ✅ Yes | Open with 7-Zip... in the menu of a file or Shift+Enter on it, or Mod+Left and Mod+Right to open it on a side, through the 7-Zip shipped with the app; whatever 7-Zip opens, zips and the packages made of them, 7z, rar, tars, disk images and installers alike, a set of volumes from its first; its folders listed as those of a folder, the archive in the path in its color, .. leaving it with the archive selected; a line under the side saying it is read while that takes a while, Esc stopping it; says why it opens none, Mod+Left and Mod+Right only when 7-Zip finds an archive it can't open, as a damaged one; Enter opens an archive in its app as before |
| Follow changes | List an archive again once it changes | — | Advanced | ✅ Yes | Watched while a side is inside it, staying there while the app changes it; the side back inside it after a restart |
| Archives in archives | Go into an archive inside another | — | Advanced | ✅ Yes | From a copy taken out of the outer one; a compressed tar shows the files of its tar |
| Flat view | List every file of an archive together | Ctrl+B | Advanced | ✅ Yes | From what 7-Zip lists, following changes to the archive; its files read, copied and opened without their folders |
| Use its files | View, open, compare and preview the files of an archive | F3 | Common | ✅ Yes | From copies 7-Zip takes out, keeping the Mark of the Web on Windows: viewed on F3, the viewer tab kept after a restart, opened on Enter, compared on Shift+F3, shown in thumbnails, and put on the clipboard with Mod+C, folders whole; Markdown previewed without the images next to it |
| Edit and update | Put a file changed outside the app back into its archive | F4 | Common | ✅ Yes | Enter opens a copy that can be changed; once it is saved, a question asked while the commander is shown, again each time it is saved, puts it back in the dialog of copies; read-only out of an archive that can't be changed, so a change saved to it is not lost unnoticed |
| Copy out | Copy items out of an archive | F5 | Common | ✅ Yes | Into the folder of the other side, folders whole, 7-Zip taking them out first in the progress of the copy, which Stop ends, asking about the files there already as any copy does |
| Unpack | Unpack whole archives into a folder | Alt+F9 | Common | 🟡 Partial | No command of its own; marking every item inside and F5 does it, an archive at a time |
| Move out | Move items out of an archive, deleting them from it | F6 | Advanced | ✅ Yes | As Copy out, then deleted from the archive, in the dialog of the move; kept in it: what was skipped or failed to move, what 7-Zip took out under another name or not at all, as files of one name from two folders listed flat, saying so, and everything once stopped |
| Copy and move in | Add items to an archive | F5, F6 | Common | ✅ Yes | From a side on disk, or another archive as Archive to archive says, into the folder of the archive shown, asking once about the items there already to replace or skip them all, folders merged; each original of a move deleted only once 7-Zip packed every file |
| Delete inside | Delete items from an archive | F8, Delete | Common | ✅ Yes | Permanently, after asking |
| Rename inside | Rename an item of an archive | Shift+F6 | Advanced | ✅ Yes | In the dialog of Rename, a name the folder of the archive has refused |
| New folder inside | Make a folder in an archive | F7 | Advanced | ✅ Yes | In the dialog of New folder |
| How changes are written | Change an archive safely | — | Common | ✅ Yes | 7-Zip writes it anew in the dialog of copies with Stop, which leaves it as it was; the password given once; an archive no longer there is not made anew |
| Change nested archives | Change an archive inside another, or the tar of a compressed tar | — | Advanced | ❌ No | Refused, saying so; an archive cut into volumes is refused too, as 7-Zip cannot change one |
| Pack | Pack items into a new archive | Alt+F5 | Common | ✅ Yes | The marked items or the selected one, into the folder of the other side, or of its own while the other is in an archive, the path typed in monospace; zip, 7z, tar, tar.gz or tar.xz, from Store to Ultra; written under a name of its own, tested against the checksum of every file unless that is unchecked, and put in place of an archive there only once done, in the dialog of copies with Stop, which leaves nothing; the format, compression, cipher and size of volumes remembered while the app runs |
| Encrypted archives | Open and pack archives with a password | — | Common | ✅ Yes | The password of an archive whose names or files are encrypted asked for once they are read, again while it is wrong, remembered while the app runs, and given to 7-Zip on its input rather than its command line; packs a zip with AES-256 or ZipCrypto, its password of English characters alone, and a 7z with its names encrypted too |
| Volumes | Cut an archive into parts of a size | — | Advanced | ✅ Yes | A size typed or chosen as it is packed; a set read from its first part |
| Test | Check archives against the checksum of every file | Alt+Shift+F9 | Advanced | ✅ Yes | The marked archives one after another, the password of an encrypted one asked for, in the dialog of copies with Stop, saying once done which failed and why or that they passed; each archive packed tested too, unless that is unchecked |
| Drag out | Drag items out of an archive to other apps | — | Common | ❌ No |  |
| Archive to archive | Copy or move items from one archive into another | F5, F6 | Advanced | ✅ Yes | Into the folder of the archive shown on the other side, of another archive or of the same one, 7-Zip taking them out of the one and adding them to the other in the dialog of copies, asking once about the items there already to replace or skip them all; those of a move deleted from the first only once all were added; files of one name listed flat refused, as only one of them could go; out of an archive inside another copied but not moved |
| Names in code pages | Read the names a zip keeps in a code page, not UTF-8 | — | Advanced | 🟡 Partial | On Windows, as 7-Zip reads them; not on macOS and Linux |
| Self-extracting archives | Pack an archive that unpacks itself | — | Niche | ❌ No |  |

## More

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Search files | Find files by name or content in the subfolders | Alt+F7 | Core | ❌ No |  |
| Compare folders | Mark the files that differ between the two sides | Shift+F2 | Common | ❌ No |  |
| Synchronize folders | Make two folders the same | — | Advanced | ❌ No |  |
| Remote file systems | Browse FTP, SFTP, WebDAV and cloud storage | Ctrl+F | Common | ❌ No |  |
| Cloud files | Show which files are kept online only | — | Common | 🟡 Partial | No thumbnail is made of them, which would download them; not marked |
| Command line | Run commands in the folder shown | — | Common | 🟡 Partial | Mod+Shift+O opens the folder of the side in the terminal, or in a git tab when it is in a repository; New by the terminal icon in the menu of a folder |
| Plugins | Add file systems, viewers and packers | — | Advanced | ❌ No |  |
| Platforms | Run on Windows, macOS and Linux | — | Common | ✅ Yes | The drives, the menu of Windows and reading as administrator on Windows only |

<!-- prettier-ignore-end -->
