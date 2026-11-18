export const componentStates: Readonly<Record<string, string>> = {
  'tools/viewer/page/pdfPreview.ts found':
    'a measure: the matches PDF.js counts as it searches, anew as the PDF opens, stepped to the match the store keeps',
  'tools/editor/page/view.ts endingsShown':
    'a measure: the line endings of the text, read from its editor state as the view is made and as it changes',
  'tools/editor/page/view.ts findCount':
    'a measure: the matches of the find, counted from the editor state as the view is made and as it changes',
  'tools/editor/page/view.ts status':
    'a measure: the line, column and selection, read from the editor state as the view is made and as it changes',
  'tools/viewer/page/pdfPreview.ts match':
    'made once: the helper that steps back to the match a tab kept, handed that match from the store once mounted',
  'lib/page/cellTable.ts table':
    'made once: the table of cell widths, loaded once for the page and read from the module as mounted',
  'lib/page/dialogDrag.ts place':
    'a moment: where a dialog was dragged while open; the dialogs are modal, so a tab change comes only from outside, as ff',
  'lib/page/images.tsx broken':
    'a measure: true once an image failed to draw, found again as it loads anew',
  'lib/page/images.tsx shown':
    'a measure: the image loaded for a url, peeked from the image cache of the page as mounted and held from it',
  'lib/page/images.tsx size':
    'a measure: the natural size of an image, read anew as it loads',
  'lib/page/menu.tsx current':
    'a moment: the item of an open dropdown with the focus; the dropdown closes on a tab change',
  'lib/page/menu.tsx open':
    'a moment: whether a dropdown is open; it closes as the focus leaves it, as it does on a tab change',
  'lib/page/menu.tsx search':
    'a moment: typed into an open dropdown, which closes on a tab change as the focus leaves it',
  'lib/page/menuItems.tsx openSubmenu':
    'a moment: the submenu open in a menu, which closes on a tab change as the focus leaves it',
  'lib/page/menuItems.tsx placement':
    'a measure: where a submenu fits, measured anew from its box as it opens',
  'lib/page/menuItems.tsx submenuByKey':
    'a moment: whether the submenu of an open menu was opened by key, to focus its first item',
  'lib/page/shownAfter.ts shown':
    'a moment: false until a reading has gone on 500 ms, timed anew as mounted',
  'lib/page/virtualRows.tsx fixedHeight':
    'a measure: the height of a row, measured anew from the first row drawn',
  'lib/page/virtualRows.tsx roomHeight':
    'a measure: the height of the list, measured anew by a resize observer once mounted',
  'shell/page/App.tsx looks':
    'made once: how each part of a path looks, read from the shell store, made once for the page of the window',
  'shell/page/App.tsx store':
    'made once: the shell store, made once for the page of the window and kept through every tab change',
  'shell/page/aboutPopup.tsx copied':
    'a moment: true for a moment after the version is copied, in a popup of the window rather than of a tab',
  'shell/page/contextMenu.tsx position':
    'a moment: placed from the point the menu opened at and its measured size; the menu closes on a tab change',
  'shell/page/errorBoundary.tsx asking':
    'a moment: the quit question of the crash page, which takes the place of every tab',
  'shell/page/notices.tsx focused':
    'a measure: whether the window has the focus, read anew from the document as mounted',
  'shell/page/notices.tsx held':
    'a moment: the notice under the pointer, held from fading only while the pointer is over it',
  'shell/page/shortcutsPopup.tsx chosen':
    'a moment: the entry opened in the shortcuts popup, a modal popup of the window that stays open through a tab change, the entry of the tool shown until one is opened',
  'shell/page/shortcutsPopup.tsx focusedAtOpen':
    'a moment: the entry of the part that had the focus as the shortcuts popup opened, before the popup took the focus',
  'shell/page/shortcutsPopup.tsx search':
    'a moment: typed in the shortcuts popup, a modal popup of the window that stays open through a tab change',
  'shell/page/shortcutsPopup.tsx visible':
    'a measure: the groups in view in the shortcuts popup, measured anew from its pane after each render',
  'shell/page/tabBar.tsx cycle':
    'made once: the tabs stepped to ahead of the one shown while ctrl+tab repeats, made once for the tab bar',
  'shell/page/tabDrag.ts drag':
    'a moment: set only while a tab is dragged in its row',
  'shell/page/tabDrag.ts torn':
    'a moment: set only while a tab torn out of its row is dragged',
  'shell/page/tabMotions.ts state':
    'a moment: the tabs placed with their motions as they open and close, in the tab bar, which stays mounted',
  'shell/page/tabStrip.ts overflowing':
    'a measure: whether the tabs overflow their row, measured anew from the strip as it changes',
  'shell/page/tabVisit.ts index':
    'a moment: the slot a tab dragged in from another window takes, set only while it is over the row',
  'tools/commander/page/dropping.ts dropInto':
    'a moment: the row files dragged from another app are over, set only while they are dragged',
  'tools/editor/page/finding.ts focusAsks':
    'a trigger: counts the asks to focus the find box; the focus of the tab is kept apart in editings',
  'tools/editor/page/view.ts findAsk':
    'a trigger: an ask of the find keys with the text selected, handled once; the find itself is kept per tab',
  'tools/editor/page/view.ts lineCount':
    'a measure: the lines of the text, counted as the go-to-line prompt opens',
  'tools/editor/page/view.ts mounts':
    'a trigger: counts the views of the text mounted, only to apply the find to each',
  'tools/viewer/page/hexBody.tsx columns':
    'a measure: the bytes that fit in a row, measured anew from the body once mounted',
  'tools/viewer/page/hexBody.tsx screen':
    'a measure: the rows that fit, measured anew from the body once mounted',
  'tools/viewer/page/markdownView.tsx render':
    'made once: the markdown renderer, loaded once for the page and read from the module as mounted',
  'tools/commander/page/pane.tsx focusAsks':
    'a trigger: counts the asks to focus the filter box; the focus of the tab is kept apart in view.focus',
  'tools/commander/page/pane.tsx pairsClick':
    'made once: a function made once that pairs the two clicks of a double click on one row',
  'tools/commander/page/paneCells.tsx failed':
    'a measure: the url of an icon that failed to load, tried again once remounted',
  'tools/commander/page/paneCells.tsx shown':
    'a measure: true once the system icon has loaded, at once when its ticket came before',
  'tools/commander/page/paneCells.tsx ticket':
    'made once: the ticket of a system icon, taken once from the icon tickets of the store',
  'tools/commander/page/paneTiles.ts fill':
    'a measure: where thumbnails fill from, set as the list scrolls and asked anew once shown again',
  'tools/commander/page/paneTiles.ts fitting':
    'a measure: the tiles that fit across, measured anew by a resize observer once mounted',
  'tools/viewer/page/pdfView.tsx failure':
    'a measure: why a pdf could not be shown, found again as it opens anew',
  'tools/viewer/page/scrollBody.tsx barShown':
    'a moment: true for a moment after the body moves or the pointer moves over it',
  'tools/viewer/page/scrollBody.tsx screen':
    'a measure: the rows that fit, measured anew by a resize observer once mounted',
  'tools/viewer/page/scrollBody.tsx track':
    'a measure: the height of the scrollbar track, measured anew once mounted',
  'tools/viewer/page/textBody.tsx columns':
    'a measure: the columns that fit, measured anew from the body once mounted',
  'tools/viewer/page/textBody.tsx font':
    'a measure: the font of the text, measured anew from a probe row once mounted',
  'tools/viewer/page/textBody.tsx measured':
    'a measure: the rows that fit, measured anew from the body once mounted',
  'tools/viewer/page/textRows.ts estimate':
    'a measure: the bytes per row estimated from the rows shown, taken anew as they are read',
  'tools/viewer/page/textRows.ts lastScreen':
    'a measure: the rows of the last screen, asked anew of the main process once mounted',
  'tools/viewer/page/textSideways.ts wide':
    'a measure: the widest line seen, grown anew from the rows and the whole text kept once mounted',
  'tools/commander/page/thumbnails.tsx failed':
    'a measure: the url of a vector thumbnail that failed to load, tried again once remounted',
  'tools/commander/page/thumbnails.tsx inView':
    'a measure: whether a thumbnail is in view, observed anew by an intersection observer once mounted',
  'tools/commander/page/thumbnails.tsx shown':
    'a measure: the thumbnail drawn, peeked from the thumbnail cache of the page as mounted',
  'tools/commander/page/tool.tsx store':
    'made once: the commander store, made once for the page; it keeps what each commander tab shows through tab changes',
  'tools/diff/page/tool.tsx store':
    'made once: the diff store, made once for the page; it keeps what each tab of the diff shows through tab changes',
  'tools/editor/page/tool.tsx store':
    'made once: the editor store, made once for the page; it keeps what each editor tab shows through tab changes',
  'tools/viewer/page/tool.tsx store':
    'made once: the viewer store, made once for the page; it keeps what each viewer tab shows through tab changes',
  'tools/viewer/page/viewer.tsx focusAsks':
    'a trigger: counts the asks to focus the find box; the focus of the tab is kept apart in tabViews',
  'tools/viewer/page/find.ts jump':
    'a trigger: counts the jumps to a match; a viewer shown again keeps its place rather than jumping',
  'tools/viewer/page/scrollbar.tsx dragging':
    'a moment: true only while the thumb of the viewer is dragged',
  'tools/git/page/addressBar.tsx asked':
    'a trigger: counts the find key presses only to mount the search anew; the search itself is kept per repository',
  'tools/git/page/cappedVirtualizer.ts placed':
    'made once: a function made once to tell the capped scroll where the list was moved to',
  'tools/git/page/cappedVirtualizer.ts redraw':
    'a trigger: counts the redraws forced as the capped scroll moves its base',
  'tools/git/page/cappedVirtualizer.ts resized':
    'made once: a callback made once to redraw as the capped scroll is resized',
  'tools/git/page/cappedVirtualizer.ts scroll':
    'made once: the capped scroll made once per list; the main process keeps the commit at the top and scrolls back to it',
  'tools/git/page/cappedVirtualizer.ts scrollTop':
    'made once: a function made once to read the top of the capped scroll',
  'tools/git/page/cappedVirtualizer.ts scrolling':
    'made once: the scroll options made once around the capped scroll of the list',
  'tools/git/page/clonePopup.tsx edited':
    'a moment: whether the modal clone form was edited; it stays mounted through a tab change from outside, as ff',
  'tools/git/page/clonePopup.tsx folder':
    'a moment: typed in the modal clone dialog, which stays mounted through a tab change from outside, as ff',
  'tools/git/page/clonePopup.tsx name':
    'a moment: typed in the modal clone dialog, which stays mounted through a tab change from outside, as ff',
  'tools/git/page/clonePopup.tsx url':
    'a moment: typed in the modal clone dialog, which stays mounted through a tab change from outside, as ff',
  'components/diff/page/codeBlocks.tsx near':
    'a measure: the blocks of a long line near the view, observed anew by an intersection observer once mounted',
  'lib/page/columnStatusLine.tsx said':
    'a moment: the status before a load began, held through the load and read anew from the column once mounted',
  'tools/git/page/commitList.tsx asking':
    'made once: a throttle made once to ask for the commits in view',
  'tools/git/page/commitList.tsx endPadding':
    'a measure: the bottom padding of the list, read anew from its style as mounted',
  'tools/git/page/commitList.tsx places':
    'a moment: the tops reported to the main process while unanswered; the place itself is kept per worktree there',
  'tools/git/page/commitList.tsx room':
    'a measure: the height of the list less its padding, measured anew by a resize observer once mounted',
  'tools/git/page/commitList.tsx scale':
    'a measure: the device pixel ratio, read anew from the window as mounted',
  'tools/git/page/commitList.tsx scrollToFn':
    'made once: a scroll function made once around the capped scroll and the tops reported',
  'tools/diff/page/compareView.tsx findAsked':
    'a trigger: counts the find key presses, read only as changes; the find itself is kept per scope in diffFinds',
  'components/diff/page/column.tsx awaitedDiff':
    'a moment: the diff a toggle of the entire file waits for to jump to its first change; a diff shown again keeps its place',
  'components/diff/page/column.tsx entireSeen':
    'a moment: the entire-file toggle last seen, only to notice it change while mounted',
  'components/diff/page/column.tsx firstChange':
    'a trigger: counts the jumps to the first change once the entire file shows; a diff shown again keeps its place',
  'components/diff/page/column.tsx seen':
    'a moment: the scope and selection last shown, only to notice them change while mounted',
  'components/diff/page/finding.ts focusAsks':
    'a trigger: counts the asks to focus the find box, read only as changes after mounting',
  'components/diff/page/finding.ts jump':
    'a trigger: counts the jumps to a match; a diff shown again keeps its place rather than jumping again',
  'components/diff/page/finding.ts shownFor':
    'a moment: the selection shown and whether a place was kept for it as it was shown, so a selection without one jumps to its first match',
  'components/diff/page/follow.ts viewportHeight':
    'a measure: the height of the diff, measured anew by a resize observer once mounted',
  'components/diff/page/jumps.ts revealing':
    'a moment: the match brought into view after a jump, set only until it is drawn',
  'components/diff/page/sideways.ts box':
    'a measure: how wide a side of the diff and its minimap are, measured anew from its layout once mounted',
  'components/diff/page/sideways.ts dotColumns':
    'a measure: the columns of an unwrapped diff whose spaces are dotted, worked out anew from where it is scrolled sideways once mounted',
  'components/diff/page/sideways.ts shown':
    'made once: where the diff is scrolled sideways, for the marks of hidden changes to follow without their lines drawn anew, set from the kept place once mounted',
  'components/diff/page/view.tsx dragged':
    'a moment: true only while the thumb of the minimap is dragged',
  'tools/git/page/filesColumn.tsx filterAsked':
    'a trigger: counts the find key presses, read only as changes; the filter itself is kept per repository in fileFilters',
  'tools/git/page/filesFilter.ts clicked':
    'a trigger: counts the clicks that open the filter, read only as changes to focus its box',
  'lib/page/lineHeight.ts height':
    'a measure: the line height, read anew from the style of the list in a layout effect',
  'tools/git/page/messagePanel.tsx hidden':
    'a measure: the lines of a message cut off, measured anew from its body',
  'tools/git/page/messagePanel.tsx lifted':
    'a measure: how far a message panel is lifted to fit, measured anew from its box',
  'tools/git/page/messagePeek.tsx placed':
    'a measure: where the row of the pinned commit was drawn as it was pinned or found again, the pin itself kept per worktree in pinnedMessages',
  'tools/git/page/messagePeek.tsx peek':
    'a moment: the message peeked at, shown only while alt is held over a row',
  'components/diff/page/minimap.tsx dragging':
    'a moment: true only while the minimap is dragged',
  'components/diff/page/minimap.tsx shown':
    'a moment: true for a moment after the diff scrolls or the pointer moves over it',
  'tools/git/page/navBar.tsx now': 'a measure: the clock, read anew every tick',
  'tools/git/page/navBar.tsx open':
    'a moment: whether the history dropdown is open; it closes as the focus leaves it, as it does on a tab change',
  'tools/git/page/popupHeight.ts height':
    'a measure: the room left for a popup, measured anew from its box and the window',
  'tools/git/page/repositoryColumns.tsx findAsked':
    'a trigger: counts the find key presses, read only as changes; the find itself is kept per scope in diffFinds',
  'tools/git/page/repositoryColumns.tsx viewAsked':
    'a trigger: counts the presses of the key that views a file, read only as changes',
  'tools/git/page/settled.ts settled':
    'a moment: the value, lagging 200 ms only while it changes; seeded with the value itself as mounted',
  'lib/page/skeletonDelay.ts shown':
    'a moment: false until a load has gone on 150 ms, timed anew as mounted',
  'components/diff/page/syntax.ts colored':
    'a measure: the colors drawn, read as mounted from the colors kept per blob (blobColors.ts) and colored anew by the worker',
  'tools/git/page/tool.tsx store':
    'made once: the git store, made once for the page; it keeps what each git tab shows through tab changes',
  'tools/git/page/worktreeBar.tsx cycle':
    'made once: the worktrees stepped to ahead of the one shown while the key repeats, made once for the bar',
  'components/diff/page/wrapMarks.tsx laid':
    'a measure: the rows a wrapped line is laid out on and their breaks, read from those remembered by rememberBreaks or measured anew',
  'components/diff/page/wrapMarks.tsx near':
    'a measure: whether a block of marks is near the view, observed anew by an intersection observer once mounted',
  'tools/terminal/page/tool.tsx store':
    'made once: the terminal store, made once for the page; each screen is kept by the main process',
};
