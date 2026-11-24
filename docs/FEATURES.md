# FEATURES

<!-- prettier-ignore-start -->

- What the tools of Fastforward can do, and how much of it they do: what every tool shares and what the views of text share here, and each tool in a file of its own

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what the apps of its kind offer, each file naming them: Core is in nearly every one, Common in most, Advanced in a few, Niche in one or two, if any

## Common: App

- What every tool shares, the tabs and windows, the keyboard, the menus, the lists, the look and the settings of the app; the file of each tool links here, and says what it adds

- Tier from what VS Code, Windows Terminal, Total Commander and Fork offer; the key is the one Fastforward uses

### Tabs and windows

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Tabs | Keep the tools open side by side in tabs | Ctrl+Tab | Core | ✅ Yes | The tabs of every tool in one row, dragged into any order, moved to another window from the menu of a tab; Mod+T opens a new tab, Ctrl+Tab and Ctrl+Shift+Tab step through them, Mod+W or a middle click closes one, each with Shift too, as the terminal takes them without it; Alt+F opens the menu of the app |
| Windows | Open the tools in more than one window | Mod+N | Common | ✅ Yes | Mod+N or New Window in the menu opens a window beside the one in front, with tabs of its own; a tab dragged out of its row into a window of its own that follows the pointer, or into the row of another window, which shows it while it is over the row, the only tab of a window moving its window, Esc putting it back, but on Wayland; closing a window closes its tabs, the last one quitting |
| Opening | Play the logo as a window opens | Right click | Niche | ✅ Yes | The logo drawn huge, its folder rising into a sky as blue as its own, drawn back into its disc as the sky fades into the app and landing on the app icon of the tab row, in a second and a half; in every window opened to be seen, as the app starts, by Mod+N or restored, shown from the first frame of its page, while the app loads below it, but not in a page reloaded as the settings are saved nor in a window a tab is dragged out into; again on a right click of the app icon; drawn by a worker on a canvas and faded by the compositor, so a busy page never stalls it, and passing every press and key to the app; none while the system asks for less motion, nor with `windows.openingAnimation` off, but on a right click |
| Restore after a restart | Open every window and tab again once the app starts | — | Common | ✅ Yes | Every window where it was, with its tabs; the file of each tool says what of a tab comes back |
| Survive a reload | Keep a tab as it was while its page reloads | — | Niche | ✅ Yes | Saving the settings reloads the pages; the main process keeps what a tab showed, its find, its dialog, the part with the keyboard and its caret, so a tab comes back as it was after a reload, once moved to another window and once shown again; the file of each tool says what it keeps |
| Open from outside | Open the app from a terminal or the file manager | — | Common | ✅ Yes | `ff` or `ff <folder>` in a terminal, the shortcut of the app, and Open in Fastforward in the menu of Windows Explorer, through the Open With popup |
| Open in another tool | Open the folder of a tab in another tool of the app | Mod+Shift+O | Niche | ✅ Yes | The Open With popup, from the commander, git and the terminal, to the tools that take the folder |

### Keyboard, menus and lists

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Keyboard | Work every list, column and popup by keyboard | F1 | Common | ✅ Yes | F1 lists the shortcuts of every tool, their keys in monospace, opening on the one in use, the diff's in an entry of their own it opens on in a comparison or the diff column, grouped by what they are for and narrowed to the words or keys typed, scrolled by whole rows below the heading stuck at the top |
| Key bindings | Change the shortcuts | — | Common | ❌ No |  |
| Command palette | Find any command by typing | Ctrl+Shift+P | Common | ❌ No |  |
| Paths | Act on any path the app shows | Right click | Niche | ✅ Yes | A right click on any part of a path anywhere in the app, a drive, a folder or a file, in the lists, the headers of a diff, titles, dialogs, notices, menus and the links of a Markdown preview alike, the main process saying what the path is, opens its menu: Open with Terminal and Open with Commander for a folder, Open with Commander's 7-Zip for a file, Open with Git for a folder in a repository, or Open with Git's Clone... and Open with Git's Init for a folder in none, Open with Viewer, Open with Diff for a file in a repository, comparing its versions, Open with Editor and Open with Paint for an image, which does nothing yet, every item shown and those that don't apply disabled; then Copy Path; ... last opening the menu of Windows, which Shift and a right click open straight away, extended, on Windows only |
| Menus | Pick from a menu | — | Core | ✅ Yes | Kept inside the window, a menu taller than the window, the menu of a button, a submenu or one with a filter scrolled by whole items, as the lists are |
| Lists | Scroll a list | — | Core | ✅ Yes | By whole rows, `scrolling.wheelRows` a notch, the keys gliding to a row with `scrolling.smooth`, as a text scrolls; a heading or folders stuck at the top while the rows scroll below |
| Filters | Narrow a list or a search to what is typed | — | Common | ✅ Yes | Every word of it, anywhere and in any order, ignoring case; Aa matches the case, W whole words and .* takes it as one regular expression, the main process checking them; the same in every filter and search of the app |
| Text boxes | Type into the boxes of the app | — | Core | ✅ Yes | Their cursor drawn by the page beside the box, by the `cursor` settings, as the editor and the terminal draw theirs, in a window without the focus too, and nothing once they lose the focus; a selection filling the rows of device pixels the cursor fills |

