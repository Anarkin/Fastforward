import {
  labeled,
  named,
  namesBetween,
  sentence,
  type Line,
  type Sentence,
  type Value,
  namedFile,
  namedFolder,
  namedItem,
} from './sentences';

export const brand = 'Fastforward';

interface ElapsedSentences {
  readonly now: string;
  readonly minutes: (count: number) => string;
  readonly hours: (count: number) => string;
  readonly days: (count: number) => string;
}

function byElapsed(elapsed: number, sentences: ElapsedSentences): string {
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) {
    return sentences.now;
  }
  if (minutes < 60) {
    return sentences.minutes(minutes);
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? sentences.hours(hours)
    : sentences.days(Math.floor(hours / 24));
}

const fetchedAgo = (elapsed: number) =>
  byElapsed(elapsed, {
    now: 'Fetched just now',
    minutes: (count) =>
      count === 1 ? 'Fetched 1 minute ago' : `Fetched ${count} minutes ago`,
    hours: (count) =>
      count === 1 ? 'Fetched 1 hour ago' : `Fetched ${count} hours ago`,
    days: (count) =>
      count === 1 ? 'Fetched 1 day ago' : `Fetched ${count} days ago`,
  });

const couldNotFetchAgo = (elapsed: number) =>
  byElapsed(elapsed, {
    now: "Couldn't fetch just now",
    minutes: (count) =>
      count === 1
        ? "Couldn't fetch 1 minute ago"
        : `Couldn't fetch ${count} minutes ago`,
    hours: (count) =>
      count === 1
        ? "Couldn't fetch 1 hour ago"
        : `Couldn't fetch ${count} hours ago`,
    days: (count) =>
      count === 1
        ? "Couldn't fetch 1 day ago"
        : `Couldn't fetch ${count} days ago`,
  });

const lastFetchedAgo = (elapsed: number) =>
  byElapsed(elapsed, {
    now: 'Last fetched just now',
    minutes: (count) =>
      count === 1
        ? 'Last fetched 1 minute ago'
        : `Last fetched ${count} minutes ago`,
    hours: (count) =>
      count === 1
        ? 'Last fetched 1 hour ago'
        : `Last fetched ${count} hours ago`,
    days: (count) =>
      count === 1 ? 'Last fetched 1 day ago' : `Last fetched ${count} days ago`,
  });

function fileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }
  const megabytes = kilobytes / 1024;
  return megabytes < 1024
    ? `${megabytes.toFixed(1)} MB`
    : `${(megabytes / 1024).toFixed(1)} GB`;
}

