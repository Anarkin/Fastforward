# FEATURES-CANVAS

<!-- prettier-ignore-start -->

- What a canvas can do, and how much of it Fastforward's canvas does: a board of notes and the edges between them, kept as JSON Canvas, the open format of Obsidian's Canvas

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what Obsidian's Canvas, Excalidraw, tldraw, Miro, FigJam and Heptabase offer: Core is in nearly every canvas, Common in most, Advanced in a few, Niche in one or two, if any

- The key is the one Obsidian's Canvas uses for the feature, as JSON Canvas comes from it; where Fastforward uses another, the notes say so

- What the canvas shares with every tool, the tabs and windows, the keyboard, the menus, the lists, the look and the settings of the app, [FEATURES](FEATURES.md#common-app) says

## Files

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Open a canvas | Open a file of a canvas | — | Core | ✅ Yes | Open with Canvas in the menu of a file named .canvas, in any case, on disk, in the commander or on a part of a path anywhere, in a canvas tab of its own named after the file, with the icon of the canvas, or the tab drawing it already; its path above the canvas, from the top left of its nodes, or why it draws none, a file over 50 MB, of no JSON or of JSON with no canvas; not inside an archive; viewed or edited as JSON, colored so |
| JSON Canvas | Read the open format of JSON Canvas 1.0 | — | Core | ✅ Yes | Every attribute the spec defines, nodes of text, files, links and groups, the subpath of a file and the label and background of a group, and the edges between their sides, with their ends, colors and labels, in the order of the file, the first lowest; canvases as Obsidian writes them, a tab an indent and an object a line, and fields Obsidian's plugins add, tested; a node or an edge it can't read left out rather than the file, a notice counting them once while its tab is open; an empty file, or a byte order mark before the JSON, read as a canvas |
| Restore after a restart | Open the canvases again once the app starts | — | Common | ✅ Yes | Their tabs come back, read anew |
| Follow changes | Draw a canvas anew once its file changes | — | Common | 🟡 Partial | Read anew each time its tab shows while nothing of it is unsaved; not watched |
| Save | Write the canvas | Ctrl+S | Core | ✅ Yes | Mod+S, through a file of its own beside it that replaces it once whole, as the editor saves; written as its file was, as Obsidian writes a canvas, a tab an indent and an object a line, or indented or on one line, with its line endings, byte order mark and last line break, every field and node it could not read kept, so a canvas saved unchanged is written byte for byte and an edit changes the lines of what it changed alone; a star on its tab while it has changes not saved, closing it asking first; a file read-only refused, saying so; held in the main process, so a reload or a move to another window keeps its edits |
| New canvas | Make a canvas | — | Core | ❌ No |  |

## Board

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Nodes | Draw the nodes of a canvas | — | Core | ✅ Yes | As boxes of box-drawing characters on the cells of the monospace font, drawn by the canvas on whole device pixels so their lines meet from row to row, a node over those before it in the file, one smaller than its borders a line or □; the selected node in double lines, once nodes can be selected |
| Grid | Snap the nodes to a grid | — | Common | ✅ Yes | Shown as a dot of one stroke where four cells meet, dimmed, hidden under nodes and seen through groups; each node on the cells its edges are nearest, a cell as many pixels of the file as the cell of the monospace font at 100%, in whole pixels, 7 by 18 by default, so a canvas looks otherwise with another font; a node moved, sized or placed written on whole cells; the view settling on whole cells once panned |
| Pan | Move around the canvas | Space+Drag | Core | ✅ Yes | Space+drag and Middle-drag following the pointer, a touchpad both ways at once by the pixels it strokes, the wheel the rows of `scrolling.wheelRows` a notch and Shift+Wheel as many columns, gliding there with `scrolling.smooth`; each settling on whole cells once it rests or is let go, unless `scrolling.smoothSnap` is off; starting at the top left of the nodes, and kept with its tab as it is shown again; no scrollbars, as a canvas has no ends |
| Zoom | Make the canvas larger or smaller | Ctrl+Wheel | Core | ❌ No | To come later, in steps of whole device pixels of a cell |
| Select | Select nodes by a click or a box | — | Core | ✅ Yes | A click on a node, a group by its border, Shift+click adding it and Mod+click putting it in or taking it out; a box dragged over the empty canvas selecting the nodes it touches and the groups it holds whole, with Shift or Mod added to the selection; Mod+A every node; Esc none; drawn in double lines, kept with its tab; no edge selected yet |
| Move and resize | Drag a node, or its sides and corners | — | Core | ✅ Yes | The nodes selected dragged a cell at a time, a group by its top, its label too, with the nodes it holds whole, as Obsidian moves them; a side or a corner of a node selected dragged to size it, but the top of a group, never under two cells, the pointer showing which; drawn as they go, one change once let go |
| Add nodes | Place a new node under the pointer | Mod+1, Mod+2 | Core | 🟡 Partial | Mod+1 a text node of 30 by 5 cells and Mod+2 a group of 40 by 12, following the pointer until a click places it, selected, Esc giving it up; the text of a node not typed yet, nor files and links placed |
| Delete | Delete the nodes and edges selected | Delete | Core | ✅ Yes | Delete and Backspace, the nodes selected with their edges |
| Undo and redo | Take back and redo changes | Ctrl+Z, Ctrl+Shift+Z | Core | ✅ Yes | Mod+Z, Mod+Shift+Z and Mod+Y, up to 500 changes, the tab no longer marked unsaved once back where it was saved |

## Nodes and edges

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Text | Type text in a node | — | Core | 🟡 Partial | Shown, wrapped at its words within its border, a character that shows nothing as ¤, cut where its node ends; not typed yet |
| Markdown | Show the text of a node rendered | — | Common | ❌ No | Shown as typed |
| Edges | Join two nodes by an arrow from side to side | — | Core | 🟡 Partial | Drawn as lines of box-drawing characters from the middle of a side, a joint where they leave a node, turning at right angles, an arrow at each end that asks for one, the end alone by default, the sides that face each other where the file names none; through the nodes in their way rather than around them; not drawn by hand yet |
| Edge labels | Write a label on an edge | — | Common | 🟡 Partial | Shown halfway along the edge; not written yet |
| Colors | Color nodes and edges | — | Common | 🟡 Partial | Their lines in the six colors of JSON Canvas, the colors of the git graph, or a color of their own; not chosen yet |
| Groups | Gather nodes in a labeled frame | — | Common | 🟡 Partial | Drawn, its label in its top border; no background image |
| Files | Show a file in a node | — | Common | 🟡 Partial | Its path and subpath shown; not the file |
| Links | Show a web page in a node | — | Common | 🟡 Partial | Its URL shown; not the page |

<!-- prettier-ignore-end -->
