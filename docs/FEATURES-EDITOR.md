# FEATURES-EDITOR

<!-- prettier-ignore-start -->

- What a text editor can do, and how much of it Fastforward's editor does

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what VS Code, Sublime Text, Notepad++, Vim and the editor of Total Commander offer: Core is in nearly every editor, Common in most, Advanced in a few, Niche in one or two, if any

- The key is the one VS Code uses for the feature on Windows, as most editors follow it; where Fastforward uses another, the notes say so

- What the editor shares with the viewer and the diff, how a text is drawn, whitespace, invisible characters, wrapping, scrolling, selecting and the toggles of a find, and with every tool, the tabs and windows, the keyboard, the menus, the lists, the look and the settings of the app, [FEATURES](FEATURES.md) says

## Files

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Edit a file | Open a file to edit it | — | Core | ✅ Yes | F4 in the commander, or Open with Editor in the menu of a file, in the commander or on a part of a path anywhere, in an editor tab of its own named after the file, with the icon of the editor; F4 on a file open in one goes to that tab, in whichever window it is; Escape closes it, as it closes the viewer, once Escape has no extra cursor or selection left to drop, asking first about unsaved changes |
| New file | Edit a file not there yet | Ctrl+N | Core | ✅ Yes | Shift+F4 in the commander names it in a dialog that says what is wrong with a name as it is typed; made only once saved, a file of that name opened as it is |
| Save | Write the file | Ctrl+S | Core | ✅ Yes | Through a file of its own beside it that replaces it once whole, through ReplaceFile on Windows so its attributes, streams and Mark of the Web stay, keeping its mode elsewhere; in place for a file of several names, one of another user or in a folder that lets no file be made, refused where its drive has no room for the whole of it, leaving it as it was; a link written through to its target |
| Unsaved changes | Mark a file changed and ask before dropping its changes | — | Core | ✅ Yes | A star right after its name, on its tab and in its path; closing the tab asks Save, Don't Save or Cancel, and closing its window or quitting asks the same for every file changed, naming each, saving them in the main process |
| Read-only files | Ask before writing a file that is read-only | — | Common | ✅ Yes | Asks before saving over one, and keeps it read-only; the default settings open read-only, showing their encodings and line ending, the encoding to read in to be chosen, as reading the file again writes nothing, the encoding to write in and the line ending disabled |
| Outside changes | Follow a file changed on disk | — | Common | ✅ Yes | Read again where it has no changes in the editor, the cursor and the place scrolled to kept, while its tab is away too; where it has, kept, saying so, once its tab is shown again when it was away, saving asking whether to save over it or read it again, the question kept with its tab until answered; its own save never taken for one, and a change another program makes right after a save never taken for its own save, as the file saved is known by the bytes written; one save of a file at a time, a save asked for while one runs waiting for it; told by the bytes of the file rather than its size and dates, so a change that leaves them as they were is seen, on a FAT drive or a share too, and a file only touched is not taken for one |
| Restore after a restart | Open the files edited again once the app starts | — | Common | 🟡 Partial | Their tabs come back, read again from disk, with the find and replace of each, as the view of a tab is saved with it; unsaved changes are not kept, as closing asks |
| Survive a reload | Keep the text and its undo while the page reloads | — | Niche | ✅ Yes | The text lives in the main process, so saving the settings, which reloads the page, and moving a tab to another window keep it, its undo, its selection and the place it was scrolled to, as showing its tab again does, which keeps its find and replace too, open with their text and the match it was at, the box the focus was in with its caret, and how far it was scrolled sideways, a file opened at a line from the viewer at that line; the find and replace and the focus of a tab are kept by the main process too, so a reload or a move brings them back alike; a tab shown again draws its text colored as it was at once, while its colors are worked out anew |
| Large files | Open files of many megabytes | — | Common | 🟡 Partial | Up to 50 MB, the whole text in memory; a larger one, a file of binary data and a folder are refused, saying why, F3 viewing them |
| Settings files | Edit the settings of the app | — | Advanced | ✅ Yes | The two settings items of the app menu open the user settings and, read-only, the defaults; problems are told in notices as the settings are saved, not on their lines |
| Files in archives | Edit a file inside an archive and put it back | — | Advanced | ✅ Yes | F4 edits a copy 7-Zip takes out, kept with the copies of viewed files, each save putting it back in the dialog of copies without asking; Shift+F4 starts a new one, added on its first save; read-only from an archive that can't be changed, as one inside another, and once the app starts again |
| Files read as administrator | Edit a file in a folder only an administrator may read | — | Advanced | ❌ No | Refused, saying so |
| From the viewer | Switch a file viewed to editing it | — | Common | ✅ Yes | F4 in a viewer tab opens its file in an editor tab of its own, the cursor on the line at the top of the viewer, read in the encoding chosen there, or goes to the tab editing it already, as it was, the viewer staying open; a copy taken out of an archive or a commit to view it, or a version of git, refused, saying so |
| To the viewer | Switch a file edited to viewing it | — | Niche | ✅ Yes | F3 opens the file as it is on disk in a viewer tab of its own, at the line at the top of the editor, read in the encoding the file has on disk, or goes to the tab viewing it already, as it was, the editor and its unsaved changes staying open; a new file not saved yet refused, saying so |
| Compare versions | Diff the file with the versions git keeps of it | — | Advanced | ✅ Yes | Shift+F3, as the viewer and the commander compare on it, opens the file as saved against its versions in a diff tab; FEATURES-DIFF says what it compares |

