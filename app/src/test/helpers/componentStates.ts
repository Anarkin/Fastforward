export const keptStates: Readonly<Record<string, string>> = {
  'shell/page/promptPopup.tsx value':
    'the text typed in a prompt, seeded from what its dialog kept (typed) and told to it by onTyped as typed',
  'shell/page/promptPopup.tsx keptSelection':
    'where the caret of a prompt was, read once from what its dialog kept (typed) and put back as it mounts',
  'tools/commander/page/editorToolbar.tsx reopening':
    'the question to reopen in another encoding, kept per tab in keptEditings (editorActions.ts) and read back as mounted',
  'tools/commander/page/editorView.ts goingToLine':
    'whether the go-to-line prompt is open, kept per tab in keptEditings (editorActions.ts) and read back as mounted',
  'tools/commander/page/editorAsks.tsx typedLine':
    'the line typed in the go-to-line prompt, read once from keptEditings (editorActions.ts) as the prompt mounts',
  'tools/commander/page/packPopup.tsx archive':
    'the name of the archive of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx encryptNames':
    'the choice to encrypt the names of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx format':
    'the format of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx level':
    'the compression of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx password':
    'the password typed, never sent to the main process, of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx shown':
    'the choice to show the password of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx splitting':
    'the choice to cut it into volumes of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx testing':
    'the choice to test it once packed of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx volume':
    'the size of volumes of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx zipCipher':
    'the zip cipher of the pack dialog, seeded from the form kept with the dialog of its tab (packing.form) and kept by keepPackForm',
  'tools/commander/page/packPopup.tsx keptForm':
    'the form of the pack dialog as it was kept, read once to leave its caret alone rather than select the name anew',
  'tools/commander/page/pdfPreview.ts found':
    'the matches of the pdf find, counted anew by PDF.js as it searches again, stepped to the match kept per tab',
  'tools/commander/page/pdfPreview.ts search':
    'the query and toggles of the pdf find, kept per tab in the kept viewers (pdfFind) and read back as mounted',
  'tools/commander/page/pdfPreview.ts kept':
    'the pdf find of the tab as left, read once from the kept viewers of viewerActions.ts as it mounts',
  'tools/commander/page/transferPopup.tsx all':
    'whether a clash answer is for the rest, seeded from clashAll of the store for the transfer and question asked',
  'tools/commander/page/editorFinding.ts finding':
    'whether the find is open, kept per tab in keptEditings (editorActions.ts) and read back as mounted',
  'tools/commander/page/editorFinding.ts kept':
    'the find and replace of the tab, read once from keptEditings (editorActions.ts) as the editor mounts',
  'tools/commander/page/editorFinding.ts query':
    'the text and toggles of the find, kept per tab in keptEditings (editorActions.ts) and read back as mounted',
  'tools/commander/page/editorFinding.ts replacement':
    'the text of the replace, kept per tab in keptEditings (editorActions.ts) and read back as mounted',
  'tools/commander/page/editorFinding.ts replacing':
    'whether the replace is open, kept per tab in keptEditings (editorActions.ts) and read back as mounted',
  'tools/commander/page/editorView.ts endingsShown':
    'the line endings of the text, read from the editor state kept per tab in keptEditors as it mounts',
  'tools/commander/page/editorView.ts findCount':
    'the matches counted, read from the editor state kept per tab in keptEditors as it mounts',
  'tools/commander/page/editorView.ts status':
    'the line, column and selection, read from the editor state kept per tab in keptEditors as it mounts',
  'tools/commander/page/hexBody.tsx bytes':
    'the bytes read, kept per tab in the kept viewers of viewerActions.ts while the file is unchanged',
  'tools/commander/page/hexBody.tsx keptLeft':
    'the sideways scroll of the bytes, read once from the viewer kept per tab (viewerKept.ts), kept by onLeft',
  'tools/commander/page/hexBody.tsx topByte':
    'the byte at the top, kept per tab in the places of viewerActions.ts and read back through the viewer',
  'tools/commander/page/paneTiles.ts fill':
    'where thumbnails fill from, taken from the scroll kept per tab, side, folder and layout in ScrollPlaces',
  'tools/commander/page/previewBody.tsx kept':
    'where the preview was scrolled, read once from the viewer kept per tab (viewerKept.ts) and scrolled back to',
  'tools/commander/page/textBody.tsx keptSideways':
    'the sideways place of the text, read once from the viewer kept per tab (viewerKept.ts), kept by onLeft',
  'tools/commander/page/textRows.ts read':
    'the rows read and the top row, kept per tab in the kept viewers of viewerActions.ts until the file changes',
  'tools/commander/page/textSideways.ts across':
    'the column scrolled across to, seeded from the sideways kept per tab (viewerKept.ts) and kept by onLeft',
  'tools/commander/page/viewer.tsx finding':
    'whether the find is open, kept per tab in the kept viewers of viewerActions.ts and read back as mounted',
  'tools/commander/page/viewer.tsx kept':
    'the viewer of the tab as left, read once from the kept viewers of viewerActions.ts as it mounts',
  'tools/commander/page/viewerFind.ts current':
    'the match shown, kept per tab in the kept viewers of viewerActions.ts and read back as mounted',
  'tools/commander/page/viewerFind.ts found':
    'the matches found, kept per tab in the kept viewers of viewerActions.ts while the file is unchanged',
  'tools/commander/page/viewerFind.ts kept':
    'the find of the tab as left, read once from the kept viewers of viewerActions.ts as it mounts',
  'tools/commander/page/viewerFind.ts search':
    'the query and toggles of the find, kept per tab in the kept viewers of viewerActions.ts',
  'tools/commander/page/wholeText.ts colored':
    'the colors of the text, kept per tab in the kept viewers of viewerActions.ts for its language and text',
  'tools/commander/page/wholeText.ts text':
    'the whole text read, kept per tab in the kept viewers of viewerActions.ts while the file is unchanged',
  'tools/git/page/diffFind.ts at':
    'the match shown, kept per scope and selection in the diff places of the git store, read back as mounted',
  'tools/git/page/diffSideways.ts sideways':
    'kept per scope and selection in the diff places of the git store, scrolled back to as the diff settles',
  'tools/git/page/diffView.tsx toggled':
    'kept per scope and selection in the diff places of the git store (store.ts), read back as the diff mounts',
  'tools/git/page/locations.tsx scrolledTo':
    'kept per repository in the location scrolls of the git store (store.ts), read back as the search mounts',
  'tools/git/page/messagePeek.tsx pinned':
    'the pin, kept per worktree with whether its keys made it in pinnedMessages, pinned again as its row is drawn',
};
export const passingStates: Readonly<Record<string, string>> = {
  'lib/page/cellTable.ts table':
    'the table of cell widths, loaded once for the page and read from the module as mounted',
  'lib/page/dialogDrag.ts place':
    'where a dialog was dragged while open; the dialogs are modal, so a tab change comes only from outside, as ff',
  'lib/page/images.tsx broken':
    'true once an image failed to draw, found again as it loads anew',
  'lib/page/images.tsx shown':
    'the image loaded for a url, peeked from the image cache of the page as mounted and held from it',
  'lib/page/images.tsx size':
    'the natural size of an image, read anew as it loads',
  'lib/page/menu.tsx current':
    'the item of an open dropdown with the focus; the dropdown closes on a tab change',
  'lib/page/menu.tsx open':
    'whether a dropdown is open; it closes as the focus leaves it, as it does on a tab change',
  'lib/page/menu.tsx search':
    'typed into an open dropdown, which closes on a tab change as the focus leaves it',
  'lib/page/menuItems.tsx openSubmenu':
    'the submenu open in a menu, which closes on a tab change as the focus leaves it',
  'lib/page/menuItems.tsx placement':
    'where a submenu fits, measured anew from its box as it opens',
  'lib/page/menuItems.tsx submenuByKey':
    'whether the submenu of an open menu was opened by key, to focus its first item',
  'lib/page/shownAfter.ts shown':
    'false until a reading has gone on 500 ms, timed anew as mounted',
  'lib/page/virtualRows.tsx fixedHeight':
    'the height of a row, measured anew from the first row drawn',
  'lib/page/virtualRows.tsx roomHeight':
    'the height of the list, measured anew by a resize observer once mounted',
  'shell/page/App.tsx looks':
    'how each part of a path looks, read from the shell store, made once for the page of the window',
  'shell/page/App.tsx store':
    'the shell store, made once for the page of the window and kept through every tab change',
  'shell/page/aboutPopup.tsx copied':
    'true for a moment after the version is copied, in a popup of the window rather than of a tab',
  'shell/page/contextMenu.tsx position':
    'placed from the point the menu opened at and its measured size; the menu closes on a tab change',
  'shell/page/errorBoundary.tsx asking':
    'the quit question of the crash page, which takes the place of every tab',
  'shell/page/notices.tsx focused':
    'whether the window has the focus, read anew from the document as mounted',
  'shell/page/notices.tsx held':
    'the notice under the pointer, held from fading only while the pointer is over it',
  'shell/page/shortcutsPopup.tsx open':
    'the entry shown in the shortcuts popup, a modal popup of the window that stays open through a tab change',
  'shell/page/shortcutsPopup.tsx search':
    'typed in the shortcuts popup, a modal popup of the window that stays open through a tab change',
  'shell/page/shortcutsPopup.tsx visible':
    'the groups in view in the shortcuts popup, measured anew from its pane after each render',
  'shell/page/tabBar.tsx cycle':
    'the tabs stepped to ahead of the one shown while ctrl+tab repeats, made once for the tab bar',
  'shell/page/tabBar.tsx failed':
    'the icon of a tab that failed to load, in the tab bar, which stays mounted through tab changes',
  'shell/page/tabDrag.ts drag': 'set only while a tab is dragged in its row',
  'shell/page/tabDrag.ts torn':
    'set only while a tab torn out of its row is dragged',
  'shell/page/tabMotions.ts state':
    'the tabs placed with their motions as they open and close, in the tab bar, which stays mounted',
  'shell/page/tabStrip.ts overflowing':
    'whether the tabs overflow their row, measured anew from the strip as it changes',
  'shell/page/tabVisit.ts index':
    'the slot a tab dragged in from another window takes, set only while it is over the row',
  'tools/commander/page/dropping.ts dropInto':
    'the row files dragged from another app are over, set only while they are dragged',
  'tools/commander/page/editorFinding.ts focusAsks':
    'counts the asks to focus the find box; the focus of the tab is kept apart in keptEditings',
  'tools/commander/page/editorView.ts findAsk':
    'an ask of the find keys with the text selected, handled once; the find itself is kept per tab',
  'tools/commander/page/editorView.ts lineCount':
    'the lines of the text, counted as the go-to-line prompt opens',
  'tools/commander/page/editorView.ts mounts':
    'counts the views of the text mounted, only to apply the find to each',
  'tools/commander/page/hexBody.tsx columns':
    'the bytes that fit in a row, measured anew from the body once mounted',
  'tools/commander/page/hexBody.tsx screen':
    'the rows that fit, measured anew from the body once mounted',
  'tools/commander/page/markdownView.tsx render':
    'the markdown renderer, loaded once for the page and read from the module as mounted',
  'tools/commander/page/pane.tsx focusAsks':
    'counts the asks to focus the filter box; the focus of the tab is kept apart in view.kept',
  'tools/commander/page/pane.tsx pairsClick':
    'a function made once that pairs the two clicks of a double click on one row',
  'tools/commander/page/paneCells.tsx failed':
    'the url of an icon that failed to load, tried again once remounted',
  'tools/commander/page/paneCells.tsx shown':
    'true once the system icon has loaded, at once when its ticket came before',
  'tools/commander/page/paneCells.tsx ticket':
    'the ticket of a system icon, taken once from the icon tickets of the store',
  'tools/commander/page/paneTiles.ts fitting':
    'the tiles that fit across, measured anew by a resize observer once mounted',
  'tools/commander/page/pdfView.tsx failure':
    'why a pdf could not be shown, found again as it opens anew',
  'tools/commander/page/scrollBody.tsx barShown':
    'true for a moment after the body moves or the pointer moves over it',
  'tools/commander/page/scrollBody.tsx screen':
    'the rows that fit, measured anew by a resize observer once mounted',
  'tools/commander/page/scrollBody.tsx track':
    'the height of the scrollbar track, measured anew once mounted',
  'tools/commander/page/textBody.tsx columns':
    'the columns that fit, measured anew from the body once mounted',
  'tools/commander/page/textBody.tsx font':
    'the font of the text, measured anew from a probe row once mounted',
  'tools/commander/page/textBody.tsx measured':
    'the rows that fit, measured anew from the body once mounted',
  'tools/commander/page/textRows.ts estimate':
    'the bytes per row estimated from the rows shown, taken anew as they are read',
  'tools/commander/page/textRows.ts lastScreen':
    'the rows of the last screen, asked anew of the main process once mounted',
  'tools/commander/page/textSideways.ts wide':
    'the widest line seen, grown anew from the rows and the whole text kept once mounted',
  'tools/commander/page/thumbnails.tsx failed':
    'the url of a vector thumbnail that failed to load, tried again once remounted',
  'tools/commander/page/thumbnails.tsx inView':
    'whether a thumbnail is in view, observed anew by an intersection observer once mounted',
  'tools/commander/page/thumbnails.tsx shown':
    'the thumbnail drawn, peeked from the thumbnail cache of the page as mounted',
  'tools/commander/page/tool.tsx store':
    'the commander store, made once for the page; it keeps what each commander tab shows through tab changes',
  'tools/commander/page/viewer.tsx focusAsks':
    'counts the asks to focus the find box; the focus of the tab is kept apart in the kept viewers',
  'tools/commander/page/viewerFind.ts jump':
    'counts the jumps to a match; a viewer shown again keeps its place rather than jumping',
  'tools/commander/page/viewerScrollbar.tsx dragging':
    'true only while the thumb of the viewer is dragged',
  'tools/git/page/addressBar.tsx asked':
    'counts the find key presses only to mount the search anew; the search itself is kept per repository',
  'tools/git/page/cappedVirtualizer.ts redraw':
    'counts the redraws forced as the capped scroll moves its base',
  'tools/git/page/cappedVirtualizer.ts resized':
    'a callback made once to redraw as the capped scroll is resized',
  'tools/git/page/cappedVirtualizer.ts scroll':
    'the capped scroll made once per list; the main process keeps the commit at the top and scrolls back to it',
  'tools/git/page/cappedVirtualizer.ts scrollTop':
    'a function made once to read the top of the capped scroll',
  'tools/git/page/cappedVirtualizer.ts scrolling':
    'the scroll options made once around the capped scroll of the list',
  'tools/git/page/clonePopup.tsx edited':
    'whether the modal clone form was edited; it stays mounted through a tab change from outside, as ff',
  'tools/git/page/clonePopup.tsx folder':
    'typed in the modal clone dialog, which stays mounted through a tab change from outside, as ff',
  'tools/git/page/clonePopup.tsx name':
    'typed in the modal clone dialog, which stays mounted through a tab change from outside, as ff',
  'tools/git/page/clonePopup.tsx url':
    'typed in the modal clone dialog, which stays mounted through a tab change from outside, as ff',
  'tools/git/page/codeBlocks.tsx near':
    'the blocks of a long line near the view, observed anew by an intersection observer once mounted',
  'tools/git/page/columnStatusLine.tsx said':
    'the status before a load began, held through the load and read anew from the column once mounted',
  'tools/git/page/commitList.tsx asking':
    'a throttle made once to ask for the commits in view',
  'tools/git/page/commitList.tsx endPadding':
    'the bottom padding of the list, read anew from its style as mounted',
  'tools/git/page/commitList.tsx places':
    'the tops reported to the main process while unanswered; the place itself is kept per worktree there',
  'tools/git/page/commitList.tsx room':
    'the height of the list less its padding, measured anew by a resize observer once mounted',
  'tools/git/page/commitList.tsx scale':
    'the device pixel ratio, read anew from the window as mounted',
  'tools/git/page/commitList.tsx scrollToFn':
    'a scroll function made once around the capped scroll and the tops reported',
  'tools/git/page/compareView.tsx findAsked':
    'counts the find key presses, read only as changes; the find itself is kept per scope in diffFinds',
  'tools/git/page/diffColumn.tsx awaitedDiff':
    'the diff a toggle of the entire file waits for to jump to its first change; a diff shown again keeps its place',
  'tools/git/page/diffColumn.tsx entireSeen':
    'the entire-file toggle last seen, only to notice it change while mounted',
  'tools/git/page/diffColumn.tsx firstChange':
    'counts the jumps to the first change once the entire file shows; a diff shown again keeps its place',
  'tools/git/page/diffColumn.tsx seen':
    'the scope and selection last shown, only to notice them change while mounted',
  'tools/git/page/diffFind.ts focusAsks':
    'counts the asks to focus the find box, read only as changes after mounting',
  'tools/git/page/diffFind.ts jump':
    'counts the jumps to a match; a diff shown again keeps its place rather than jumping again',
  'tools/git/page/diffFollow.ts viewportHeight':
    'the height of the diff, measured anew by a resize observer once mounted',
  'tools/git/page/diffJumps.ts revealing':
    'the match brought into view after a jump, set only until it is drawn',
  'tools/git/page/diffSideways.ts measured':
    'the sideways room of the diff, measured anew from its layout once mounted',
  'tools/git/page/diffView.tsx dragged':
    'true only while the thumb of the minimap is dragged',
  'tools/git/page/filesColumn.tsx filterAsked':
    'counts the find key presses, read only as changes; the filter itself is kept per repository in fileFilters',
  'tools/git/page/filesFilter.ts clicked':
    'counts the clicks that open the filter, read only as changes to focus its box',
  'tools/git/page/lineHeight.ts height':
    'the line height, read anew from the style of the list in a layout effect',
  'tools/git/page/messagePanel.tsx hidden':
    'the lines of a message cut off, measured anew from its body',
  'tools/git/page/messagePanel.tsx lifted':
    'how far a message panel is lifted to fit, measured anew from its box',
  'tools/git/page/messagePeek.tsx peek':
    'the message peeked at, shown only while alt is held over a row',
  'tools/git/page/minimap.tsx dragging':
    'true only while the minimap is dragged',
  'tools/git/page/minimap.tsx shown':
    'true for a moment after the diff scrolls or the pointer moves over it',
  'tools/git/page/navBar.tsx now': 'the clock, read anew every tick',
  'tools/git/page/navBar.tsx open':
    'whether the history dropdown is open; it closes as the focus leaves it, as it does on a tab change',
  'tools/git/page/popupHeight.ts height':
    'the room left for a popup, measured anew from its box and the window',
  'tools/git/page/repositoryColumns.tsx findAsked':
    'counts the find key presses, read only as changes; the find itself is kept per scope in diffFinds',
  'tools/git/page/repositoryColumns.tsx viewAsked':
    'counts the presses of the key that views a file, read only as changes',
  'tools/git/page/settled.ts settled':
    'the value, lagging 200 ms only while it changes; seeded with the value itself as mounted',
  'tools/git/page/skeletonDelay.ts shown':
    'false until a load has gone on 150 ms, timed anew as mounted',
  'tools/git/page/syntax.ts colored':
    'the colors drawn, read as mounted from the colors kept per blob (keptColors.ts) and colored anew by the worker',
  'tools/git/page/tool.tsx store':
    'the git store, made once for the page; it keeps what each git tab shows through tab changes',
  'tools/git/page/worktreeBar.tsx cycle':
    'the worktrees stepped to ahead of the one shown while the key repeats, made once for the bar',
  'tools/git/page/wrapMarks.tsx breaks':
    'the breaks of a wrapped line, read from those remembered by rememberBreaks or measured anew',
  'tools/git/page/wrapMarks.tsx near':
    'whether a block of marks is near the view, observed anew by an intersection observer once mounted',
  'tools/terminal/page/tool.tsx store':
    'the terminal store, made once for the page; each screen is kept by the main process',
};
