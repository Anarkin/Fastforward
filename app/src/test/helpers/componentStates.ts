export const componentStates: Readonly<Record<string, string>> = {
  'tools/viewer/page/pdfPreview.ts found':
    'a measure: the matches PDF.js counts as it searches, anew as the PDF opens, stepped to the match the store keeps',
  'tools/editor/page/view.ts endingsShown':
    'a measure: the line endings of the text, read from its editor state as the view is made and as it changes',
  'tools/editor/page/view.ts indentShown':
    'a measure: the indentation of the text and the width of its tabs, read from its editor state as the view is made and as an effect changes them',
  'tools/editor/page/view.ts findCount':
    'a measure: the matches of the find, counted from the editor state as the view is made and as it changes',
  'tools/editor/page/view.ts status':
    'a measure: the line, column and selection, read from the editor state as the view is made and as it changes',
  'tools/viewer/page/markdownFinds.ts count':
    'a measure: the matches of the find in a Markdown preview, counted anew from the document it shows as it is drawn, stepped to the match the store keeps',
  'tools/viewer/page/markdownFinds.ts jump':
    'a moment: a count of the steps and searches asked, which scrolls the current match into sight once, anew from zero once mounted',
  'tools/viewer/page/pdfPreview.ts match':
    'made once: the helper that steps back to the match a tab kept, handed that match from the store once mounted',
  'lib/page/laterRows.ts extended':
    'a moment: the rows around the view a list is to draw once the frame that scrolled it is painted, worked out anew from where it is scrolled to once mounted',
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
  'lib/page/menu.tsx fit':
    'a measure: the room below the button of an open dropdown too tall for the window, and how far it reaches past its right edge, read as it opens',
  'lib/page/menu.tsx search':
    'a moment: typed into an open dropdown, which closes on a tab change as the focus leaves it',
  'lib/page/menuItems.tsx openSubmenu':
    'a moment: the submenu open in a menu, which closes on a tab change as the focus leaves it',
  'lib/page/menuItems.tsx place':
    'a measure: where a submenu fits on the window beside its item, measured anew from their boxes as it opens',
  'lib/page/menuItems.tsx search':
    'a moment: what is typed into the filter of a submenu, which closing it lets go',
  'lib/page/menuItems.tsx submenuByKey':
    'a moment: whether the submenu of an open menu was opened by key, to focus its first item',
  'lib/page/shownAfter.ts shown':
    'a moment: false until a reading has gone on 500 ms, timed anew as mounted',
  'lib/page/virtualRows.tsx measuredHeight':
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
  'tools/viewer/page/hexBody.tsx copy':
    'a moment: the text selected whose copies are marked, told by the cells once the selection is done; the selection goes with a tab change, and the copies with it',
  'tools/viewer/page/hexBody.tsx taken':
    'a measure: the bytes a selection of the bytes of a file covers, taken from the bytes read as it is selected so its copies are sought far from it too, taken anew from the bytes read around the selection the tab keeps once shown again',
  'tools/viewer/page/hexBody.tsx columns':
    'a measure: the bytes that fit in a row, measured anew from the body once mounted',
  'tools/viewer/page/hexBody.tsx screen':
    'a measure: the rows that fit, measured anew from the body once mounted',
  'tools/viewer/page/markdownView.tsx marks':
    'a measure: the marks of the matches of the find on the track of the scrollbar of a Markdown preview, measured anew from the document as it is searched and as it or its scroller changes size',
  'tools/viewer/page/markdownView.tsx frame':
    'a measure: the column around the scroller of a Markdown preview, which its marks are drawn in over its scrollbar, found anew as it is searched',
  'tools/viewer/page/markdownView.tsx render':
    'made once: the markdown renderer, loaded once for the page and read from the module as mounted',
  'tools/commander/page/pane.tsx focusAsks':
    'a trigger: counts the asks to focus the filter box; the focus of the tab is kept apart in view.focus',
  'tools/commander/page/pane.tsx pairsClick':
    'made once: a function made once that pairs the two clicks of a double click on one row',
  'tools/commander/page/pane.tsx line':
    'a measure: the height of a row of the details, read from the ruler of the side as it is laid out and resized',
  'tools/commander/page/pane.tsx sight':
    'made once: what the canvas of a side and the element under the pointer share, the row pointed at and where its controls stand, made once for the side',
  'tools/commander/page/pane.tsx lineLooks':
    'made once: the look of each line drawn, kept while its row, its state and the settings are as they were, so a frame reads no date or filter of a line anew',
  'tools/commander/page/pane.tsx tileLooks':
    'made once: the look of each tile drawn, kept while its row, its state and the settings are as they were',
  'tools/commander/page/pane.tsx tileThumbnails':
    'made once: the thumbnails the tiles of a side show, held while their tiles are in sight and let go once they leave it',
  'tools/commander/page/pane.tsx icons':
    'made once: the icons of the files a side draws, asked for once the list rests and kept while the side lives, the 5,000 drawn last',
  'tools/commander/page/paneCanvas.tsx scale':
    'a measure: the device pixels of a CSS pixel, followed as the window moves between screens',
  'tools/commander/page/panePointer.tsx shown':
    'a moment: the row under the pointer, which the element over it stands on, found anew as the pointer moves',
  'tools/commander/page/paneImages.ts cache':
    'made once: the pictures the canvas of a side draws, decoded once, the generic icons and the git mark kept while the side lives and the thumbnails while their tiles are in sight',
  'tools/commander/page/paneTiles.ts fill':
    'a measure: where thumbnails fill from, set as the list scrolls and asked anew once shown again',
  'tools/commander/page/paneTiles.ts fitting':
    'a measure: the tiles that fit across, measured anew by a resize observer once mounted',
  'tools/viewer/page/pdfView.tsx failure':
    'a measure: why a pdf could not be shown, found again as it opens anew',
  'tools/viewer/page/scrollBody.tsx leadFrom':
    'a moment: the row the rows are counted from while they glide, set anew once they rest',
  'tools/viewer/page/scrollBody.tsx screen':
    'a measure: the rows that fit, measured anew by a resize observer once mounted',
  'components/cells/page/cellFont.ts font':
    'a measure: the font of the text, measured anew from a probe row once mounted',
  'tools/viewer/page/scrollBody.tsx track':
    'a measure: the height of the scrollbar track, measured anew once mounted',
  'tools/viewer/page/textBody.tsx copy':
    'a moment: the text selected whose copies are marked, told by the cells once the selection is done; the selection goes with a tab change, and the copies with it',
  'tools/viewer/page/textBody.tsx columns':
    'a measure: the columns that fit, measured anew from the body once mounted',
  'tools/viewer/page/textBody.tsx measured':
    'a measure: the rows that fit, measured anew from the body once mounted',
  'tools/viewer/page/textRows.ts estimate':
    'a measure: the bytes per row estimated from the rows shown, taken anew as they are read',
  'tools/viewer/page/textRows.ts lastScreen':
    'a measure: the rows of the last screen, asked anew of the main process once mounted',
  'tools/viewer/page/textSideways.ts wide':
    'a measure: the widest line seen, grown anew from the rows and the whole text kept once mounted',
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
  'lib/page/columnStatusLine.tsx said':
    'a moment: the status before a load began, held through the load and read anew from the column once mounted',
  'tools/git/page/commitList.tsx asking':
    'made once: a throttle made once to ask for the commits in view',
  'tools/git/page/commitList.tsx endPadding':
    'a measure: the bottom padding of the list, read anew from its style as mounted',
  'tools/git/page/commitList.tsx settling':
    'made once: a timer made once to show the lines of bubbles of the commits off the view once the room of a line has rested',
  'tools/git/page/commitPointer.ts tipped':
    'a moment: the target of a tooltip under the pointer, the one element the commit list holds, found anew as the pointer moves',
  'tools/git/page/commitList.tsx relaidOut':
    'a trigger: counts the redraws as the lines of bubbles of commits change',
  'tools/git/page/commitList.tsx places':
    'a moment: the tops reported to the main process while unanswered; the place itself is kept per worktree there',
  'tools/git/page/crowdedBubbles.ts advances':
    'a measure: the widths of the bubbles of the commits with more than one, read from the shapes in the hidden row and the names measured in its font as it lays out, and anew as its shapes resize',
  'tools/git/page/crowdedBubbles.ts layout':
    'made once: the lines of bubbles of each commit with more than one, laid out anew as the hidden row tells the room of a line, and only for the commits whose lines that room changes',
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
  'components/diff/page/follow.ts roomHeight':
    'a measure: the height of the diff less the padding under its rows, measured anew by a resize observer once mounted',
  'components/diff/page/jumps.ts revealing':
    'a moment: the match brought into view after a jump, set only until it is drawn',
  'components/diff/page/sideways.ts box':
    'a measure: how wide a side of the diff is, measured anew from its layout once mounted',
  'components/diff/page/sideways.ts dotColumns':
    'a measure: the columns of an unwrapped diff whose spaces are dotted, worked out anew from where it is scrolled sideways once mounted',
  'components/diff/page/sideways.ts shown':
    'made once: where the diff is scrolled sideways, for the marks of hidden changes to follow without their lines drawn anew, set from the kept place once mounted',
  'components/diff/page/view.tsx copy':
    'a moment: the text selected whose copies are marked, read from the selection of the page once it rests; the selection goes with a tab change, and the copies with it',
  'components/diff/page/view.tsx dragged':
    'a moment: true only while the thumb of the scrollbar is held',
  'tools/git/page/commitList.tsx filterAsked':
    'a trigger: counts the find key presses, read only as changes; the filter itself is kept per repository in commitFilters',
  'tools/git/page/commitFiltering.ts kept':
    'a moment: the commits found last, shown while git looks for those of what was typed since',
  'tools/git/page/filesCanvas.tsx scale':
    'a measure: the device pixels of a CSS pixel, followed as the window moves between screens',
  'tools/git/page/filesColumn.tsx filterAsked':
    'a trigger: counts the find key presses, read only as changes; the filter itself is kept per repository in fileFilters',
  'tools/git/page/filesColumn.tsx line':
    'a measure: the height of a row of the files, measured by the ruler row of the stylesheet',
  'tools/git/page/filesFilter.ts clicked':
    'a trigger: counts the clicks that open the filter, read only as changes to focus its box',
  'lib/page/lineHeight.ts height':
    'a measure: the line height, read anew from the style of the list in a layout effect',
  'tools/git/page/filesPointer.tsx tipped':
    'a moment: the change letter under the pointer, whose tooltip the proxy over it tells',
  'tools/git/page/messagePanel.tsx hidden':
    'a measure: the lines of a message cut off, measured anew from its body',
  'tools/git/page/messagePanel.tsx lifted':
    'a measure: how far a message panel is lifted to fit, measured anew from its box',
  'tools/git/page/messagePeek.tsx placed':
    'a measure: where the row of the pinned commit was drawn as it was pinned or found again, the pin itself kept per worktree in pinnedMessages',
  'tools/git/page/messagePeek.tsx peek':
    'a moment: the message peeked at, shown only while alt is held over a row',
  'tools/git/page/navBar.tsx now': 'a measure: the clock, read anew every tick',
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
  'tools/terminal/page/tool.tsx store':
    'made once: the terminal store, made once for the page; each screen is kept by the main process',
};