### Look and settings

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Scrollbars | Show where a list or a text is scrolled to, and scroll it | — | Core | ✅ Yes | The scrollbars of the browser, drawn alike in every tool, always shown, in a strip of their own as wide as `scrolling.scrollbarSize`, 18 pixels by default, and the one beside a text, as [FEATURES](FEATURES.md#common-text) says, in the colors of the buttons, the track in the gray of a disabled button, the thumb and the buttons in that of a button, tinted under the pointer as a button is, a button that can scroll no further drawn as a disabled one: a button at either end moves a row or a column, on and on while held, the track pressed moves there, the thumb centered on the pointer, and the thumb dragged follows it; a menu, a popup or a preview shows one only while it has more than fits; rounded with the corners of what they stand in |
| Themes | Light and dark, colors and fonts | — | Common | ✅ Yes | Following the system by default, or light or dark by the theme setting; every color and font in the settings |
| Tooltips | Say what a control does, and show text cut short | — | Core | ✅ Yes | A tooltip of the app rather than of the browser, the card a notice is drawn as, on the `tooltip-background` of the theme, the ground of a menu by default: shown once the pointer has rested on something for `tooltips.delayMilliseconds`, half a second by default, and on a sign of a text for `tooltips.characterDelayMilliseconds`, at once by default, the next at once while one shows; centered below a button, starting where a row, a tab or a path starts, over text cut short and only while it is cut, kept inside the window, above what it has no room below, on whole device pixels; a file or a folder it names drawn as every path, in monospace and its colors, a tab comparing two files naming both; hidden at a press, a key, a scroll or a menu, and never taking the pointer; the titles a Markdown file gives its links shown by it as plain words |
| Notices | Say what happened, and why something wasn't done | — | Core | ✅ Yes | In the bottom right corner, errors marked by an icon; each fades in the time its length takes to read, 6 to 15 seconds, an error three times as long, 20 to 45, the least and the most of each in `notices.info` and `notices.error` of the settings, held while the pointer is over it and while the window has no focus; Esc closes the newest |
| Settings | Change the settings | — | Common | 🟡 Partial | JSON files, applied as saved and checked, problems told in notices; the user settings and, read-only, the defaults opened in an editor tab from the app menu; no settings page |

### App

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Updates | Update the app | — | Common | ✅ Yes | Checks on start, every 4 hours and from the menu |
| Run as administrator | Show that the app runs as administrator or root | — | Common | ✅ Yes | A shield beside the app icon of every window, faded in with the + once the opening is done, its tooltip saying that the shells, git and the programs it opens run so too; told by the token of the process on Windows and by its user on macOS and Linux |
| Platforms | Run on Windows, macOS and Linux | — | Common | ✅ Yes | Windows x64, macOS on Apple silicon, Linux x64 as AppImage and deb |
| Languages | Show the app in other languages | — | Common | ❌ No | English only; every sentence is in one dictionary |
| Screen readers | Name every control to assistive technology | — | Common | 🟡 Partial | Tabs, lists and trees are named; menus only by their role, icon buttons by a label of their own, the words of their tooltip |
| AI | Explain, write and fix with AI | — | Advanced | ❌ No | Neither changes and conflicts in git nor errors and commands in the terminal |

## Common: Text

- What the views of text share, the viewer, the editor, the diff and the code blocks of a Markdown preview, drawn as cells by one engine; the file of each tool links here for what it shares, and says what it adds

- Tier from what VS Code, Sublime Text, Notepad++, WinMerge and the Lister of Total Commander offer; the key is the one Fastforward uses, and where a tool uses another, its file says so

### Drawing

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| One look | Draw a text alike in every view | — | Niche | ✅ Yes | The monospace font, the width of its characters on device pixels, the line height, the tab stops, emoji and Chinese, Japanese and Korean characters on the grid of the terminal; drawn as cells by the GPU with WebGPU by the one engine, so a character, a dot of a space, a sign of a tab and the mark of a break stand alike in every view, each saying so where a computer lets the app use no GPU |
| Marks of the app | Draw the signs the app adds to a text | — | Advanced | ✅ Yes | The dot of a space alone drawn by the app; → for a tab, ␍ and ␊ for the line ends, ⏎ for the break of a wrapped row and ¤ for a character that shows nothing taken from the monospace font of the settings, in the muted color of the signs of whitespace, each kept within the device pixels of its cell, so none shows beside a block cursor on it; the same characters in a text drawn as the text they are |
| Line numbers | Number the lines | — | Core | ✅ Yes | One column in every view, as wide, in one color and font, the text starting as far from its edge, a test comparing them; left empty in the viewer, which reads a file by byte position and knows no lines above the screen |
| Syntax highlighting | Color the code | L | Common | ✅ Yes | `shiki` with its Oniguruma engine and VS Code's TextMate grammars, in the worker of the colors, in the language the name of the file tells, L or the language button choosing another or Plain Text; nothing over 10 MB |
| Right-to-left text | Show Arabic and Hebrew right to left, their letters joined | — | Common | ❌ No | The cells draw a line in the order of its characters, a cluster a cell, so Arabic stands left to right in the forms its letters have alone |
| Ligatures | Join characters into the ligatures of the font | — | Advanced | ❌ No | A cluster a cell; JetBrains Mono NL, the font without them, first in the settings |
| Zoom | Make the text larger or smaller for now | Ctrl+Wheel | Common | ❌ No | Only by the size of the monospace font in the settings |
| Indent guides | Draw a thin line at each level of indentation | — | Common | ❌ No |  |
| Rulers | Draw a line down the text at a column | — | Common | ❌ No |  |
| Current line | Tint the line the cursor is on | — | Common | ❌ No |  |
| Bracket pair colors | Color each level of brackets apart | — | Advanced | ❌ No | The editor marks the bracket matching the one at the cursor |
| Sticky scroll | Keep the lines of the blocks around the top in sight | — | Advanced | ❌ No |  |

### Whitespace and characters

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Show whitespace | Draw the spaces, tabs and line ends | . | Common | ✅ Yes | The space as a dot, the tab as → in the first cell of its stop, and the line break that ends a line signed after it, ␍ and ␊ for CRLF, ␊ for LF and ␍ for CR, none after a last line without one; nothing else, a test drawing every control, format character, separator, space, mark, character that shows nothing and noncharacter of Unicode and a sample of the rest alike with whitespace shown or not |
| Control characters | Draw the characters that have no shape of their own | — | Common | ✅ Yes | Each control character but the tab and the line ends as ¤, a column wide, whether whitespace is shown or not, as it marks a character rather than being text, and in the ink of a find match over it, under a block cursor too; copied, found and saved as the character itself |
| Invisible characters | Draw the characters that show nothing, take no room or turn text around | — | Advanced | ✅ Yes | Every character Unicode leaves without a shape, the C0 and C1 controls and the delete, the separators of lines and paragraphs, the format characters, the variation selectors, the tags, the rest it lets render as nothing, the object replacement character and the noncharacters, taken by one rule of their properties, drawn as ¤, the direction controls too, each a column wide, whether whitespace is shown or not, turning no text around; every space but the space, the no-break spaces too, and the braille blank, which looks like one, as ¤ too, as many columns as the space is wide, as nothing in a usual text looks like them; one joined to a letter, before or after it, drawn on a column of its own beside it, and a skin tone after a letter on columns of its own, selected, stepped over and deleted on its own as it is drawn; one inside an emoji left to the picture it makes; copied, found and saved as the character itself; a test that no character with a shape of its own is ever drawn as a sign, over every character of Unicode; the pointer resting on a sign names each character it stands for in a tooltip, by its code point and name, as U+200B ZERO WIDTH SPACE, after `tooltips.characterDelayMilliseconds`, at once by default, in the prose of a Markdown preview too |
| Confusable characters | Mark a character that passes for another, as a Cyrillic а for a Latin a | — | Advanced | ❌ No |  |
| Wrap | Wrap long lines | W | Common | ✅ Yes | By the wrap button, shared by the views, which wrap alike, at as many columns in one window, hanging as far in as their indentation: the text ends two columns, for a blank hanging at the end of a row and ⏎ marking its break, and a gap before the scrollbar; the blanks hanging there dotted or signed while whitespace is hidden |
| Line endings | End a line where the file ends it | — | Common | ✅ Yes | At a line feed, a carriage return and a line feed, or a carriage return alone, in every view alike |
| Encodings | Read a text in its encoding | E | Common | ✅ Yes | Found alike in every view: from a byte order mark, as UTF-16 told by its zeros, as UTF-8, or else in the code page of the system; UTF-16, the Windows, ISO-8859, KOI8, DOS 866 and Mac encodings to choose from; the encoding named where it is not UTF-8 |

### Scrolling

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Scrolling | Scroll by whole rows, a few a notch | — | Common | ✅ Yes | The wheel moves `scrolling.wheelRows` rows a notch, the top row always whole, at the end too; with `scrolling.smooth`, on by default, what is pressed glides there, the wheel and the keys, and what is held moves it by pixels at once, a scrollbar dragged or a touchpad, settling on a whole row or column once let go unless `scrolling.smoothSnap` is off; without it everything lands on whole rows and columns at once; a wrapped text as tall from the start as it is once drawn, every line counted by the rows it wraps onto, and a text not wrapped as wide as its longest line, so the thumbs keep their size as the text scrolls |
| Sideways | Scroll long lines across | ←, →, Shift+Wheel | Common | ✅ Yes | While lines are not wrapped; the wheel with Shift moves `scrolling.wheelRows` columns a notch onto whole columns, gliding with `scrolling.smooth`, as it moves rows, and the scrollbar dragged lands on whole columns too, the line numbers and the gap after them staying where they are, the text cut where its first column starts |
| Scrollbar | Show where a text is scrolled to and what it holds | — | Common | ✅ Yes | The scrollbar every tool has, as wide as `scrolling.scrollbarSizeWithMarkers`, 36 pixels by default, its buttons as long as those of every other, its track marking the matches of a find, and the changes in the diff, each where the thumb comes to stand once its line is at the top, marks closer than two pixels drawn as one; one below a text too while it is not wrapped, from where the text starts after its line numbers |

### Selecting and finding

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Select and copy | Select text with the pointer and copy it | Mod+C | Core | ✅ Yes | Mod+A selecting the whole text of the view, the whole file in the viewer, a side in the diff, as the tool's file says; a double click taking a word and a third the line without its ending; a line ending selected only whole, its carriage return with its line feed, by a selection that runs on past it, never alone; copied as the text it is, its line endings as the file has them, whatever of it is drawn as a sign or in a box; kept with its text once its tab is shown again, with the copies of it marked at once, while the text is as it was |
| Occurrences | Mark the other copies of the text selected | — | Common | ✅ Yes | Every copy of the text selected in the rows drawn, in its case and inside longer words too, at once once the selection is done, by a double click or a drag let go, none while a drag goes on, a text on one line of 200 characters at most, the spaces at its ends left out, but whitespace selected alone sought as it is, so a space selected marks the other spaces; in the yellow and the text color of a find match, the selection kept; none while the find has a text; `text.highlightOccurrences` in the settings |
| Find toggles | Find in its case, by whole words or by a pattern | — | Common | ✅ Yes | Aa matches the case, W whole words and .* a regular expression within a line, as every search of the app; the matches marked on the track of the scrollbar |
| Find in selection | Find only in the text selected | — | Common | ❌ No |  |
| Go to a line | Go to a line by its number | Ctrl+G | Common | 🟡 Partial | In the editor; not in the viewer or the diff |
| Column selection | Select a column, a stretch of each line | Shift+Alt+Drag | Advanced | 🟡 Partial | In the editor; not in the viewer or the diff |
| Copy with colors | Copy the text with its colors, for a document or a mail | — | Advanced | ❌ No | Copied as plain text |
| Links | Open a URL or a path in the text | Ctrl+Click | Common | ❌ No |  |

### App

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Screen readers | Read the text to assistive technology | — | Common | ❌ No | The text is drawn as cells and is in no element of the page; a screen reader is to get a copy of its own once it is asked for, as `xterm.js` has one |
| Print | Print the text | Ctrl+P | Common | ❌ No |  |

<!-- prettier-ignore-end -->

## Tools

- @FEATURES-COMMANDER.md
- @FEATURES-DIFF.md
- @FEATURES-EDITOR.md
- @FEATURES-GIT.md
- @FEATURES-TERMINAL.md
- @FEATURES-VIEWER.md
