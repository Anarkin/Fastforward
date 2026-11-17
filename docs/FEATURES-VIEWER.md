# FEATURES-VIEWER

<!-- prettier-ignore-start -->

- What a file viewer can do, and how much of it Fastforward's viewer does

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what the viewers of Total Commander, Double Commander, Far Manager, Midnight Commander, Directory Opus, XYplorer and the preview of Explorer and Finder offer: Core is in nearly every viewer, Common in most, Advanced in a few, Niche in one or two, if any

- The key is the one the Lister of Total Commander uses for the feature, as most viewers of a file manager follow it; where Fastforward uses another, the notes say so

## Files

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| View a file | Show a file without its app | F3 | Common | ✅ Yes | In a viewer tab of its own, named and iconed after the file, keeping the text, hex or preview, the encoding, the language chosen and where it was in the text, the bytes, a PDF, a Markdown preview or an image at its real size while it is open, sideways too; its tab shown again comes back at once as it was left, its text, bytes and colors drawn as they were, its find open with its query, toggles and the match it was at, and the focus and caret where they were, the file read and searched anew only once it changed, a window reloaded as the settings are saved or the window it moved to bringing it back alike, from where it was, its find and its focus, kept by the main process, the file read and searched again; what it read kept for the three viewer tabs shown last; Escape closes it, F4 turns it into an editor tab |
| Open from other tools | View a file from the commander or a git client | — | Common | ✅ Yes | F3 in the commander, inside an archive too, from a copy 7-Zip takes out, or Open with Viewer in the menu of a file, in the commander or on a part of a path anywhere; the button on the header of a file in git, F3, or Open with Viewer in the menu of its path, the working tree's from disk, a commit's or the index's from a copy of its blob |
| Restore after a restart | Open the files viewed again once the app starts | — | Common | ✅ Yes | Their tabs come back, a copy taken out of an archive too, the viewer read and searched anew, with the find of each and the match it was on, as the view of a tab is saved with it; the tabs of the commander that viewed a file, saved before the viewer was a tool of its own, come back as viewer tabs |
| Edit | Turn the file viewed into one edited | F4 | Core | ✅ Yes | F4 turns the viewer tab into an editor tab, the cursor on the line at the top of the viewer, read in the encoding chosen there, or goes to the tab editing it already; a copy taken out of an archive or a commit refused, saying so; FEATURES-EDITOR says what it does |

## Text and bytes

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Text | Show a file as text, of any size | — | Core | ✅ Yes | Read by byte position a screen at a time, so a gigabyte opens as fast as a kilobyte, each line of up to 64 KiB whole, as the diff shows it, a longer one in rows of 4 KiB, after an empty column as wide as the line numbers of the editor, so the text starts where the editor starts it; 2 |
| Hex | Show a file as bytes | — | Common | ✅ Yes | 1: its offset, 16 bytes a row and their printable characters |
| Encodings | Read a text in its encoding | — | Common | ✅ Yes | E: Auto, from a byte order mark or, when not UTF-8, the code page of the system; UTF-16, the Windows, ISO-8859, KOI8, DOS 866 and Mac encodings, or the bytes |
| Syntax highlighting | Color the code of a file | — | Advanced | ✅ Yes | `shiki`, with VS Code's TextMate grammars, for files up to 10 MB; L chooses the language, or Plain Text |
| Wrap and whitespace | Wrap long lines, and draw the spaces, tabs and line ends | — | Common | ✅ Yes | W and `.`, wrapping and whitespace on by default, as in the diff; wrapped at the column the editor wraps at, ↵ marking each break, as the editor and the diff mark them |
| Find in the file | Search the text of a file | F7 | Common | ✅ Yes | Mod+F, through the whole file in its encoding, counting the matches and marking them in the text, the bytes and the hex; Aa matches the case, W whole words, across the slices it reads too, and .* a regular expression within a line; in a PDF, Aa and W through PDF.js, which has no regular expressions, its find kept with its tab and searched again as the PDF opens, stepping to the match it was on |

## Previews

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Images | Preview images | — | Common | ✅ Yes | 3: fitted, a large one shrunk to the viewer and a small one at its real size, never larger, or at their real size with F, an SVG drawn among them |
| Markdown | Preview Markdown rendered | — | Advanced | ✅ Yes | 3: `markdown-it`, its code colored, its diagrams drawn and its images next to it shown |
| PDF | Preview PDFs | — | Common | ✅ Yes | 3: `pdfjs-dist`, read by ranges, searched with Mod+F, zoomed with Mod and the wheel, opened again where it was left; none locked with a password |
| Media | Play audio and video | — | Common | ❌ No |  |
| Other documents | Preview office documents and others | — | Advanced | ❌ No |  |

<!-- prettier-ignore-end -->
