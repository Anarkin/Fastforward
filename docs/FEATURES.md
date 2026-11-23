# FEATURES

<!-- prettier-ignore-start -->

- What the tools of Fastforward can do, and how much of it they do: what the views of text share here, and each tool in a file of its own

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what the apps of its kind offer, each file naming them: Core is in nearly every one, Common in most, Advanced in a few, Niche in one or two, if any

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
| Invisible characters | Draw the characters that show nothing, take no room or turn text around | — | Advanced | ✅ Yes | Every character Unicode leaves without a shape, the C0 and C1 controls and the delete, the separators of lines and paragraphs, the format characters, the variation selectors, the tags, the rest it lets render as nothing, the object replacement character and the noncharacters, taken by one rule of their properties, drawn as ¤, the direction controls too, each a column wide, whether whitespace is shown or not, turning no text around; every space but the space, the no-break spaces too, and the braille blank, which looks like one, as ¤ too, as many columns as the space is wide, as nothing in a usual text looks like them; one joined to a letter, before or after it, drawn on a column of its own beside it, and a skin tone after a letter on columns of its own, selected, stepped over and deleted on its own as it is drawn; one inside an emoji left to the picture it makes; copied, found and saved as the character itself; a test that no character with a shape of its own is ever drawn as a sign, over every character of Unicode |
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
| Select and copy | Select text with the pointer and copy it | Mod+C | Core | ✅ Yes | A double click taking a word and a third the line; copied as the text it is, whatever of it is drawn as a sign or in a box; kept with its text once its tab is shown again, with the copies of it marked at once, while the text is as it was |
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
