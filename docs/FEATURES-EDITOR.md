# FEATURES-EDITOR

<!-- prettier-ignore-start -->

- What a text editor can do, and how much of it Fastforward's editor does

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what VS Code, Sublime Text, Notepad++, Vim and the editor of Total Commander offer: Core is in nearly every editor, Common in most, Advanced in a few, Niche in one or two, if any

- The key is the one VS Code uses for the feature on Windows, as most editors follow it; where Fastforward uses another, the notes say so

## Files

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Edit a file | Open a file to edit it | — | Core | ✅ Yes | F4 in the commander, in an editor tab of its own named and iconed after the file; F4 on a file open in one goes to that tab, in whichever window it is |
| New file | Edit a file not there yet | Ctrl+N | Core | ✅ Yes | Shift+F4 in the commander names it in a dialog that says what is wrong with a name as it is typed; made only once saved, a file of that name opened as it is |
| Save | Write the file | Ctrl+S | Core | ✅ Yes | Through a file of its own beside it that replaces it once whole, through ReplaceFile on Windows so its attributes, streams and Mark of the Web stay, keeping its mode elsewhere; in place for a file of several names, one of another user or in a folder that lets no file be made, refused where its drive has no room for the whole of it, leaving it as it was; a link written through to its target |
| Unsaved changes | Mark a file changed and ask before dropping its changes | — | Core | ✅ Yes | A dot on its tab and beside its path; closing the tab asks Save, Don't Save or Cancel, and closing its window or quitting asks the same for every file changed, naming each, saving them in the main process |
| Read-only files | Ask before writing a file that is read-only | — | Common | ✅ Yes | Asks before saving over one, and keeps it read-only; the default settings open read-only |
| Outside changes | Follow a file changed on disk | — | Common | ✅ Yes | Read again where it has no changes in the editor, the cursor kept; where it has, kept, saying so, saving asking whether to save over it or read it again; its own save never taken for one |
| Restore after a restart | Open the files edited again once the app starts | — | Common | 🟡 Partial | Their tabs come back, read again from disk; unsaved changes are not kept, as closing asks |
| Survive a reload | Keep the text and its undo while the page reloads | — | Niche | ✅ Yes | The text lives in the main process, so saving the settings, which reloads the page, and moving a tab to another window keep it, its undo and its selection |
| Large files | Open files of many megabytes | — | Common | 🟡 Partial | Up to 50 MB, the whole text in memory; a larger one, a file of binary data and a folder are refused, saying why, F3 viewing them |
| Settings files | Edit the settings of the app | — | Advanced | ✅ Yes | The two settings items of the app menu open the user settings and, read-only, the defaults; problems are told in notices as the settings are saved, not on their lines |
| Files in archives | Edit a file inside an archive and put it back | — | Advanced | ❌ No | Refused, saying so; Enter opens a copy in its app to change |
| Files read as administrator | Edit a file in a folder only an administrator may read | — | Advanced | ❌ No | Refused, saying so |
| From the viewer | Switch a file viewed to editing it | — | Common | ✅ Yes | F4 in a viewer tab turns it into an editor tab, the cursor on the line at the top of the viewer, read in the encoding chosen there, or goes to the tab editing it already; a copy taken out of an archive or a commit to view it refused, saying so |

## Text and encodings

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Byte for byte | Change no byte that was not edited | — | Advanced | ✅ Yes | The byte order mark, the line ending of each line and every byte the encoding cannot decode are kept as marks that move with the edits, and written back as they were read |
| Encodings | Read and write the encodings of the viewer | — | Common | ✅ Yes | UTF-8, UTF-16 and the code pages of the viewer, found as the viewer finds them, from a byte order mark or, when not UTF-8, the code page of the system |
| Reopen in an encoding | Read the bytes again in another encoding | — | Common | ✅ Yes | From the encoding button above the text, or Auto; asks first while it has changes |
| Save in an encoding | Write the text in another encoding | — | Common | ✅ Yes | From the encoding button, UTF-8 with a byte order mark too, the button saying the encoding it was read in and the one it saves in; refused, naming them, while the text has characters the encoding has no byte for |
| Bytes it cannot decode | Keep bytes that are not text of the encoding | — | Niche | 🟡 Partial | Kept and written back as they were; drawn as a replacement character rather than a box with their value |
| Binary files | Edit a file of binary data | — | Niche | ❌ No | Refused; F3 views it as hex |

## Line endings

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Keep the line endings | Write every line with the ending it was read with | — | Advanced | ✅ Yes | New lines and pasted ones end in the ending most of the file has, the first on a tie |
| Show the line ending | Say whether the file ends its lines in LF, CRLF or CR | — | Common | ✅ Yes | On a button above the text, Mixed while its lines end in more than one, its tooltip counting them |
| Convert | End every line in LF or CRLF | — | Common | ✅ Yes | From that button, as an edit Ctrl+Z undoes |
| Line ending of a new file | End the lines of a new file as its project does | — | Advanced | ✅ Yes | A new file, or one with no line break yet, as its .editorconfig says, else as git would check it out by its attributes and config, else as the editor settings say for its extension, CRLF for .bat and .cmd, and then for every file, LF |
| Where it comes from | Show where the line ending of new lines and the encoding come from | — | Niche | ✅ Yes | Their menus list every place they may come from, in the order each overrides the next, the one used checked and those that set nothing dimmed: for new lines the lines of the file, `end_of_line` of the .editorconfig, the `eol` attribute, `core.autocrlf` and `core.eol` of git, and the settings for the extension and for every file; for the encoding the one chosen with Reopen in, the byte order mark, bytes that look like UTF-16, bytes that are UTF-8 and the code page of the system, or for a new file `charset` of the .editorconfig and the settings; a row opens the .editorconfig or the settings it comes from |

