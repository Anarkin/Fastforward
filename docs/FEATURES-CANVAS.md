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
| Open a canvas | Open a file of a canvas | — | Core | 🟡 Partial | Open with Canvas in the menu of a file named .canvas, in any case, on disk, in the commander or on a part of a path anywhere, in a canvas tab of its own named after the file, with the icon of the canvas, or the tab drawing it already; its path above a canvas not drawn yet, or why it draws none, a file over 50 MB, of no JSON or of JSON with no canvas; not inside an archive |
| JSON Canvas | Read the open format of JSON Canvas 1.0 | — | Core | ✅ Yes | Nodes of text, files, links and groups and the edges between their sides, with their ends, colors and labels, in the order of the file, the first lowest; a node or an edge it can't read left out rather than the file, a notice counting them once while its tab is open; an empty file, or a byte order mark before the JSON, read as a canvas |
| Restore after a restart | Open the canvases again once the app starts | — | Common | ✅ Yes | Their tabs come back, read anew |
| Follow changes | Draw a canvas anew once its file changes | — | Common | 🟡 Partial | Read anew each time its tab shows; not watched |
| Save | Write the canvas | Ctrl+S | Core | ❌ No |  |
| New canvas | Make a canvas | — | Core | ❌ No |  |

## Board

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Nodes | Draw the nodes of a canvas | — | Core | ❌ No | To come: borders of box-drawing characters on the grid of cells of the monospace font, the selected node in double lines |
| Grid | Snap the nodes to a grid | — | Common | ❌ No | To come: the cells of the monospace font |
| Pan | Move around the canvas | Space+Drag | Core | ❌ No | To come: the wheel and a touchpad too |
| Zoom | Make the canvas larger or smaller | Ctrl+Wheel | Core | ❌ No | To come later, in steps of whole device pixels of a cell |
| Select | Select nodes by a click or a box | — | Core | ❌ No |  |
| Move and resize | Drag a node, or its sides and corners | — | Core | ❌ No |  |
| Add nodes | Place a new node under the pointer | — | Core | ❌ No | To come: Mod+1 a text and Mod+2 a group |
| Delete | Delete the nodes and edges selected | Delete | Core | ❌ No |  |
| Undo and redo | Take back and redo changes | Ctrl+Z, Ctrl+Shift+Z | Core | ❌ No |  |

## Nodes and edges

| Feature | What it does | Key | Tier | Fastforward | Notes |
| --- | --- | --- | --- | --- | --- |
| Text | Type text in a node | — | Core | ❌ No |  |
| Markdown | Show the text of a node rendered | — | Common | ❌ No |  |
| Edges | Join two nodes by an arrow from side to side | — | Core | ❌ No | To come: lines of box-drawing characters |
| Edge labels | Write a label on an edge | — | Common | ❌ No |  |
| Colors | Color nodes and edges | — | Common | ❌ No | The six colors of JSON Canvas and colors of their own |
| Groups | Gather nodes in a labeled frame | — | Common | ❌ No |  |
| Files | Show a file in a node | — | Common | ❌ No |  |
| Links | Show a web page in a node | — | Common | ❌ No |  |

<!-- prettier-ignore-end -->