export const strings = {
  app: {
    name: (version: string, development: boolean) =>
      `${brand} ${version}${development ? ' Dev' : ''}`,
    windowTitle: (root: string, app: string) => `${root} - ${app}`,
    couldNotStart: (error: string) => `${brand} couldn't start.\n\n${error}`,
    needsGit: (reason: Sentence) => sentence`The git tool needs git. ${reason}`,
    installGit: (needed: string) =>
      `Install git ${needed} or later, make sure it is on the PATH, then try again.`,
    gitTooOld: (version: string, path: string, needed: string) =>
      sentence`Git ${version} at ${namedFile(path)} is too old. Install git ${needed} or later, then try again.`,
    openRepositories: 'Open Repositories',
    initRepository: 'Init a Repository',
    init: 'Init',
    cloneInto: 'Clone Into',
    choose: 'Choose',
    openInTerminal: 'Open in Terminal',
    open: 'Open',
    crashed: (error: string) => `Something went wrong: ${error}`,
    reload: 'Reload',
    explorerMenuEntry: `Open in ${brand}`,
  },
  common: {
    noGpu: `${brand} draws with the GPU, and this computer lets it use none.`,
    gpuLost: `${brand} lost the GPU it draws with. Restart it to draw again.`,
    close: 'Close',
    showWhitespace: 'Show Whitespace',
    wrap: 'Wrap Long Lines',
    language: 'Language',
    findLanguage: 'Find a language',
    findEncoding: 'Find an encoding',
    auto: 'Auto',
    autoChoice: (chosen: string) => `Auto: ${chosen}`,
    plainText: 'Plain Text',
    reading: 'Reading…',
    gone: (name: string) => `${name} doesn't exist anymore`,
    fromTo: (from: string, to: string) => `${from} → ${to}`,
    folderGone: (folder: string) =>
      sentence`${namedFolder(folder)} doesn't exist anymore`,
    renamed: (from: Sentence | Value, to: Sentence | Value) =>
      sentence`${from} → ${to}`,
    renamedWithin: (
      start: Sentence | Value,
      from: Sentence | Value,
      to: Sentence | Value,
      end: Sentence | Value,
    ) => sentence`${start}{${from} → ${to}}${end}`,
  },
  characters: {
    line: (code: string, name: string) => `${code} ${name}`,
    byte: (value: string, name: string | undefined) =>
      name === undefined ? `Byte ${value}` : `Byte ${value} ${name}`,
    noncharacter: 'Noncharacter',
    unassigned: 'Unassigned',
  },
  symbols: {
    checked: '✓',
    open: '▾',
    closed: '▸',
    hunk: '⋯',
    breaks: '⏎',
    tab: '→',
    carriageReturn: '␍',
    lineFeed: '␊',
    invisible: '¤',
    foldersLeftOut: '…',
    ascending: '▴',
    descending: '▾',
    unsaved: '*',
  },
  about: {
    title: 'About',
    version: (version: string, development: boolean) =>
      `Version ${version}${development ? ' Dev' : ''}`,
    git: (version: string | undefined) =>
      version === undefined ? 'No git' : `git ${version}`,
    windows: (version: string, build: string, arch: string) =>
      `Windows ${version}, build ${build}, ${arch}`,
    macos: (version: string, arch: string) => `macOS ${version}, ${arch}`,
    linux: (distribution: string | undefined, kernel: string, arch: string) =>
      distribution === undefined
        ? `Linux ${kernel}, ${arch}`
        : `${distribution}, Linux ${kernel}, ${arch}`,
    otherSystem: (platform: string, release: string, arch: string) =>
      `${platform} ${release}, ${arch}`,
    address: 'https://github.com/Anarkin/Fastforward',
    copy: 'Copy',
    copied: 'Copied',
  },
  tools: {
    terminal: 'Terminal',
    commander: 'Commander',
    git: 'Git',
    viewer: 'Viewer',
    editor: 'Editor',
    diff: 'Diff',
    canvas: 'Canvas',
  },
  openWith: {
    title: 'Open With',
  },
  confirm: {
    closeTitle: 'Close Tab',
    closeTabLines: (tab: string, folder?: string): Line[] => [
      folder === undefined ? named(tab) : namedFolder(folder),
    ],
    close: 'Close',
    closeWindowTitle: 'Close Window',
    quitTitle: 'Quit',
    quit: 'Quit',
    initTitle: 'Init',
    initInside: 'This folder is inside another repository.',
    initInsideLines: (folder: string, repository: string) => [
      labeled('', namedFolder(folder)),
      labeled('Repository', namedFolder(repository)),
    ],
    init: 'Init',
    saveTitle: 'Unsaved Changes',
    filesLines: (names: readonly string[]): Line[] =>
      names.map((name) => namedItem(name)),
    save: 'Save',
    saveAll: 'Save All',
    dontSave: "Don't Save",
    cancel: 'Cancel',
    ok: 'OK',
  },
  tabs: {
    elevated: {
      administrator:
        'Fastforward runs as administrator, so the shells, git and the programs it opens run as administrator too.',
      root: 'Fastforward runs as root, so the shells, git and the programs it opens run as root too.',
    },
    tabs: 'Tabs',
    newTab: 'New Tab',
    newWindow: 'New Window',
    moveToNewWindow: 'Move to New Window',
    moveToWindow: 'Move to Window',
    noTabWindow: 'Window with no tab',
    worktrees: 'Worktrees',
    browse: 'Browse...',
    open: 'Open...',
    clone: 'Clone...',
    init: 'Init...',
    removeRecent: (name: string) => `Remove ${name} from this list`,
    label: (name: string, folder?: string) =>
      folder === undefined ? name : `${name} (${folder})`,
    sides: (left: string, right: string) => `${left} · ${right}`,
    settings: 'Settings',
    about: 'About',
    openDefaultSettings: 'Open Default Settings',
    openUserSettings: 'Open User Settings',
    checkForUpdates: 'Check for Updates',
    checkingForUpdates: 'Check for Updates (checking...)',
    upToDate: 'Check for Updates (up to date)',
    downloading: (version: string, percent: number) =>
      `Check for Updates (downloading ${version}, ${percent}%)`,
    checkFailed: 'Check for Updates (failed)',
    restartToUpdate: (version: string) => `Restart to Update to ${version}`,
    download: (version: string) => `Download ${version}`,
    installCommand: 'Install the ff Command',
  },
  actions: {
    newTab: 'Open a new tab',
    newWindow: 'Open a new window',
    openIn: 'Open the folder of the tab in another tool',
    tab: 'Next or previous tab',
    worktree: 'Next or previous worktree',
    closeTab: 'Close a tab',
    moveTab: 'Move a tab among the tabs',
    head: 'Select the checked-out commit',
    upstream: 'Select the upstream of the checked-out branch',
    places: 'Go to a bookmark, a branch, a tag or a commit',
    commits: 'Show or hide the commit list',
    move: 'Move in a list',
    page: 'Move a page, or to either end',
    parent: 'Select the first parent',
    merge: 'Expand or collapse the selected merge',
    compare: 'Compare with the selected commit',
    message: "Hold to peek at a commit's message",
    pin: 'Pin it, to scroll or copy it',
    peekStep: 'Peek through the commits',
    navigate: 'Go back or forward through the selected commits',
    column: 'Next or previous column',
    folder: 'Open or close a folder',
    change: 'Next or previous change',
    sideways: 'Scroll sideways, then change column at the edge',
    wheelSideways: 'Scroll sideways with the wheel',
    panCanvas: 'Move around the canvas',
    panCanvasAcross: 'Move across the canvas with the wheel',
    panCanvasHeld: 'Hold to move around the canvas by dragging it',
    placeTextNode: 'Place a text node, which follows the pointer until a click',
    placeGroupNode: 'Place a group, which follows the pointer until a click',
    selectNodes:
      'Select a node or an edge, or add it to the selection or take it out',
    pointEdges:
      'Point the edges selected the other way, both ways, neither way or back',
    connectNodes:
      'Join two nodes by an edge, dragged from the mark beside a side of one to the other',
    selectArea: 'Select the nodes a box drawn over the empty canvas touches',
    moveNodes: 'Move the nodes selected, a cell at a time',
    resizeNode: 'Size a node selected by a side or a corner, a cell at a time',
    deleteNodes: 'Delete the nodes selected and their edges',
    selectAllNodes: 'Select every node',
    leaveNodes: 'Stop placing a node, or clear the selection',
    saveCanvas: 'Save the canvas',
    typeInNode:
      'Type in the text node selected, or in the one double-clicked where it was clicked',
    openNode:
      'Open the link or the file of the node selected, or of the one double-clicked, a page of the web in the browser and a file in a viewer tab',
    stopTyping: 'Stop typing, the node staying selected',
    newLineInNode: 'Start a new line',
    cursorTextEnd:
      'Move the cursor to the start or the end of the text, or select up to it',
    placeCaret: 'Place the cursor, or select from it',
    wrap: 'Turn line wrapping on or off',
    showWhitespace: 'Show or hide whitespace',
    find: "Search the column you're in",
    toFiles: 'Go from the file filter to the files',
    match: 'Next or previous match',
    stopFinding: 'Close the search',
    mainMenu: 'Open the main menu',
    shortcuts: 'Show or hide these shortcuts',
    dismissNotice: 'Close the newest notice',
    about: 'Show About',
    devTools: 'Developer tools',
    close: 'Close a menu or popup',
    dialogFocus: 'Move between the controls of a popup',
    menuItem: 'Move in a menu',
    menuFilter:
      'Move from the filter of a menu into its items, or choose the first',
    removeItem: 'Remove a recent item from a menu',
    shortcutsTool: 'Show the shortcuts of the next or previous tool',
    shortcutsGroup: 'Go to the next or previous group of shortcuts',
    shortcutsPage: 'Scroll the shortcuts by a page',
    submenu: 'Open a submenu, or go back from it',
    result: 'Move in the search results',
    go: 'Go to the search result',
    drag: 'Drag a scrollbar',
    copySelection: 'Copy the selection',
    paste: 'Paste',
    leftToApp: 'Go to the app rather than the shell',
    side: 'Go to the other side',
    openFolder: 'Open the selected folder, or the selected file in its app',
    selectItem: 'Select the item clicked',
    parentFolder: 'Go up to the parent folder',
    showHidden: 'Show or hide the hidden files',
    layout: 'Show the side as details or as thumbnails',
    groupByColor: 'Group the files of the side by their colors, or stop',
    duplicates:
      'Show only the files of the side that have a copy of the same content, grouped, or every file again',
    moveAcross: 'Move to the thumbnail on the left or right',
    drive: 'Choose the drive of the left or right side',
    sort: 'Sort by a column, or reverse the order',
    folderHistory: 'Back or forward through the folders of the side',
    bookmarks:
      'Open the bookmarks of the side, to go to one or to bookmark the folder of the side',
    goToPath:
      'Go to a folder by typing or pasting its path, or to the folder of a file with the file selected',
    reread: 'Read the folder of the side again',
    readFileAgain: 'Read the file again',
    selectWholeFile: 'Select the whole file',
    selectWholeSide: 'Select the whole side',
    compareAgain: 'Compare the files again',
    readRepositoryAgain: 'Read the repository again',
    viewFile: 'View the selected file in a tab of its own',
    editFile: 'Edit the selected file in a tab of its own',
    saveFile: 'Save the file',
    undo: 'Undo the last change',
    redo: 'Redo the change undone last',
    newLine: 'Start a new line, indented as the one before',
    deleteCharacter: 'Delete the character before or after the cursor',
    deleteWord: 'Delete the word before or after the cursor',
    indent: 'Indent the lines selected, or less',
    toggleComment: 'Comment the lines selected out, or back in',
    moveLines: 'Move the lines selected up or down',
    goToLine: 'Go to a line by its number',
    addCursor: 'Add a cursor where clicked',
    columnSelection: 'Select a column, a cursor on each line',
    nextOccurrence:
      'Select the word at the cursor, then the next occurrence of the selection too, each with a cursor of its own',
    cursorRows: 'Add a cursor on the line above or below',
    singleCursor: 'Leave one cursor, or drop the selection',
    tabLeaves: 'Let the next Tab move the focus on',
    closeEditor: 'Close the file being edited, once nothing is selected',
    viewEdited: 'View the file being edited in this tab',
    compareEditedVersions: 'Compare the file as saved with its versions in git',
    replaceInFile: 'Replace in the file',
    dialogButton: 'Move between the buttons of a dialog',
    newFolder: 'Make a folder in the folder of the side',
    newFile: 'Edit a new file in the folder of the side, made once saved',
    renameItem: 'Rename the selected file or folder',
    copyAs:
      'Copy the selected file or folder under a new name into the folder of the other side',
    packItems:
      'Pack the marked items, or the selected one, into an archive in the folder of the other side',
    testArchives:
      'Test the marked archives, or the selected one, against the checksum of every file in them',
    openWithSevenZip:
      'Open the selected file with 7-Zip, going into it as a folder',
    copyToClipboard:
      'Put the marked items, or the selected one, on the clipboard, to paste them here or into another app',
    pasteFiles: 'Copy the files on the clipboard into the folder of the side',
    markPattern:
      'Mark the files and folders whose names match a pattern, or unmark them with minus',
    markExtension:
      'Mark the files with the extension of the selected one, or unmark them with minus',
    invertMarks:
      'Mark the files and folders not marked, and unmark those marked',
    copyPaths:
      'Copy the paths of the marked items, or of the selected one, as text, or the path of the folder of the side on ..',
    copyNames:
      'Copy the names of the marked items, or of the selected one, as text, or the name of the folder of the side on ..',
    transferItems:
      'Copy the marked items, or the selected one, into the folder of the other side, or move them there with F6',
    deleteItems:
      'Move the marked items, or the selected one, to the Recycle Bin, or with Shift delete them permanently',
    contextMenu:
      'Show the menu of the marked items, the one clicked or selected, or the folder of the side',
    systemMenu:
      'Show the extended menu of Windows for the marked items, the one clicked, or the folder of the side',
    compareFiles:
      'Compare the marked files, or the selected file of each side, in a git tab',
    editViewed: 'Edit the file being viewed in this tab',
    chooseVersion: 'Choose the version of the file to show, as git keeps them',
    compareVersions: 'Compare the version shown with the one before it',
    closeViewer: 'Close the file being viewed',
    followLink: 'Follow a link of a Markdown preview',
    closeCompare: 'Close the files being compared',
    viewAs: 'View the file as hex, text or a preview',
    scrollFile: 'Scroll by a row, a page, or to the start or end',
    rowStart: 'Move to the start of the row, or select up to it',
    rowEnd: 'Move to the end of the row, or select up to it',
    cursorCharacter:
      'Move the cursor a character left or right, or select up to it',
    cursorWord: 'Move the cursor a word left or right, or select up to it',
    cursorRow: 'Move the cursor up or down a row, or select up to it',
    cursorPage: 'Move the cursor up or down a page, or select up to it',
    cursorFileEnd:
      'Move the cursor to the start or the end of the file, or select up to it',
    scrollSideways: 'Scroll sideways',
    chooseEncoding: 'Choose the encoding of the text',
    selectAllText: 'Select the whole text',
    selectText: 'Select text, or reach from where the selection began',
    chooseLanguage: 'Choose the language the text is colored in',
    findInFile: 'Search the file',
    findInTerminal: 'Search the output of the terminal',
    viewDiffFile: 'View the file shown in a tab of its own',
    zoomPdf: 'Zoom a PDF in or out',
    zoomCanvas:
      'Zoom the canvas in or out a device pixel of the width of a cell at a time, around the pointer',
    realSize: 'Show an image at its real size, or fit it to the viewer',
    filterFolder: 'Filter the folder by name',
    filterLetter: 'Filter the folder by the letters typed with Alt',
    stopFiltering: 'Clear the filter',
    leaveFilter: 'Open the selected folder, or go to the files',
    filterMove: 'Move in the files filtered',
    markMoving: 'Mark the files passed while moving, or unmark them',
    toggleMark:
      'Mark or unmark the selected file and move down, counting with Space the size of a folder it marks',
    markAll: 'Mark every file, or unmark them all once all are marked',
    markClick: 'Mark or unmark a file, or mark the files up to it',
    openOnSide:
      'Open the selected folder, or the one you are in, on the left or right side',
    flatView:
      'List the files of every folder in the folder of the side, or the folder alone again',
    stopReading:
      'Stop reading the folders of the side listed flat, or counting the sizes of its folders',
    countSizes: 'Count the sizes of the folders of the side',
  },
  shortcuts: {
    title: 'Shortcuts',
    joiner: '+',
    filter: 'Filter by words or keys',
    noMatches: 'No shortcut here has all of these words.',
    tools: 'Tools',
    viewer: 'Viewer',
    diff: 'Diff',
    editor: 'Editor',
    canvas: 'Canvas',
    paint: 'Paint',
    everywhere: 'General',
    groups: {
      Tabs: 'Tabs',
      App: 'App',
      Lists: 'Lists and popups',
      Moving: 'Moving around',
      Listing: 'Listing',
      Filtering: 'Filtering',
      Marking: 'Marking',
      Operations: 'File operations',
      Viewing: 'Viewing and comparing',
      Archives: 'Archives',
      Scrolling: 'Scrolling',
      Showing: 'Showing the file',
      Text: 'Text',
      Searching: 'Searching',
      Commits: 'Commits',
      Messages: 'Commit messages',
      Files: 'Files',
      Diff: 'Diff',
      Clipboard: 'Clipboard',
      Kept: 'Kept from the shell',
      Editing: 'Editing',
      Cursors: 'Cursors and selections',
      Typing: 'Typing in a node',
    },
  },
  keys: {
    Command: '⌘',
    Option: '⌥',
    Ctrl: 'Ctrl',
    Alt: 'Alt',
    Shift: 'Shift',
    Tab: 'Tab',
    Enter: 'Enter',
    Escape: 'Esc',
    Space: 'Space',
    Plus: '+',
    Minus: '-',
    Asterisk: '*',
    Home: 'Home',
    End: 'End',
    Delete: 'Delete',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    Click: 'Click',
    MiddleClick: 'Middle-click',
    MiddleDrag: 'Middle-drag',
    RightClick: 'Right-click',
    ContextMenu: 'Menu key',
    Drag: 'Drag',
    BackButton: 'Back',
    ForwardButton: 'Forward',
    Wheel: 'Wheel',
    Hover: 'Hover',
    Letter: 'A–Z',
  },
  navigation: {
    fetch: 'Fetch every remote, dropping branches deleted there',
    fetchedTitle: (elapsed: number) =>
      `Fetch every remote, dropping branches deleted there\n${fetchedAgo(elapsed)}`,
    couldNotFetchTitle: (elapsed: number, sinceFetched: number | undefined) =>
      sinceFetched === undefined
        ? `Fetch every remote, dropping branches deleted there\n${couldNotFetchAgo(elapsed)}`
        : `Fetch every remote, dropping branches deleted there\n${couldNotFetchAgo(elapsed)}\n${lastFetchedAgo(sinceFetched)}`,
    pull: 'Pull: fetch every remote, then fast-forward to the upstream',
    push: 'Push: send the new commits to the upstream, or publish to the only remote when there is none',
    fetchEvery: (minutes: number) =>
      minutes === 0
        ? 'Fetch Every Few Minutes'
        : minutes === 1
          ? 'Fetch Every Minute'
          : `Fetch Every ${minutes} Minutes`,
  },
  search: {
    placeholder: 'Search…',
    localBranches: 'Local branches',
    remoteBranches: 'Remote branches',
    tags: 'Tags',
    stashes: 'Stashes',
    noCommitStartsWith: (hash: string) =>
      sentence`No commit starts with ${named(hash)}`,
    commitsStartWith: (count: number, hash: string) =>
      sentence`${String(count)} commits start with ${named(hash)}`,
  },
  commits: {
    counted: (count: number) =>
      count === 1 ? '1 commit' : `${count.toLocaleString()} commits`,
    pushTag: (tag: string, remote: string | undefined) =>
      remote === undefined ? `Push ${tag}` : `Push ${tag} to ${remote}`,
    uncommitted: 'Uncommitted changes',
    uncommittedSide: 'uncommitted',
    uncommittedChanges: (count: number) =>
      count === 0
        ? 'No uncommitted changes'
        : count === 1
          ? '1 uncommitted change'
          : `${count} uncommitted changes`,
    list: 'Commits',
    collapseMerges: 'Collapse merge commits',
    moreLines: (count: number) =>
      count === 1 ? '1 more line' : `${count} more lines`,
    solo: 'Solo: show only the history of the checked-out commit',
    collapseMerge: 'Collapse merge',
    expandMerge: 'Expand merge',
    merged: (count: number) =>
      count === 1
        ? '1 commit merged, click to expand'
        : `${count} commits merged, click to expand`,
    head: (hash: string) => `HEAD ${hash}`,
    detachedAt: (hash: string) => `HEAD is detached at ${hash}`,
    commit: (hash: string) => `Commit ${hash}`,
    checkedOut: (name: string) => `${name}, checked out`,
    checkout: 'Checkout',
    stash: 'stash',
    bookmark: 'Bookmark',
    addBookmark: 'Add bookmark',
    removeBookmark: 'Remove bookmark',
    notInHistory: (hash: string) =>
      sentence`${named(hash)} is not in the history`,
  },
  files: {
    title: 'Files',
    changedCount: (count: number) =>
      count === 1
        ? '1 file changed'
        : `${count.toLocaleString()} files changed`,
    keptCount: (kept: number, count: number) =>
      `${kept.toLocaleString()} of ${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`,
    noChanges: 'No changes',
    noDifferences: 'No differences, both have the same files',
    showAll: 'Show All Files',
    collapseAll: 'Collapse All',
    expandAll: 'Expand All',
    allChanges: 'All Changes',
    staged: 'Staged',
    unstaged: 'Unstaged',
    noMatches: 'No files match',
    statuses: {
      A: 'Added',
      M: 'Modified',
      D: 'Deleted',
      R: 'Renamed',
      C: 'Copied',
      T: 'Type changed',
      U: 'Untracked',
      '?': 'Changed',
    },
    linkStatuses: {
      A: 'Added symbolic link',
      M: 'Modified symbolic link',
      D: 'Deleted symbolic link',
      R: 'Renamed symbolic link',
      C: 'Copied symbolic link',
      T: 'Changed to a symbolic link',
      U: 'Untracked symbolic link',
      '?': 'Changed symbolic link',
    },
    conflict: 'In conflict',
    linkConflict: 'Symbolic link in conflict',
  },
  diff: {
    linesCounted: (added: number, removed: number) =>
      `+${added.toLocaleString()} −${removed.toLocaleString()}`,
    linesCountedLeavingOut: (added: number, removed: number, left: number) =>
      `+${added.toLocaleString()} −${removed.toLocaleString()}, ${left === 1 ? '1 file' : `${left.toLocaleString()} files`} not counted`,
    viewMissing: (file: string) =>
      sentence`${namedFile(file)} isn't there to view.`,
    noEarlierVersion: (file: string) =>
      sentence`git keeps no earlier version of ${namedFile(file)} to compare it with.`,
    viewTooLarge: (file: string) =>
      sentence`${namedFile(file)} is too large to view.`,
    couldNotView: (file: string, reason: Sentence) =>
      sentence`Couldn't view ${namedFile(file)}. ${reason}`,
    showEntireFile: 'Show the Entire File',
    showWhitespaceChanges: 'Show Whitespace Changes',
    layout: 'Layout',
    inline: 'Inline',
    sideBySide: 'Side by Side',
    unchanged: 'Unchanged',
    show: 'Show',
    binary: 'Binary file',
    binaryOrLarge: 'Binary or very large file',
    emptyFile: 'Empty file',
    diagram: 'Diagram',
    diagramFailed: 'This diagram could not be drawn.',
    onlyWhitespace: 'Only whitespace changed',
    onlyEncoding: 'Only the encoding changed',
    identical: 'Identical',
    readAs: (old: string, changed: string) =>
      old === changed ? `Read as ${old}` : `Read as ${old} → ${changed}`,
    noNewlineAtEnd: 'No newline at end of file',
    renamedWithoutChanges: 'Renamed without changes',
    copiedWithoutChanges: 'Copied without changes',
    modeChanged: (from: string, to: string) =>
      `Mode changed from ${from} to ${to}`,
    symbolicLink: (target: string) =>
      sentence`Symbolic link to ${namedFolder(target)}`,
    imageDetails: (width: number, height: number, bytes: number) =>
      `${width} × ${height} · ${fileSize(bytes)}`,
    imageTooLarge: (megabytes: number) =>
      `Images over ${megabytes} MB are not previewed`,
    imageFailed: "Couldn't show this image",
    largeFile: 'Large file',
    notLoaded: 'Not loaded',
    largeDiff: (lines: number) =>
      `Large diff: ${lines.toLocaleString()} changed lines`,
    notLoadedLines: (lines: number) =>
      lines === 1
        ? 'Not loaded: 1 changed line'
        : `Not loaded: ${lines.toLocaleString()} changed lines`,
  },
  clone: {
    title: 'Clone a Repository',
    url: 'URL',
    folder: 'Folder',
    name: 'Name',
    chooseFolder: 'Choose the folder to clone into',
    target: 'Target',
    clone: 'Clone',
    stop: 'Stop',
    runningLines: (url: string, target: string): Line[] => [
      labeled('', named(url)),
      labeled('Into', namedFolder(target)),
    ],
    connecting: 'Connecting',
    percent: (percent: number) => `${percent}%`,
    noUrl: 'Paste the URL of the repository to clone',
    urlOneLine: 'The URL must be one line',
    urlDash: "The URL can't start with -",
    urlExt: "ext:: URLs run commands, so they aren't cloned",
    noName: 'Name the folder to clone into',
    badName: (name: string) =>
      sentence`${namedFolder(name)} can't be the name of a folder`,
    notFullPath: (folder: string) =>
      sentence`${namedFolder(folder)} is not a full path`,
    noFolder: (folder: string) =>
      sentence`${namedFolder(folder)} is not a folder`,
    taken: (target: string) =>
      sentence`${namedFolder(target)} already exists and isn't an empty folder`,
    keptAside: (target: string, cloned: string) =>
      sentence`${namedFolder(target)} was taken while cloning, so the clone is kept in ${namedFolder(cloned)}`,
  },
  terminal: {
    newTab: 'New',
    exited: (code: number) => `The shell exited with code ${code}.`,
    couldNotStart: (shell: string, reason: string) =>
      `Couldn't start ${shell}. ${reason}`,
    stopped: 'The terminal process stopped, so the shell did too.',
  },
  commander: {
    openFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} could not be opened: ${reason}`,
    deleteFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} could not be deleted: ${reason}`,
    deleteFailedMany: (count: number, item: string, reason: Sentence) =>
      sentence`${String(count)} items could not be deleted, among them ${namedItem(item)}: ${reason}`,
    deletedIn: (what: Value | string, folder: string) =>
      sentence`Deleted ${what} in ${namedFolder(folder)}`,
    deletingInStopped: (folder: string) =>
      sentence`Deleting in ${namedFolder(folder)} stopped unexpectedly.`,
    deletingIn: (what: Value, folder: string) => [
      labeled('', what),
      labeled('In', namedFolder(folder)),
    ],
    itemsDone: (items: number, total: number) =>
      `${items.toLocaleString()} of ${total.toLocaleString()} items`,
    notArchive: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} could not be opened as an archive: ${reason}`,
    openWithSevenZip: "Open with Commander's 7-Zip",
    passwordTitle: 'Password',
    passwordWrong: 'The password is wrong. Type it again.',
    archiveLines: (archive: string) => [labeled('Archive', namedItem(archive))],
    passwordLabel: 'Password',
    passwordOpen: 'Open',
    noPassword: 'No password is typed.',
    zipPasswordAscii:
      "A zip's password can hold only the letters, digits and signs of English, as 7-Zip writes no other into a zip.",
    nothingTakenOut: '7-Zip took nothing out.',
    quitStopsTransfers:
      'A copy, a move or a change of an archive is still running, and quitting stops it unfinished.',
    quitDropsChanges:
      'A file opened from an archive was changed and not put back yet, and quitting leaves the change in its copy alone, named at the next start.',
    lineBreakInName:
      "7-Zip can't be told the name of an item that holds a line break.",
    namesAlike: (name: string) =>
      sentence`More than one of the files is named ${namedFile(name)}, and only one of them can go into a folder.`,
    couldNotExtract: (reason: Sentence) =>
      sentence`Nothing could be taken out of the archive: ${reason}`,
    sevenZipEnded: (code: number | null) =>
      code === null ? '7-Zip was stopped.' : `7-Zip ended with code ${code}.`,
    noSevenZip: 'The app has no 7-Zip to open archives with.',
    notAFile: 'It is not a file.',
    deleteAsAdministrator:
      "Items can't be deleted yet in a folder read as administrator.",
    menuOfOneFolder:
      'The menu of Windows can show the files of only one folder at once.',
    deleteTitle: 'Delete',
    deletePermanentlyTitle: 'Delete Permanently',
    bin: (platform: string | undefined) =>
      platform === 'win32' ? 'the Recycle Bin' : 'the Trash',
    moveToBin: (bin: string) => `Move to ${bin}`,
    binOff: 'The Recycle Bin of this drive is turned off.',
    binTrims: (item: string) =>
      sentence`${namedItem(item)} can't be moved to the Recycle Bin, as a name in its path ends in a dot or a space, which the Recycle Bin trims, taking another item. Shift+Delete deletes it permanently.`,
    itemLines: (item: string): Line[] => [namedItem(item)],
    oneItem: (item: string) => namedItem(item),
    items: (count: number) => `${count} items`,
    copyTitle: 'Copy',
    moveTitle: 'Move',
    transferLines: (what: Value, target: string) => [
      labeled('', what),
      labeled('To', namedFolder(target)),
    ],
    copying: (what: Value, target: string) => [
      labeled('', what),
      labeled('To', namedFolder(target)),
    ],
    moving: (what: Value, target: string) => [
      labeled('', what),
      labeled('To', namedFolder(target)),
    ],
    counting: 'Counting the files…',
    transferredFiles: (files: number, total: number) =>
      `${files.toLocaleString()} of ${total.toLocaleString()} files`,
    filesRead: (files: number, total: number) =>
      `${files.toLocaleString()} of ${total.toLocaleString()} files read`,
    packingRest: 'Packing the rest of the files…',
    testingArchive: 'Testing the archive…',
    testOncePacked:
      'Test the archive once packed, before it takes the place of one there',
    filesTested: (files: number, total: number) =>
      `${files.toLocaleString()} of ${total.toLocaleString()} files tested`,
    transferredBytes: (done: number, total: number) =>
      `${fileSize(done)} of ${fileSize(total)}`,
    stopTransfer: 'Stop',
    stoppingTransfer: 'Stopping…',
    clashThereAlready: 'It is there already.',
    clashCopying: 'Copying',
    clashMoving: 'Moving',
    clashThere: 'There now',
    clashItself: 'The item itself',
    keepBothAs: 'Keep Both as',
    clashReadOnly: 'The file there is read-only; Overwrite replaces it anyway.',
    clashDetails: (bytes: number, date: string) =>
      `${fileSize(bytes)}, modified ${date}`,
    overwrite: 'Overwrite',
    skip: 'Skip',
    keepBoth: 'Keep Both',
    forTheRest: 'Do the same for the rest',
    copied: (what: Value | string, target: string) =>
      sentence`Copied ${what} to ${namedFolder(target)}`,
    moved: (what: Value | string, target: string) =>
      sentence`Moved ${what} to ${namedFolder(target)}`,
    copyFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} could not be copied: ${reason}`,
    moveFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} could not be moved: ${reason}`,
    copyFailedMany: (count: number, item: string, reason: Sentence) =>
      sentence`${String(count)} items could not be copied, among them ${namedItem(item)}: ${reason}`,
    moveFailedMany: (count: number, item: string, reason: Sentence) =>
      sentence`${String(count)} items could not be moved, among them ${namedItem(item)}: ${reason}`,
    alreadyIn: (target: string) =>
      sentence`The items are in ${namedFolder(target)} already.`,
    nothingToPaste: 'The clipboard holds no files to paste.',
    dropCopy: 'Copy Here',
    dropMove: 'Move Here',
    dropCopyTitle: (what: Value, target: string) =>
      sentence`Copy ${what} to ${namedFolder(target)}`,
    dropMoveTitle: (what: Value, target: string) =>
      sentence`Move ${what} to ${namedFolder(target)}`,
    newFolderTitle: 'New Folder',
    newFileTitle: 'New File',
    editNewFile: 'Edit',
    newFolderLines: (folder: string): Line[] => [namedFolder(folder)],
    newFolderName: 'Name',
    makeFolder: 'Make',
    noName: 'Type the name of the folder.',
    dotName: "A name can't be . or ..",
    nameCantHold: (characters: string) =>
      sentence`A name can't hold ${named(characters)}`,
    reservedName: (name: string) =>
      sentence`Windows keeps the name ${namedFile(name)} for itself.`,
    nameEnd: "A name can't end in a dot or a space on Windows.",
    nameTaken: (item: string) => sentence`${namedItem(item)} is there already.`,
    nameThere: 'An item of that name is there already.',
    makeFolderFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item, 'folder')} could not be made: ${reason}`,
    makeFolderAsAdministrator:
      "Folders can't be made yet in a folder read as administrator.",
    renameTitle: 'Rename',
    copyAsTitle: 'Copy As',
    copyAsField: 'As',
    copyAsInArchive:
      "Items can't be copied under a new name yet inside an archive.",
    newName: 'New name',
    renameConfirm: 'Rename',
    goToTitle: 'Go To',
    goToField: 'Path',
    goToConfirm: 'Go',
    duplicatesTag: 'duplicates',
    markTitle: 'Mark',
    unmarkTitle: 'Unmark',
    patternField: 'Pattern',
    markConfirm: 'Mark',
    unmarkConfirm: 'Unmark',
    noPattern: 'Type a pattern, as *.jpg.',
    patternMatches: (count: number) =>
      count === 0
        ? 'Matches nothing here'
        : count === 1
          ? 'Matches 1 item'
          : `Matches ${count.toLocaleString()} items`,
    noPath: 'Type the path to go to.',
    copyPath: 'Copy Path',
    copyPaths: 'Copy Paths',
    renameFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} could not be renamed: ${reason}`,
    renameAsAdministrator:
      "Items can't be renamed yet in a folder read as administrator.",
    packAsAdministrator:
      "Items can't be packed yet in a folder read as administrator.",
    intoItself: (item: string) =>
      sentence`${namedItem(item, 'folder')} can't go into itself or a folder in it.`,
    transferAsAdministrator:
      "Items can't be copied or moved yet in a folder read as administrator.",
    packTitle: 'Pack',
    packArchive: 'Archive',
    packFormat: 'Format',
    packFormats: {
      zip: 'zip',
      '7z': '7z',
      tar: 'tar',
      'tar.gz': 'tar.gz',
      'tar.xz': 'tar.xz',
    },
    packLevel: 'Compression',
    packLevels: {
      store: 'Store',
      fastest: 'Fastest',
      normal: 'Normal',
      maximum: 'Maximum',
      ultra: 'Ultra',
    },
    packPassword: 'Password',
    showPassword: 'Show',
    encryptNames: 'Encrypt the names too',
    zipCipher: 'Encryption',
    zipCiphers: { aes256: 'AES-256', zipCrypto: 'ZipCrypto' },
    zipCipherNote:
      'AES-256 is strong, but the zip support of older Windows cannot open it; ZipCrypto opens everywhere, but is weak.',
    splitVolumes: 'Split into volumes',
    volumeSize: 'Size of a volume',
    volumeUnread: 'Type the size of a volume, as 100 MB.',
    volumeSmall: 'A volume holds at least 64 KB.',
    noArchive: 'Type the path of the archive.',
    archiveNotWhole:
      'Type the whole path of the archive, from the root of its drive.',
    archiveThereKept: (archive: string) =>
      sentence`${namedFile(archive)} is there already, so nothing was packed over it.`,
    archiveThere:
      'An archive of that name is there already; packing replaces it.',
    packConfirm: 'Pack',
    archiveName: 'archive',
    volumeCd: '700 MB, a CD',
    volumeFat32: '4092 MB, the largest file FAT32 holds',
    volumeDvd: '4480 MB, a DVD',
    packingInto: (what: Value, archive: string) => [
      labeled('', what),
      labeled('Into', namedFile(archive)),
    ],
    packed: (what: Value | string, archive: string) =>
      sentence`Packed ${what} into ${namedFile(archive)}`,
    packFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} could not be packed: ${reason}`,
    warnedMore: (count: number) => `And ${count.toLocaleString()} more.`,
    packedWithout: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} was packed without some of the files: ${reason}`,
    deletingFrom: (what: Value, archive: string) => [
      labeled('', what),
      labeled('From', namedFile(archive)),
    ],
    deletedFrom: (what: Value | string, archive: string) =>
      sentence`Deleted ${what} from ${namedFile(archive)}`,
    deleteFromFailed: (item: string, reason: Sentence) =>
      sentence`Nothing could be deleted from ${namedItem(item)}: ${reason}`,
    deletingStopped: (archive: string) =>
      sentence`Deleting from ${namedFile(archive)} stopped unexpectedly.`,
    renamingIn: (what: Value, archive: string) => [
      labeled('', what),
      labeled('In', namedFile(archive)),
    ],
    renamedIn: (what: Value | string, archive: string) =>
      sentence`Renamed ${what} in ${namedFile(archive)}`,
    renameInFailed: (item: string, reason: Sentence) =>
      sentence`Nothing could be renamed in ${namedItem(item)}: ${reason}`,
    renamingStopped: (archive: string) =>
      sentence`Renaming in ${namedFile(archive)} stopped unexpectedly.`,
    makingFolderIn: (what: Value, archive: string) => [
      labeled('', what),
      labeled('In', namedFile(archive)),
    ],
    madeFolderIn: (what: Value | string, archive: string) =>
      sentence`Made the folder ${what} in ${namedFile(archive)}`,
    folderInFailed: (item: string, reason: Sentence) =>
      sentence`No folder could be made in ${namedItem(item)}: ${reason}`,
    makingFolderStopped: (archive: string) =>
      sentence`Making a folder in ${namedFile(archive)} stopped unexpectedly.`,
    copyInFailed: (item: string, reason: Sentence) =>
      sentence`Nothing could be copied into ${namedItem(item)}: ${reason}`,
    moveInFailed: (item: string, reason: Sentence) =>
      sentence`Nothing could be moved into ${namedItem(item)}: ${reason}`,
    movedWithout: (item: string, reason: Sentence) =>
      sentence`Not every file could be moved into ${namedItem(item)}: ${reason}`,
    originalsKept: 'Every file moved is kept where it was.',
    changedWhilePacked: (names: readonly string[]) =>
      sentence`What changed in ${namesBetween(names, ', ')} while it was packed is kept where it was.`,
    keptUnmatched: (item: string, count: number) =>
      count === 1
        ? sentence`A file is kept in ${namedItem(item)}, as 7-Zip took it out under another name, or not at all.`
        : sentence`${count.toLocaleString()} files are kept in ${namedItem(item)}, as 7-Zip took them out under other names, or not at all.`,
    movedOutKept: (item: string, reason: Sentence) =>
      sentence`What was moved out of ${namedItem(item)} is kept in it too, as it could not be deleted from it: ${reason}`,
    movedOutWarned: (item: string, warning: Sentence) =>
      sentence`7-Zip warned while deleting from ${namedItem(item)} what was moved out of it: ${warning}`,
    archiveGone: (item: string) =>
      sentence`${namedItem(item)} is no longer there, so it was not changed.`,
    updateTitle: 'Update the Archive',
    updateLines: (name: string, archive: string) => [
      labeled('', namedFile(name)),
      labeled('Archive', namedFile(archive)),
    ],
    updateConfirm: 'Update',
    updateLater: 'Not Now',
    puttingBack: (what: Value): Line[] => [what],
    putBack: (what: Value | string, archive: string) =>
      sentence`Put ${what} back into ${namedFile(archive)}`,
    putBackFailed: (item: string, reason: Sentence) =>
      sentence`Nothing could be put back into ${namedItem(item)}: ${reason}`,
    puttingBackStopped: (archive: string) =>
      sentence`Putting back into ${namedFile(archive)} stopped unexpectedly.`,
    putBackWithout: (item: string, reason: Sentence) =>
      sentence`Not everything could be put back into ${namedItem(item)}: ${reason}`,
    deletingMovedOut: 'Deleting from the archive what was moved out of it…',
    thereAlready: (count: number, total: number) =>
      count < total
        ? `${count.toLocaleString()} of them are there already.`
        : total === 1
          ? 'It is there already.'
          : 'They are there already.',
    replace: 'Replace',
    skipThem: 'Skip Them',
    testTitle: 'Test',
    testingArchives: (what: Value): Line[] => [what],
    testPassed: (what: Value | string) => sentence`${what} passed the test.`,
    testFailed: (item: string, reason: Sentence) =>
      sentence`${namedItem(item)} failed the test: ${reason}`,
    testFailedMany: (count: number, item: string, reason: Sentence) =>
      sentence`${count.toLocaleString()} archives failed the test, among them ${namedItem(item)}: ${reason}`,
    testingStopped: () => 'Testing stopped unexpectedly.',
    noPasswordGiven: 'No password was given.',
    testAsAdministrator:
      "Archives can't be tested yet in a folder read as administrator.",
    archiveTestFailed: (reason: Sentence) =>
      sentence`The archive packed failed its test, so nothing was put in place: ${reason}`,
    archiveInVolumes: (item: string) =>
      sentence`${namedItem(item)} is cut into volumes, which 7-Zip cannot change.`,
    archiveUnchangeable: (item: string) =>
      sentence`${namedItem(item)} cannot be changed yet, as it is inside another archive or a compressed file.`,
    packingStopped: (archive: string) =>
      sentence`Packing into ${namedFile(archive)} stopped unexpectedly.`,
    copyingStopped: (target: string) =>
      sentence`Copying to ${namedFolder(target)} stopped unexpectedly.`,
    movingStopped: (target: string) =>
      sentence`Moving to ${namedFolder(target)} stopped unexpectedly.`,
    name: 'Name',
    extension: 'Ext',
    size: 'Size',
    date: 'Date',
    chooseDrive: 'Choose a drive',
    back: 'Back to the folder before',
    forward: 'Forward to the folder after',
    bookmarks: 'Bookmarks',
    addBookmark: 'Add Bookmark',
    removeBookmark: 'Remove Bookmark',
    removeBookmarkOf: (folder: string) => `Remove ${folder} from the bookmarks`,
    sides: {
      left: 'Left side',
      right: 'Right side',
    },
    couldNotOpen: (folder: string, reason: Sentence) =>
      sentence`Couldn't open ${namedFolder(folder)}. ${reason}`,
    noAccessTitle: 'No Access',
    folderLines: (folder: string): Line[] => [namedFolder(folder)],
    asAdministrator: 'As Administrator',
    readAsAdministrator: 'Read as administrator',
    openRepository: 'Open the repository in a git tab',
    openWithTerminal: 'Open with Terminal',
    openWithCommander: 'Open with Commander',
    openWithGit: 'Open with Git',
    cloneWithGit: "Open with Git's Clone...",
    initWithGit: "Open with Git's Init",
    openWithViewer: 'Open with Viewer',
    openWithDiff: 'Open with Diff',
    openWithEditor: 'Open with Editor',
    openWithCanvas: 'Open with Canvas',
    openWithPaint: 'Open with Paint',
    showMoreOptions: '...',
    helperFailed:
      "Couldn't start the helper that reads folders as administrator.",
    helperStopped:
      'The helper that read folders as administrator stopped, so they are no longer shown.',
    helperGone: 'The helper that reads folders as administrator stopped.',
    helperNotConnected:
      "The helper that reads folders as administrator didn't connect.",
    gone: "It doesn't exist anymore.",
    folderThere: 'A folder of that name is there.',
    fileThere: 'A file of that name is there.',
    itselfThere: 'The item there is this one, reached by another path.',
    madeByThisCopy:
      'This folder was made by this copy and reached again by another path, so it was not copied into itself.',
    copyKept: (copy: string, archive: string) =>
      sentence`${namedFile(copy)} changed after it was taken out of ${namedFile(archive)} and was never put back into it, so the copy is kept.`,
    overItsArchive: (archive: string) =>
      sentence`An item of ${namedFile(archive)} would take the place of the archive itself, so nothing is taken out.`,
    changedWhileMoved:
      'It changed while it was copied, so it is kept where it was, beside its copy.',
    notCopied:
      'It is a pipe, a socket or a device rather than a file, which has no content to copy.',
    layout: 'Layout',
    layouts: { details: 'Details', thumbnails: 'Thumbnails' },
    groupByColor: 'Group by Color',
    filterFolder: 'Filter the folder',
    filterPlaceholder: 'Filter…',
    flatView: 'List the files of every folder in it',
    unreadUnder: (count: number) =>
      count === 1
        ? "1 folder in it couldn't be read, so it may be larger"
        : `${count.toLocaleString()} folders in it couldn't be read, so it may be larger`,
    nothingToCompare:
      'Select a file to compare its versions, or mark two files on a side, or select a file and mark one on the other side, to compare them.',
  },
  versions: {
    version: 'Version',
    staged: 'Staged',
    find: 'Filter by words, hash or date',
    deletedHere: 'The file was deleted in this commit',
  },
  viewer: {
    linkLeadsNowhere: (path: string) =>
      sentence`${namedItem(path)} isn't there, so the link leads nowhere.`,
    viewAs: 'View as',
    viewText: 'Text',
    viewHex: 'Hex',
    viewPreview: 'Preview',
    markdownFiles: 'Markdown',
    pdfFiles: 'PDF',
    imageFiles: 'Images',
    realSize: 'Real Size',
    previewTooLarge: (megabytes: number) =>
      `Documents over ${megabytes} MB are not previewed.`,
    versionNotEdited: (file: string) =>
      sentence`${namedFile(file)} is shown as git keeps a version of it, not as it is on disk, so it can't be edited.`,
    tooLargeToCopy: (megabytes: string, most: number, as: 'text' | 'bytes') =>
      `The file is too large to copy whole, ${megabytes} MB, past the ${most} MB it copies at most as ${as}.`,
  },
  encodings: {
    encoding: 'Encoding',
    names: {
      auto: 'Auto',
      'utf-8': 'UTF-8',
      'utf-16le': 'UTF-16 LE',
      'utf-16be': 'UTF-16 BE',
      'windows-1252': 'Windows-1252 Western',
      'windows-1250': 'Windows-1250 Central European',
      'windows-1251': 'Windows-1251 Cyrillic',
      'windows-1253': 'Windows-1253 Greek',
      'windows-1254': 'Windows-1254 Turkish',
      'windows-1255': 'Windows-1255 Hebrew',
      'windows-1256': 'Windows-1256 Arabic',
      'windows-1257': 'Windows-1257 Baltic',
      'windows-1258': 'Windows-1258 Vietnamese',
      'windows-874': 'Windows-874 Thai',
      'iso-8859-2': 'ISO-8859-2 Central European',
      'iso-8859-3': 'ISO-8859-3 South European',
      'iso-8859-4': 'ISO-8859-4 North European',
      'iso-8859-5': 'ISO-8859-5 Cyrillic',
      'iso-8859-6': 'ISO-8859-6 Arabic',
      'iso-8859-7': 'ISO-8859-7 Greek',
      'iso-8859-8': 'ISO-8859-8 Hebrew, visual',
      'iso-8859-8-i': 'ISO-8859-8-I Hebrew',
      'iso-8859-10': 'ISO-8859-10 Nordic',
      'iso-8859-13': 'ISO-8859-13 Baltic',
      'iso-8859-14': 'ISO-8859-14 Celtic',
      'iso-8859-15': 'ISO-8859-15 Western',
      'iso-8859-16': 'ISO-8859-16 South-Eastern European',
      'koi8-r': 'KOI8-R Russian',
      'koi8-u': 'KOI8-U Ukrainian',
      ibm866: 'DOS-866 Cyrillic',
      macintosh: 'Mac Roman Western',
      'x-mac-cyrillic': 'Mac Cyrillic',
      bytes: 'Bytes',
    },
    short: {
      'utf-8': 'UTF-8',
      'utf-16le': 'UTF-16 LE',
      'utf-16be': 'UTF-16 BE',
      'windows-1252': '1252',
      'windows-1250': '1250',
      'windows-1251': '1251',
      'windows-1253': '1253',
      'windows-1254': '1254',
      'windows-1255': '1255',
      'windows-1256': '1256',
      'windows-1257': '1257',
      'windows-1258': '1258',
      'windows-874': '874',
      'iso-8859-2': '8859-2',
      'iso-8859-3': '8859-3',
      'iso-8859-4': '8859-4',
      'iso-8859-5': '8859-5',
      'iso-8859-6': '8859-6',
      'iso-8859-7': '8859-7',
      'iso-8859-8': '8859-8',
      'iso-8859-8-i': '8859-8-I',
      'iso-8859-10': '8859-10',
      'iso-8859-13': '8859-13',
      'iso-8859-14': '8859-14',
      'iso-8859-15': '8859-15',
      'iso-8859-16': '8859-16',
      'koi8-r': 'KOI8-R',
      'koi8-u': 'KOI8-U',
      ibm866: '866',
      macintosh: 'Mac Roman',
      'x-mac-cyrillic': 'Mac Cyr',
      bytes: 'Bytes',
    },
  },
  textFile: {
    couldNotRead: (file: string, reason: Sentence) =>
      sentence`Couldn't read ${namedFile(file)}. ${reason}`,
  },
  editor: {
    tooLarge: (file: string) =>
      sentence`${namedFile(file)} is over 50 MB, too large to edit.`,
    binary: (file: string) =>
      sentence`${namedFile(file)} holds binary data, so it can't be edited as text.`,
    folder: (item: string) =>
      sentence`${namedItem(item, 'folder')} is a folder.`,
    asAdministrator: (item: string) =>
      sentence`${namedItem(item)} is in a folder read as administrator, where files can't be edited yet.`,
    notSavedToView: (file: string) =>
      sentence`${namedFile(file)} isn't saved yet, so there is nothing of it on disk to view.`,
    viewedCopy: (item: string) =>
      sentence`${namedItem(item)} is a copy taken out of an archive or a commit to view it, so it can't be edited.`,
    couldNotSave: (file: string, reason: Sentence) =>
      sentence`Couldn't save ${namedFile(file)}. ${reason}`,
    noRoom: (file: string) =>
      sentence`Couldn't save ${namedFile(file)}, as its drive hasn't room for it.`,
    keptBeside: (file: string, beside: string) =>
      sentence`Couldn't save ${namedFile(file)} in its place, so what was saved is kept beside it in ${namedFile(beside)}.`,
    unencodable: (
      file: string,
      encoding: string,
      characters: readonly string[],
    ) =>
      sentence`Couldn't save ${namedFile(file)}, as ${encoding} has no ${namesBetween(characters, ', ')}.`,
    keptUnsaved: (file: string, encoding: string, keptIn: string) =>
      sentence`Couldn't save ${namedFile(file)} in ${encoding}, as it holds bytes ${keptIn} couldn't read, which are kept as they were only in ${keptIn}.`,
    readOnly: (file: string) =>
      sentence`${namedFile(file)} is open read-only, so it isn't saved.`,
    changedOutside: (file: string) =>
      sentence`${namedFile(file)} changed on disk while edited here. Saving it writes over those changes.`,
    changedTitle: 'Changed on Disk',
    saveOver: 'Save Over It',
    readAgain: 'Read Again',
    askedInTab: (file: string) =>
      sentence`${namedFile(file)} isn't saved: its tab asks what to do.`,
    column: (column: number) => `Col ${column}`,
    cursors: (cursors: number) => `${cursors} cursors`,
    selected: (characters: number) =>
      characters === 1
        ? '1 character selected'
        : `${characters.toLocaleString()} characters selected`,
    between: ' · ',
    goToLineTitle: 'Go To Line',
    lineNumber: (lines: number) => `Line, 1 to ${lines}`,
    goToLine: 'Go',
    noSuchLine: (lines: number) => `Type a line from 1 to ${lines}.`,
    replacePlaceholder: 'Replace with…',
    replaceOne: 'Replace',
    replaceAll: 'Replace All',
    readEncodingTitle: 'Encoding to read in',
    writeEncodingTitle: 'Encoding to write in',
    readLabel: (encoding: string) => `${encoding} (read)`,
    writeLabel: (encoding: string) => `${encoding} (write)`,
    withBom: (encoding: string) => `${encoding} with BOM`,
    shortWithBom: (encoding: string) => `${encoding} BOM`,
    newLinesEndIn: 'Line ending rules (first one applies):',
    withoutLineBreak:
      'Line ending rules with no line break yet (first one applies):',
    readIn: 'Encoding rules to read in (first one applies):',
    writtenIn: 'Encoding rules to write in (first one applies):',
    endingOfLines: (ending: string) =>
      `${ending}, as most lines of the file end`,
    noLineBreak: 'The file has no line break yet',
    endingFromEditorConfig: (ending: string, file: string) =>
      sentence`${ending}, from ${named('end_of_line')} in ${namedFile(file)}`,
    endingNotInEditorConfig: sentence`No .editorconfig sets ${named('end_of_line')}`,
    endingFromGitAttribute: (ending: string) =>
      sentence`${ending}, from the ${named('eol')} attribute of git`,
    endingFromGitConfig: (ending: string, key: string) =>
      sentence`${ending}, from ${named(key)} of git`,
    endingNotInGit: sentence`Git sets no ${named('eol')} attribute, ${named('core.autocrlf')} or ${named('core.eol')}`,
    endingFromExtension: (ending: string, extension: string) =>
      sentence`${ending}, from ${named('tools.editor.files')} for ${named(`.${extension}`)} in the settings`,
    endingNotForExtension: (extension: string) =>
      extension === ''
        ? sentence`${named('tools.editor.files')} in the settings sets nothing for files without an extension`
        : sentence`${named('tools.editor.files')} in the settings sets nothing for ${named(`.${extension}`)}`,
    endingFromSettings: (ending: string) =>
      sentence`${ending}, from ${named('tools.editor.endOfLine')} in the settings`,
    chosenEncoding: (encoding: string) => `${encoding}, chosen for this file`,
    notChosen: 'No encoding chosen for this file',
    fromByteOrderMark: (encoding: string) =>
      `${encoding}, from its byte order mark`,
    noByteOrderMark: 'No byte order mark',
    looksUtf16: (encoding: string) =>
      `${encoding}, as its bytes look like UTF-16`,
    notUtf16: "Its bytes don't look like UTF-16",
    isUtf8: 'UTF-8, as its bytes are UTF-8',
    notUtf8: "Its bytes aren't UTF-8",
    systemCodePage: (encoding: string) =>
      `${encoding}, the code page of the system`,
    charsetFromEditorConfig: (encoding: string, file: string) =>
      sentence`${encoding}, from ${named('charset')} in ${namedFile(file)}`,
    charsetNotInEditorConfig: sentence`No .editorconfig sets ${named('charset')}`,
    charsetFromSettings: (encoding: string) =>
      sentence`${encoding}, from ${named('tools.editor.charset')} in the settings`,
    reopenTitle: 'Reopen',
    reopenAsked:
      'Reopening the file in another encoding drops the changes made here.',
    reopen: 'Reopen',
    endingNames: { lf: 'LF', crlf: 'CRLF', cr: 'CR' },
    mixed: 'Mixed',
    convertTo: (ending: string) => `Convert all line endings to ${ending}`,
    endingCounts: (counts: readonly string[], newLines: string) =>
      `${counts.join(', ')}; new lines end in ${newLines}`,
    linesEndingIn: (lines: number, ending: string) =>
      `${lines} ${lines === 1 ? 'line ends' : 'lines end'} in ${ending}`,
    overwriteTitle: 'Read-Only File',
    overwriteLines: (file: string): Line[] => [namedFile(file)],
    overwrite: 'Save Anyway',
    unsaved: 'Unsaved changes',
    readOnlyMark: 'Read-only',
    newFile: 'New file, made once saved',
  },
  canvas: {
    color: 'Color',
    noColor: 'None',
    colors: ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Purple'],
    toFront: 'Bring to Front',
    toBack: 'Send to Back',
    customColor: 'Custom…',
    customColorTitle: 'Color',
    customColorLabel: 'Color, as # and six hex digits',
    customColorConfirm: 'Color',
    notAColor: sentence`A color is # and three or six hex digits, as #36F or #3366FF.`,
    couldNotSave: (file: string, reason: Sentence) =>
      sentence`Couldn't save ${namedFile(file)}. ${reason}`,
    readOnly: (file: string) =>
      sentence`${namedFile(file)} is read-only, so it isn't saved.`,
    tooLarge: (file: string) =>
      sentence`${namedFile(file)} is over 50 MB, too large to draw.`,
    notJson: (file: string) =>
      sentence`${namedFile(file)} isn't JSON, so it can't be drawn as a canvas.`,
    notBoard: (file: string) =>
      sentence`${namedFile(file)} isn't JSON Canvas, as it holds no object with lists of nodes and edges.`,
    outsideVault: (files: readonly string[], folder: string) =>
      files.length === 1
        ? sentence`${namedFile(files[0] ?? '')} isn't in ${namedFolder(folder)}, the folder the files of the canvas are read from, so it isn't placed.`
        : sentence`${files.length.toLocaleString()} files aren't in ${namedFolder(folder)}, the folder the files of the canvas are read from, so they aren't placed.`,
    skipped: (file: string, count: number) =>
      count === 1
        ? sentence`One node or edge of ${namedFile(file)} isn't drawn, as it isn't JSON Canvas.`
        : sentence`${count.toLocaleString()} nodes and edges of ${namedFile(file)} aren't drawn, as they aren't JSON Canvas.`,
  },
  indentation: {
    title: 'Indentation and tab width',
    spaces: (count: number) => `Spaces: ${count}`,
    tabSize: (columns: number) => `Tab Size: ${columns}`,
    indentHeading: 'Indentation rules for typing (first one applies):',
    tabUnit: 'A tab',
    spacesUnit: (count: number) =>
      count === 1 ? '1 space' : `${count} spaces`,
    fromEditorConfig: (unit: string, key: string, file: string) =>
      sentence`${unit}, from ${named(key)} in ${namedFile(file)}`,
    notInEditorConfig: sentence`No .editorconfig sets ${named('indent_style')} or ${named('indent_size')}`,
    fromTabbedLines: 'A tab, as most indented lines of the file start with one',
    fromSpacedLines: (unit: string) =>
      `${unit}, as the lines of the file are most often indented by`,
    noIndentedLines: 'The file has no indented lines to go by',
    fromIndentSettings: (unit: string, key: string) =>
      sentence`${unit}, from ${named(key)} in the settings`,
    drawnHeading: 'Tab width rules for drawing (first one applies):',
    columns: (count: number) => (count === 1 ? '1 column' : `${count} columns`),
    widthFromEditorConfig: (columns: string, key: string, file: string) =>
      sentence`${columns}, from ${named(key)} in ${namedFile(file)}`,
    widthNotInEditorConfig: sentence`No .editorconfig sets ${named('tab_width')} or ${named('indent_size')}`,
    widthFromSettings: (columns: string) =>
      sentence`${columns}, from ${named('text.tabSize')} in the settings`,
  },
  pdf: {
    page: (page: number) => `Page ${page}`,
    couldNotOpen: (reason: string) => `Couldn't show the PDF. ${reason}`,
    needsPassword:
      "This PDF is locked with a password, which the app doesn't ask for yet.",
    invalid: 'The file is not a PDF, or it is damaged.',
    partUnread:
      "Part of the file couldn't be read. It may have changed or been removed.",
  },
  find: {
    placeholder: 'Search…',
    unsearched: (count: number) =>
      `Large files not shown yet are not searched: ${count}`,
    previous: 'Previous Match',
    next: 'Next Match',
    noResults: 'No matches',
    matchCase: 'Match Case',
    wholeWord: 'Whole Word',
    regexTitle: 'Use Regular Expression',
    caseGlyph: 'Aa',
    wordGlyph: 'W',
    regexGlyph: '.*',
    badPattern: 'Not a valid pattern',
    noRegexInPdf: "A PDF can't be searched by a regular expression.",
    searching: 'Searching…',
    count: (current: number, matches: number, capped: boolean) =>
      `${current} of ${matches}${capped ? '+' : ''}`,
  },
  messages: {
    dismiss: 'Dismiss',
    quitWaitsForGit:
      'Git is still switching to a branch or moving one, and quitting waits for it to finish.',
    inTab: (tab: string, message: Sentence) => sentence`${tab}: ${message}`,
    settingsProblem: (problem: Sentence) => sentence`Settings: ${problem}`,
    couldNotOpen: (folder: string, reason: Sentence) =>
      sentence`Couldn't open ${namedFolder(folder)}. ${reason}`,
    notInRepository: (folder: string) =>
      sentence`${namedFolder(folder)} is not in a git repository`,
    unreachable: "The folder isn't there, or can't be reached.",
    alreadyRepository: (folder: string) =>
      sentence`${namedFolder(folder)} is a git repository already, so it was opened`,
    couldNotInit: (folder: string, reason: Sentence) =>
      sentence`Couldn't init a repository in ${namedFolder(folder)}. ${reason}`,
    cloned: (url: string, target: string) =>
      sentence`Cloned ${named(url)} into ${namedFolder(target)}`,
    couldNotClone: (url: string, reason: Sentence) =>
      sentence`Couldn't clone ${named(url)}. ${reason}`,
    noToolOpens: (folder: string) =>
      sentence`${namedFolder(folder)} can't be opened`,
    noFolder: (tool: string) => `${tool} doesn't know which folder it's in`,
    notRepository: (root: string) =>
      sentence`${namedFolder(root)} is not a git repository`,
    compareTab: (old: string, changed: string) => `${old} → ${changed}`,
    compareTooLarge: (megabytes: number) =>
      `Files over ${megabytes} MB together are not compared.`,
    couldNotWatchCompared: (old: string, changed: string) =>
      sentence`Couldn't watch ${namedFile(old)} and ${namedFile(changed)}, so their changes won't show until they are compared again`,
    couldNotCompare: (old: string, changed: string, reason: Sentence) =>
      sentence`Couldn't compare ${namedFile(old)} with ${namedFile(changed)}. ${reason}`,
    couldNotWatch: (root: string) =>
      sentence`Couldn't watch ${namedFolder(root)}, so changes made outside ${brand} won't show until it is opened again`,
    couldNotCheckOut: (name: string, reason: Sentence) =>
      sentence`Couldn't check out ${named(name)}. ${reason}`,
    branchAlikeButCase: (local: string, remote: string, alike: string) =>
      sentence`Made no branch ${named(local)} of ${named(remote)}, as the branch ${named(alike)} differs from it only by case, which this repository can't tell apart`,
    noRefToCheckOut: (name: string) =>
      sentence`${named(name)} doesn't exist, so it wasn't checked out`,
    leftBehind: (count: number, hashes: readonly string[], more: number) =>
      sentence`Left ${count === 1 ? '1 commit' : `${count} commits`} behind on no branch or tag: ${namesBetween(hashes, ' ')}${more > 0 ? ` and ${more} more` : ''}`,
    diverged: (local: string, remote: string) =>
      sentence`Switched to ${named(local)}, which has diverged from ${named(remote)}, so it couldn't be fast-forwarded`,
    couldNotFastForward: (local: string, remote: string, reason: Sentence) =>
      sentence`Switched to ${named(local)}, but couldn't fast-forward it to ${named(remote)}. ${reason}`,
    couldNotFetch: (reason: string) => `Couldn't fetch. ${reason}`,
    upToDateWith: (local: string, upstream: string) =>
      sentence`${named(local)} is up to date with ${named(upstream)}`,
    aheadOf: (local: string, upstream: string) =>
      sentence`${named(local)} is ahead of ${named(upstream)}, with nothing to pull`,
    cannotFastForward: (local: string, upstream: string) =>
      sentence`${named(local)} has diverged from ${named(upstream)}, so it can't be fast-forwarded`,
    couldNotPull: (reason: string) => `Couldn't pull. ${reason}`,
    checkedOutElsewhere: (branch: string) =>
      sentence`${named(branch)} is checked out in another worktree, so pull it there`,
    branchInUse: (branch: string) =>
      sentence`${named(branch)} is checked out, or being rebased or bisected, in a worktree, so it wasn't pulled`,
    pushed: (local: string, upstream: string) =>
      sentence`Pushed ${named(local)} to ${named(upstream)}`,
    published: (local: string, upstream: string) =>
      sentence`Published ${named(local)} as ${named(upstream)}`,
    behind: (local: string, upstream: string) =>
      sentence`${named(local)} is behind ${named(upstream)}, with nothing to push`,
    cannotPushDiverged: (local: string, upstream: string) =>
      sentence`${named(local)} has diverged from ${named(upstream)}, so pushing it would drop commits there`,
    remoteMovedOn: (local: string, upstream: string) =>
      sentence`${named(upstream)} has new commits on the remote that ${named(local)} lacks, so it wasn't pushed`,
    noRemote: (local: string) =>
      sentence`${named(local)} has no upstream, and there's no remote to push it to`,
    severalRemotes: (local: string) =>
      sentence`${named(local)} has no upstream, and with several remotes, it's unclear which to push it to`,
    localUpstream: (local: string, upstream: string) =>
      sentence`${named(local)} tracks the local branch ${named(upstream)}, so it has no remote to push to`,
    upstreamOtherName: (local: string, upstream: string) =>
      sentence`${named(local)} tracks ${named(upstream)}, which has another name, so it wasn't pushed, as ${named('git push')} wouldn't push it either`,
    pushesNothing: (local: string) =>
      sentence`With your push settings, ${named('git push')} wouldn't push ${named(local)}, so it wasn't pushed either`,
    couldNotPush: (reason: string) => `Couldn't push. ${reason}`,
    tagAlreadyOnRemote: (tag: string, remote: string) =>
      sentence`${named(tag)} is already on ${named(remote)}`,
    pushedTag: (tag: string, remote: string) =>
      sentence`Pushed tag ${named(tag)} to ${named(remote)}`,
    tagElsewhere: (tag: string, remote: string) =>
      sentence`${named(remote)} already has a tag ${named(tag)} on another commit, so it wasn't pushed`,
    noTagRemote: (tag: string, branch: string | undefined) =>
      branch === undefined
        ? sentence`With several remotes, and no branch checked out, it's unclear where to push ${named(tag)}`
        : sentence`With several remotes, and ${named(branch)} tracking none of them, it's unclear where to push ${named(tag)}`,
    upToDate: (version: string) => `${brand} ${version} is up to date`,
    downloadingUpdate: (version: string) => `Downloading ${brand} ${version}`,
    updateReady: (version: string) =>
      `${brand} ${version} is downloaded. Restart from the ${brand} icon at the top left to update now, or it updates when you quit.`,
    updateAvailable: (version: string) =>
      `${brand} ${version} is out. Download it from the ${brand} icon at the top left.`,
    couldNotCheckForUpdates: (reason: string) =>
      `Couldn't check for updates. ${reason}`,
    couldNotDownloadUpdate: (version: string, reason: string) =>
      `Couldn't download ${brand} ${version}. ${reason}`,
    couldNotInstallUpdate: (version: string, reason: string) =>
      `Couldn't install ${brand} ${version}. ${reason}`,
    offerCommand: sentence`Type ${named('ff')} in a terminal to open the repository of the folder you are in. Install it from the ${brand} icon at the top left.`,
    commandInstalled: (file: string) =>
      sentence`Installed ${named('ff')} as ${namedFile(file)}. Type ${named('ff')} in a terminal to open the repository of the folder you are in.`,
    commandOffPath: (file: string, folder: string) =>
      sentence`Installed ${named('ff')} as ${namedFile(file)}, but ${namedFolder(folder)} is not on your PATH, so add it there to type ${named('ff')} in a terminal`,
    commandAlreadyInstalled: (file: string) =>
      sentence`${named('ff')} is already installed as ${namedFile(file)}`,
    commandTaken: (file: string) =>
      sentence`${namedFile(file)} is not from ${brand}, so ${named('ff')} was not installed there`,
    commandNotMoved: sentence`Move ${brand} into the Applications folder and start it from there to install ${named('ff')}, as macOS runs it from a temporary copy now`,
    couldNotInstallCommand: (reason: Sentence) =>
      sentence`Couldn't install ${named('ff')}. ${reason}`,
    cannotUpdate: `Only a copy of ${brand} set up by its installer can update itself`,
    detachedUpstream:
      'The checked-out commit is on no branch, so it has no upstream',
    noUpstream: (branch: string) => sentence`${named(branch)} has no upstream`,
    upstreamGone: (upstream: string, branch: string) =>
      sentence`${named(upstream)}, the upstream of ${named(branch)}, doesn't exist anymore`,
    upstreamHidden: (upstream: string) =>
      sentence`${named(upstream)} is not in the history while Solo shows only that of the checked-out commit`,
  },
  state: {
    unreadable: (reason: string) =>
      `The saved state could not be read, so changes to it are kept until it can be: ${reason}`,
    putAside: (copy: string) =>
      sentence`The saved state was broken, so it was put aside as ${namedFile(copy)} and starts afresh`,
    notPutAside: (reason: string) =>
      `The saved state was broken and could not be put aside, so it starts afresh: ${reason}`,
  },
  settings: {
    notObject: 'The user settings are not a JSON object',
    unreadable: (reason: string) =>
      `The user settings could not be read: ${reason}`,
    invalid: (reason: string) =>
      `The user settings are not valid JSON: ${reason}`,
    unknown: (name: string) => sentence`Unknown setting ${named(name)}`,
    missing: (name: string) => sentence`Missing setting ${named(name)}`,
    shouldBe: {
      boolean: (name: string) => sentence`${named(name)} should be a boolean`,
      number: (name: string) => sentence`${named(name)} should be a number`,
      string: (name: string) => sentence`${named(name)} should be a string`,
      object: (name: string) => sentence`${named(name)} should be an object`,
      list: (name: string) => sentence`${named(name)} should be a list`,
    },
    shouldBeListOf: {
      boolean: (name: string) =>
        sentence`${named(name)} should be a list of booleans`,
      number: (name: string) =>
        sentence`${named(name)} should be a list of numbers`,
      string: (name: string) =>
        sentence`${named(name)} should be a list of strings`,
      object: (name: string) =>
        sentence`${named(name)} should be a list of objects`,
    },
    notCssValue: (name: string) =>
      sentence`${named(name)} should be a value CSS takes, its brackets and quotes closed, with no ${namesBetween([';', '{', '}', '\\', '/*'], ' ')} or control character`,
    shouldBeOneOf: (name: string, choices: readonly string[]) =>
      sentence`${named(name)} should be ${namesBetween(choices, ' or ')}`,
    fileColorTwice: (extension: string, first: number, again: number) =>
      sentence`${named(`tools.commander.fileColors[${again}]`)} lists ${named(extension)}, which ${named(`tools.commander.fileColors[${first}]`)} lists already, so the earlier one colors it`,
    fileColorLanguagesTwice: (first: number, again: number) =>
      sentence`${named(`tools.commander.fileColors[${again}]`)} colors the languages, which ${named(`tools.commander.fileColors[${first}]`)} colors already, so the earlier one colors them`,
    fileColorExecutablesTwice: (first: number, again: number) =>
      sentence`${named(`tools.commander.fileColors[${again}]`)} colors the executables, which ${named(`tools.commander.fileColors[${first}]`)} colors already, so the earlier one colors them`,
    shouldBeListOrOneOf: (name: string, choices: readonly string[]) =>
      sentence`${named(name)} should be a list of strings or ${namesBetween(choices, ' or ')}`,
    fileColorEmpty: (group: number) =>
      sentence`${named(`tools.commander.fileColors[${group}].extensions`)} lists an empty extension, which colors nothing`,
  },
  errors: {
    storeOutsideProvider: (store: string) =>
      `The ${store} store was read outside the component that hands it out`,
    gitFailed: (command: string, said: string) =>
      `git ${command} failed: ${said}`,
    gitExited: (command: string, code: number | null) =>
      `git ${command} failed: it exited with code ${code}`,
    gitStoppedBy: (command: string, signal: string) =>
      `git ${command} failed: it was stopped by ${signal}`,
    gitOutputTooLarge: (command: string, megabytes: number) =>
      `git ${command} failed: it printed over ${megabytes} MB`,
    runningGitEnded: 'The git kept running stopped',
    runningGitTimedOut: 'The git kept running did not answer in time',
    runningGitOutOfStep: 'The git kept running answered for another request',
    gitStarterStopped: 'the thread that starts git stopped',
    commitReaderStopped: 'the thread that reads the history stopped',
    sizeWorkerStopped: 'the thread that counts the sizes of folders stopped',
    sizeWorkersClosed: 'the threads that count the sizes of folders are closed',
    pushStalled: (seconds: number) =>
      `git push printed nothing for ${seconds} seconds, so it was stopped`,
    fetchStalled: (seconds: number) =>
      `git fetch printed nothing for ${seconds} seconds, so it was stopped`,
    cloneStalled: (seconds: number) =>
      `git clone printed nothing for ${seconds} seconds, so it was stopped`,
    outsideRepository: (path: string) => `${path} is outside the repository`,
    notInCommit: (path: string, hash: string) => `${path} is not in ${hash}`,
    notObject: (file: string) => `${file} is not a JSON object`,
    commandScriptMissing: (file: string) =>
      `The ff of ${brand} is missing from ${file}`,
    notFound: 'Not found',
  },
  log: {
    started: (
      version: string,
      platform: string,
      arch: string,
      electron: string,
    ) => `${brand} ${version} on ${platform} ${arch}, Electron ${electron}`,
    usingGit: (version: string, path: string) =>
      `Using git ${version} at ${path}`,
    settingsChanged: 'Settings changed, reloading',
    watchingSettingsFailed: 'Watching the settings failed',
    watchingBuildFailed: 'Watching the build failed',
    writingShellIntegrationFailed:
      'Writing the .zshenv that has zsh tell its folder failed, so zsh starts without it',
    rebuiltDefaultsFailed: 'Reading the rebuilt default settings failed',
    updater: (message: string) => `Updater: ${message}`,
    updateFailed: 'Updating failed',
    pageNotLoaded: 'The page did not finish loading',
    coloringWindowButtonsFailed: 'Coloring the window buttons failed',
    childGone: (kind: string, reason: string, exitCode: number) =>
      `The ${kind} process is gone (${reason}, exit code ${exitCode})`,
    windowClosed: (id: string) => `Window ${id} closed`,
    quitting: 'Quitting',
    pageGone: (reason: string, exitCode: number) =>
      `The page's process is gone (${reason}, exit code ${exitCode}), loading the page again`,
    pageGoneAgain: (reason: string, exitCode: number) =>
      `The page's process is gone again (${reason}, exit code ${exitCode}) within a minute of loading the page again, so it is left blank`,
    webview: (message: string) => `Webview: ${message}`,
    layout: (
      width: number,
      height: number,
      ratio: number,
      body: number,
      bar: number,
      list: number,
    ) =>
      `layout: window ${width}x${height}, dpr ${ratio}, body ${body}, tab bar ${bar}, tab list ${list}`,
    handlingFailed: (type: string) => `Handling ${type} from the page failed`,
    refreshingFailed: 'Refreshing the tab failed',
    readingImageFailed: (path: string) => `Reading the image ${path} failed`,
    openingFailed: (folder: string) => `Opening ${folder} failed`,
    initialized: (folder: string) => `Initialized a repository in ${folder}`,
    initFailed: (folder: string) => `Initing a repository in ${folder} failed`,
    cloning: (url: string, target: string) => `Cloning ${url} into ${target}`,
    cloned: (url: string, target: string) => `Cloned ${url} into ${target}`,
    cloneFailed: (url: string) => `Cloning ${url} failed`,
    cloneStopped: (url: string) => `Stopped cloning ${url}`,
    removingCloneFailed: (target: string) =>
      `Removing what was cloned into ${target} failed`,
    openingAsked: (folders: string) =>
      `Asked from the command line to open ${folders}`,
    checkingCommandFailed: 'Checking the ff command failed',
    installingCommandFailed: 'Installing the ff command failed',
    pointedCommand: (file: string) => `Pointed ${file} at this AppImage`,
    pointingCommandFailed: 'Pointing the ff command at this AppImage failed',
    pointedCommandAtUpdate: (file: string) =>
      `Pointed ${file} at the updated AppImage`,
    pointingCommandAtUpdateFailed:
      'Pointing the ff command at the updated AppImage failed',
    addingExplorerMenuFailed: `Adding Open in ${brand} to the Explorer menu failed`,
    openingAskedFailed:
      'Opening the folders asked for from the command line failed',
    tabOpen: (root: string) => `Tab ${root} is open`,
    showingTabFailed: (root: string) => `Showing tab ${root} failed`,
    tabShownAsLeft: (root: string) => `Tab ${root} is shown as it was left`,
    listingWorktreesFailed: (repository: string) =>
      `Listing the worktrees of ${repository} failed`,
    savingFailed: 'Saving the state failed',
    preloading: (root: string) => `Preloading tab ${root}`,
    preloadingFailed: (root: string) => `Preloading tab ${root} failed`,
    watchingFailed: (root: string) => `Watching ${root} failed`,
    navigationFailed: 'Loading the navigation failed',
    recentHistoryFailed: 'Listing the newest commits first failed',
    refsKept: 'Refs changed, keeping the history',
    refsReloaded: 'Refs changed, reloading the history',
    refsExtended: (count: number) =>
      count === 1
        ? 'Refs changed, adding 1 new commit to the history'
        : `Refs changed, adding ${count} new commits to the history`,
    laidOut: (shown: number, total: number, milliseconds: number) =>
      `Graph of ${shown} of ${total} commits laid out in ${milliseconds} ms`,
    checkedOut: {
      branch: (name: string) => `Checked out branch ${name}`,
      tag: (name: string) => `Checked out tag ${name}`,
      commit: (hash: string) => `Checked out commit ${hash}`,
    },
    checkedOutNewBranch: (name: string, remote: string) =>
      `Checked out new branch ${name} tracking ${remote}`,
    checkoutFailed: {
      branch: (name: string) => `Checking out branch ${name} failed`,
      remote: (name: string) => `Checking out remote branch ${name} failed`,
      tag: (name: string) => `Checking out tag ${name} failed`,
      commit: (hash: string) => `Checking out commit ${hash} failed`,
    },
    listingLeftBehindFailed:
      'Listing the commits a checkout left behind failed',
    diverged: (local: string, remote: string) =>
      `${local} and ${remote} have diverged, not fast-forwarding`,
    notCheckedOut: (local: string) =>
      `${local} is no longer checked out, not fast-forwarding`,
    fastForwarded: (local: string, remote: string) =>
      `Fast-forwarded ${local} to ${remote}`,
    fastForwardFailed: (local: string, remote: string) =>
      `Fast-forwarding ${local} to ${remote} failed`,
    fetched: 'Fetched every remote',
    fetchFailed: 'Fetching every remote failed',
    pullFailed: 'Pulling failed',
    pushFailed: 'Pushing failed',
    terminalHostStopped: (code: number) =>
      `The terminal process stopped with exit code ${code}`,
    terminalHost: (line: string) => `Terminal process: ${line}`,
    transferHost: (line: string) => `Copying process: ${line}`,
    listingRemoteTagsFailed: (reason: string) =>
      `Listing the remotes to read their tags failed: ${reason}`,
    listingTagsOfRemoteFailed: (remote: string, reason: string) =>
      `Listing the tags of ${remote} failed: ${reason}`,
  },
};