## Editing

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Undo and redo | Take back and redo changes | Ctrl+Z, Ctrl+Y | Core | ✅ Yes | Ctrl+Shift+Z redoes too |
| Indent | Indent and outdent lines | Tab, Shift+Tab | Core | ✅ Yes | By the indentation the file uses, its .editorconfig over what it shows, the editor settings where neither says; Escape then Tab moves the focus on |
| Keep the indentation | Start a new line as indented as the one before | Enter | Core | ✅ Yes |  |
| Comment lines | Comment lines out and back in | Ctrl+/ | Common | ✅ Yes | Ctrl+K, by the markers of the language of the file, a block comment where a language has no line comments |
| Move lines | Move the lines selected up or down | Alt+Up, Alt+Down | Common | ✅ Yes |  |
| Duplicate and delete lines | Copy or delete the lines selected | Shift+Alt+Down, Ctrl+Shift+K | Common | ❌ No |  |
| Close brackets | Type the closing bracket or quote with the opening one | — | Common | ❌ No |  |
| Trim trailing whitespace | Drop the spaces at the ends of lines as saved | — | Common | 🟡 Partial | Where `trim_trailing_whitespace` of the .editorconfig says so, on Ctrl+S, of the lines edited since saved alone, as an edit Ctrl+Z undoes; not as a tab is closed or the app quits with Save, nor by a setting of the app |
| Final newline | End the file with a line break as saved | — | Common | 🟡 Partial | Where `insert_final_newline` of the .editorconfig says so, on Ctrl+S, once its last line was edited since saved, in the line ending of the file; not as a tab is closed or the app quits with Save, nor by a setting of the app |
| Autocompletion | Suggest words and names as typed | Ctrl+Space | Common | ❌ No |  |

## Cursors and selections

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Several cursors | Type at several places at once | Alt+click | Common | ✅ Yes | Alt+click adds one, Escape leaves one |
| Cursors above and below | Add a cursor on the line above or below | Ctrl+Alt+Up, Ctrl+Alt+Down | Common | ✅ Yes |  |
| Next occurrence | Select the next occurrence of the selection too | Ctrl+D | Common | ✅ Yes |  |
| Column selection | Select a column, a cursor on each line | Shift+Alt+drag | Common | ✅ Yes |  |
| End of a wrapped row | Go to the end of the row rather than the line | End | Common | ✅ Yes | Past the spaces hanging at the end of the row, the cursor drawn at its edge while in them |
| Go to a line | Go to a line by its number | Ctrl+G | Common | ✅ Yes |  |
| Bracket matching | Mark the bracket matching the one at the cursor | — | Common | ✅ Yes | Round, square and curly brackets, by CodeMirror, outlined, one that matches none outlined in the color of errors; brackets in strings and comments counted too, as no grammar tells it where they are |

## Finding

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Find | Find text in the file | Ctrl+F | Core | ✅ Yes | The text selected filled in, every match marked and counted, the nearest selected as typed, Enter and Shift+Enter going to the next and previous |
| Case, whole words, regular expressions | Find in its case, as whole words or by a pattern | Alt+C, Alt+W, Alt+R | Common | 🟡 Partial | By toggles of the find bar, no keys |
| Replace | Replace the match or every match | Ctrl+H | Core | ✅ Yes | A regular expression putting its groups in; every match as one change Ctrl+Z undoes |
| Find in files | Find in every file of a folder | Ctrl+Shift+F | Common | ❌ No |  |

## Display

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Look of the app | Draw the text as the diff and the viewer draw it | — | Niche | ✅ Yes | The monospace font, the width of its characters on device pixels, the line height, the tab stops, emoji and Chinese, Japanese and Korean characters on the grid of the terminal, and wrapped lines broken where the diff breaks them, hanging as far in as their indentation; a test compares where every character of a set of lines is drawn in both |
| Syntax highlighting | Color the code | — | Core | ✅ Yes | With the TextMate grammars the viewer and the diff use, colored again as typed only from the line edited to the first whose state is as it was, in the worker of the colors; the language chosen on its button, nothing over 10 MB |
| Line numbers | Number the lines | — | Core | ✅ Yes |  |
| Wrap | Wrap long lines | Alt+Z | Common | ✅ Yes | By the wrap button, shared with the viewer and the diff |
| Show whitespace | Draw the spaces, tabs and line ends | — | Common | ✅ Yes | By the whitespace button, shared with the viewer and the diff and marking the same characters as they do, a test checking every one, with a sign after each line that ends in CRLF or CR |
| Status line | Show the line, column and selection | — | Common | ✅ Yes | The column counted in cells, as drawn, the characters selected as they are seen, and the cursors |
| Minimap | Show the whole file in small beside it | — | Common | ❌ No |  |
| Folding | Fold blocks of code away | Ctrl+Shift+[ | Common | ❌ No |  |

## App

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Keyboard | List every key of the editor | — | Common | ✅ Yes | In F1, under Editor; no key binds punctuation, so every key is the same on every layout |
| Settings | Set how new files and indentation are | — | Common | ✅ Yes | The editor section of the settings: the line ending, charset and indentation of new files, by extension too |
| EditorConfig | Follow the .editorconfig of a project | — | Common | ✅ Yes | `end_of_line` and `charset` for new files, `indent_style`, `indent_size` and `tab_width` for indenting, and `trim_trailing_whitespace` and `insert_final_newline` for the lines edited, never changing the lines not edited |
| Command palette | Find any command by typing | Ctrl+Shift+P | Common | ❌ No |  |
| Screen readers | Read the text to assistive technology | — | Common | ✅ Yes | By CodeMirror, which edits a text the browser reads |

<!-- prettier-ignore-end -->