## Text and encodings

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Byte for byte | Change no byte that was not edited | — | Advanced | ✅ Yes | The byte order mark, the line ending of each line and every byte the encoding cannot decode are kept as marks that move with the edits, and written back as they were read |
| Encodings | Read and write the encodings of the viewer | — | Common | ✅ Yes | Read and written as [FEATURES](FEATURES.md#common-text) says |
| Reopen in an encoding | Read the bytes again in another encoding | — | Common | ✅ Yes | From the encoding button above the text marked (read), which lists them as the viewer does, Auto naming the one it read the file in, the one chosen checked; asks first while it has changes, the question kept with its tab until answered |
| Save in an encoding | Write the text in another encoding | — | Common | ✅ Yes | From the encoding button marked (write) beside it, which lists them alike, UTF-8 with a byte order mark too, Auto first, saving it as it is on disk, with or without its byte order mark, the one it saves in checked, the two buttons saying the encoding it has on disk and the one it saves in, the file taken as read in the one it was saved in; the (read) one disabled for a new file, Auto naming the encoding its .editorconfig or the settings give it; refused, naming them, while the text has characters the encoding has no byte for |
| Bytes it cannot decode | Keep bytes that are not text of the encoding | — | Niche | 🟡 Partial | Kept and written back as they were, in the encoding they were read in alone, saving in another refused, saying so; drawn as a replacement character rather than a box with their value |
| Binary files | Edit a file of binary data | — | Niche | ❌ No | Refused; F3 views it as hex |

## Line endings

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Keep the line endings | Write every line with the ending it was read with | — | Advanced | ✅ Yes | New lines and pasted ones end in the ending most of the file has, the first on a tie |
| Show the line ending | Say whether the file ends its lines in LF, CRLF or CR | — | Common | ✅ Yes | On a button above the text, Mixed while its lines end in more than one, its tooltip counting them |
| Convert | End every line in LF or CRLF | — | Common | ✅ Yes | From that button, Convert all line endings to LF or CRLF, as an edit Ctrl+Z undoes, the one that would change no line break dimmed; none to CR |
| Line ending of a new file | End the lines of a new file as its project does | — | Advanced | ✅ Yes | A new file, or one with no line break yet, as its .editorconfig says, else as git would check it out by its attributes and config, else as the editor settings say for its extension, CRLF for .bat and .cmd, and then for every file, LF |
| Where it comes from | Show where the line ending of new lines, the encoding, the indentation and the width of a tab come from | — | Niche | ✅ Yes | Their menus list every place they may come from, in the order each overrides the next, under a heading saying the first one applies, the one used checked and those that set nothing dimmed and struck through: for new lines the lines of the file, and apart, for a file with no line break yet, `end_of_line` of the .editorconfig, the `eol` attribute, `core.autocrlf` and `core.eol` of git, and the settings for the extension and for every file; for the encoding the one chosen in its menu, the byte order mark, bytes that look like UTF-16, bytes that are UTF-8 and the code page of the system, or for a new file `charset` of the .editorconfig and the settings; for the indentation a conversion made, `indent_style` and `indent_size` of the .editorconfig, the lines of the file and `tools.editor.indentStyle` and `indentSize` of the settings, and for the width of a tab as the viewer lists it; a row opens the .editorconfig or the settings it comes from |

## Editing

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Type and delete | Type text, and delete the character or the word beside the cursor | Backspace, Delete, Ctrl+Backspace, Ctrl+Delete | Core | ✅ Yes | Taken by the editor itself through the EditContext of the browser, as its text is in no element of the page; at every cursor, a word with the blanks before it; Backspace an accent alone, Delete a character with its accents |
| Input methods | Compose text with an input method | — | Core | ✅ Yes | What is composed drawn as it is typed, each step in place of the one before, the window of the input method told where the cursor stands on the grid; the underline of the part composed not drawn |
| Clipboard | Cut, copy and paste | Ctrl+X, Ctrl+C, Ctrl+V | Core | ✅ Yes | What every cursor selects, a line each; the whole line of a cursor that selects nothing, pasted above the line of the cursor; a text of as many lines as there are cursors a line at each; no dragging of the text selected |
| Undo and redo | Take back and redo changes | Ctrl+Z, Ctrl+Y | Core | ✅ Yes | Ctrl+Shift+Z redoes too |
| Indent | Indent and outdent lines | Tab, Shift+Tab | Core | ✅ Yes | By the indentation the file uses, its .editorconfig over what it shows, the editor settings where neither says, the button of the indentation saying which, as Spaces: 2 or Tab Size: 4; Ctrl+M then Tab moves the focus on |
| Convert indentation | Turn the indentation of every line into tabs or into spaces | — | Common | ✅ Yes | From the button of the indentation, by the tab stops, as an edit Ctrl+Z undoes, Tab and Enter indenting so from then on |
| Keep the indentation | Start a new line as indented as the one before | Enter | Core | ✅ Yes |  |
| Comment lines | Comment lines out and back in | Ctrl+/ | Common | ✅ Yes | Ctrl+K, by the markers of the language of the file, a block comment where a language has no line comments |
| Move lines | Move the lines selected up or down | Alt+Up, Alt+Down | Common | ✅ Yes |  |
| Duplicate and delete lines | Copy or delete the lines selected | Shift+Alt+Down, Ctrl+Shift+K | Common | ❌ No |  |
| Close brackets | Type the closing bracket or quote with the opening one | — | Common | ✅ Yes | Off by default, `tools.editor.closeBrackets` in the settings, by CodeMirror: a closing bracket typed over, and Backspace between a pair deleting both |
| Trim trailing whitespace | Drop the spaces at the ends of lines as saved | — | Common | 🟡 Partial | Where `trim_trailing_whitespace` of the .editorconfig says so, on Ctrl+S, of the lines edited since saved alone, as an edit Ctrl+Z undoes; not as a tab is closed or the app quits with Save, nor by a setting of the app |
| Final newline | End the file with a line break as saved | — | Common | 🟡 Partial | Where `insert_final_newline` of the .editorconfig says so, on Ctrl+S, once its last line was edited since saved, in the line ending of the file; not as a tab is closed or the app quits with Save, nor by a setting of the app |
| Autocompletion | Suggest words and names as typed | Ctrl+Space | Common | ❌ No |  |

## Cursors and selections

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Characters and words | Move the cursor a character or a word left or right, or to the start of the row | Left, Right, Ctrl+Left, Ctrl+Right, Home | Core | ✅ Yes | Moved by the editor rather than by the caret of the browser, which stood still beside the places a wrapped line may break, as right before an opening bracket; a word a run of letters and digits or of other characters, after the spaces before it, a character with its accents one step; Home to the start of the row of a wrapped line; selecting with Shift; not Alt+Left, Alt+Right, Cmd+Left and Cmd+Right of macOS |
| Rows and pages | Move the cursor up or down a row or a page, or to either end of the file | Up, Down, PgUp, PgDn, Ctrl+Home, Ctrl+End | Core | ✅ Yes | Moved by the editor rather than by the caret of the browser, which knows only the lines drawn: a page as many rows up as down, a row less than the view shows, the cursor staying on the row of the view it was on, and Ctrl+End reaching the last line of the file; selecting with Shift; the view gliding after it with `scrolling.smooth`, as the lists glide on their keys; not Cmd+Up and Cmd+Down of macOS |
| Several cursors | Type at several places at once | Alt+click | Common | ✅ Yes | Alt+click adds one, Escape leaves one; typing, Backspace and Delete act at every one |
| Select all | Select the whole text | Ctrl+A | Core | ✅ Yes |  |
| Cursors above and below | Add a cursor on the line above or below | Ctrl+Alt+Up, Ctrl+Alt+Down | Common | ✅ Yes |  |
| Next occurrence | Select the next occurrence of the selection too | Ctrl+D | Common | ✅ Yes | The word at the cursor first, as the W of a find takes a word, then each next copy of it that is a whole word in its case; from a text selected otherwise, each next copy of it in its case, inside longer words too; going round to the start, each a selection with a cursor of its own, as the marks of the occurrences show them |
| Column selection | Select a column, a cursor on each line | Shift+Alt+drag | Common | ✅ Yes |  |
| End of a wrapped row | Go to the end of the row rather than the line | End | Common | ✅ Yes | Past the spaces hanging at the end of the row, the cursor drawn while in them on the column kept past the row for a blank hanging there, where the viewer and the diff mark it |
| Go to a line | Go to a line by its number | Ctrl+G | Common | ✅ Yes | The prompt kept open with its tab, with the line typed and its caret, as the tab is shown again, reloaded or moved |
| Bracket matching | Mark the bracket matching the one at the cursor | — | Common | ✅ Yes | Round, square and curly brackets, by CodeMirror, both of a pair marked as the editor marks the occurrences, in the yellow and the text color of a find match, at the share of `search-match-implicit` in the theme, over the rows of device pixels the cursor fills, so the cursor on one covers its mark whole; one that matches none left unmarked; brackets in strings and comments counted too, as no grammar tells it where they are |

## Finding

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Find | Find text in the file | Ctrl+F | Core | ✅ Yes | The text selected filled in, every match marked and counted, and on the track of its scrollbar, as the viewer and the diff mark them, the line of each where the thumb comes to stand once the line is at the top, marks closer than two pixels drawn as one; the nearest selected as typed, Enter and Shift+Enter going to the next and previous |
| Case, whole words, regular expressions | Find in its case, as whole words or by a pattern | Alt+C, Alt+W, Alt+R | Common | 🟡 Partial | By toggles of the find bar, the same in every search of the app and matching as they do, no keys |
| Replace | Replace the match or every match | Ctrl+H | Core | ✅ Yes | A regular expression putting its groups in; every match as one change Ctrl+Z undoes |
| Occurrences | Mark the other copies of the word at the cursor or of the text selected | — | Common | ✅ Yes | Every whole word of the word the cursor is in or beside, in its case, as the W of a find takes a word, the word itself too; every other copy of the text selected in its case, inside longer words too, a text on one line, of 200 characters at most, whitespace selected alone too, so a space selected marks the other spaces, selected in one place or in several, and after Ctrl+D only the whole words it steps to; in the yellow and the text color of a find match, the whole of it by default and less by `search-match-implicit` of the theme, as a matched bracket, while the editor has the focus, at once once a selection by the pointer is let go, none while it is held, and a tenth of a second after a cursor or selection moved by a key; only in the lines shown, and none while the find has a text, nor once the text changes until the cursor moves; by text rather than by symbol, as no language server tells the editor its symbols; `text.highlightOccurrences` in the settings; not on the scrollbar |
| Find in files | Find in every file of a folder | Ctrl+Shift+F | Common | ❌ No |  |

## Display

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Look of the app | Draw the text as the diff and the viewer draw it | — | Niche | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says, the editor drawing its text by the engine of the viewer and the diff |
| Syntax highlighting | Color the code | — | Core | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says, colored again as typed only from the line edited to the first whose state is as it was |
| Scrolling | Scroll by whole rows, a few a notch | — | Common | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says, with Shift as many columns sideways |
| Line numbers | Number the lines | — | Core | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says |
| Wrap | Wrap long lines | Alt+Z | Common | ✅ Yes | By the wrap button, as [FEATURES](FEATURES.md#common-text) says |
| Show whitespace | Draw the spaces, tabs and line ends | — | Common | ✅ Yes | By the whitespace button, as [FEATURES](FEATURES.md#common-text) says |
| Control characters | Draw the characters that have no shape of their own | — | Common | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says |
| Invisible characters | Draw the characters that show nothing, take no room or turn text around | — | Advanced | ✅ Yes | As [FEATURES](FEATURES.md#common-text) says |
| Cursor | Draw the cursor as a block, bar or underline, blinking or steady | — | Common | ✅ Yes | By the `cursor` settings, a blinking block by default, or a bar, an underline or an outline as thick as `cursor.width`, as the terminal draws it to the device pixel, in the `cursor` color of the theme, the focus color by default, the character under a block in its `cursor-text` color and its own font; the same without the focus, blinking too; a selection fills the rows of device pixels the cursor fills, as in the text boxes and the terminal |
| Status line | Show the line, column and selection | — | Common | 🟡 Partial | In monospace, the column counted in cells, as drawn, the characters selected as they are seen, by every cursor, and the cursors once there are several; no line number |
| Minimap | Show the whole file in small beside it | — | Common | ❌ No |  |
| Folding | Fold blocks of code away | Ctrl+Shift+[ | Common | ❌ No |  |

## App

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Keyboard | List every key of the editor | — | Common | ✅ Yes | In F1, under Editor; no key binds punctuation, so every key is the same on every layout |
| Settings | Set how new files and indentation are | — | Common | ✅ Yes | The editor section of the settings, `tools.editor`: the line ending, charset and indentation of new files, by extension too, and whether brackets close as typed |
| EditorConfig | Follow the .editorconfig of a project | — | Common | ✅ Yes | `end_of_line` and `charset` for new files, `indent_style`, `indent_size` and `tab_width` for indenting, and `trim_trailing_whitespace` and `insert_final_newline` for the lines edited, never changing the lines not edited |
| Screen readers | Read the text to assistive technology | — | Common | ❌ No | As [FEATURES](FEATURES.md#common-text) says |

<!-- prettier-ignore-end -->
