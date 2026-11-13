export const brand = 'Fastforward';

type Named = { readonly name: string };

export type Value = Named | { readonly text: string };

export type Line = Value & { readonly label: string };

export type Sentence = string | readonly (string | Named)[];

const labeled = (label: string, value: Value): Line => ({ label, ...value });

const named = (name: string): Named => ({ name });

const namesBetween = (names: readonly string[], between: string) =>
  names.flatMap((name, index) =>
    index === 0 ? [named(name)] : [between, named(name)],
  );

const quoted = (name: string) => `"${name}"`;

const plain = (value: Value) =>
  'name' in value ? quoted(value.name) : value.text;

export const sentencesOf = (
  all: readonly Sentence[],
  between = ' ',
): Sentence =>
  all.reduce<Sentence>(
    (joined, one) =>
      joined === '' ? one : sentence`${joined}${between}${one}`,
    '',
  );

export const plainOf = (said: Sentence): string =>
  typeof said === 'string'
    ? said
    : said
        .map((part) => (typeof part === 'string' ? part : quoted(part.name)))
        .join('');

const partsOf = (piece: Sentence | Value): readonly (string | Named)[] =>
  typeof piece === 'string'
    ? [piece]
    : 'name' in piece
      ? [named(piece.name)]
      : 'text' in piece
        ? [piece.text]
        : piece;

const sentence = (
  texts: TemplateStringsArray,
  ...pieces: readonly (Sentence | Value)[]
): Sentence => {
  const parts = texts
    .flatMap((text, index) => [
      text,
      ...(index < pieces.length ? partsOf(pieces[index]) : []),
    ])
    .reduce<(string | Named)[]>((joined, part) => {
      const last = joined.at(-1);
      if (typeof part === 'string' && typeof last === 'string') {
        joined[joined.length - 1] = last + part;
      } else if (part !== '') {
        joined.push(part);
      }
      return joined;
    }, []);
  return parts.every((part) => typeof part === 'string')
    ? parts.join('')
    : parts;
};

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

const filesIn = (files: number, folders: number) =>
  `${files === 1 ? '1 file' : `${files.toLocaleString()} files`} in ${folders === 1 ? '1 folder' : `${folders.toLocaleString()} folders`}`;

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
    needsGit: `${brand} needs git`,
    installGit: (needed: string) =>
      `Install git ${needed} or later, make sure it is on the PATH, then start ${brand} again.`,
    gitTooOld: (version: string, path: string, needed: string) =>
      `Git ${version} at ${path} is too old. Install git ${needed} or later, then start ${brand} again.`,
    downloadGit: 'Download Git',
    quit: 'Quit',
    openRepositories: 'Open Repositories',
    initRepository: 'Init a Repository',
    init: 'Init',
    cloneInto: 'Clone Into',
    choose: 'Choose',
    openInTerminal: 'Open in Terminal',
    open: 'Open',
    crashed: (error: string) => `Something went wrong: ${error}`,
    reload: 'Reload',
    noTab: `No tab is open. Use + to open one, or click the ${brand} icon at the top left for the menu.`,
    explorerMenuEntry: `Open in ${brand}`,
  },
  common: {
    close: 'Close',
    showWhitespace: 'Show Whitespace',
    wrap: 'Wrap Long Lines',
    language: 'Language',
    findLanguage: 'Find a language',
    findEncoding: 'Find an encoding',
    auto: 'Auto',
    autoChoice: (chosen: string) => `Auto: ${chosen}`,
    plainText: 'Plain Text',
    gone: (name: string) => `${name} doesn't exist anymore`,
    fromTo: (from: string, to: string) => `${from} → ${to}`,
    fromToWithin: (start: string, from: string, to: string, end: string) =>
      `${start}{${from} → ${to}}${end}`,
  },
  symbols: {
    checked: '✓',
    open: '▾',
    closed: '▸',
    hunk: '⋯',
    hiddenLeft: '‹',
    hiddenRight: '›',
    breaks: '↵',
    tab: '→',
    carriageReturn: '␍',
    nonBreakingSpace: '⍽',
    invisible: '¤',
    foldersLeftOut: '…',
    ascending: '▴',
    descending: '▾',
    unsaved: '●',
  },
  about: {
    title: 'About',
    version: (version: string, development: boolean) =>
      `Version ${version}${development ? ' Dev' : ''}`,
    git: (version: string) => `git ${version}`,
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
    copyTitle: 'Copy these lines, as for a bug report',
  },
  tools: {
    terminal: 'Terminal',
    commander: 'Commander',
    git: 'Git',
  },
  openWith: {
    title: 'Open With',
  },
  confirm: {
    closeTitle: 'Close Tab',
    closeTab: (tool: string) =>
      `Are you sure you want to close this ${tool} tab?`,
    closeTabLines: (tab: string) => [labeled('Tab', named(tab))],
    close: 'Close',
    closeWindowTitle: 'Close Window',
    closeWindow: 'Are you sure you want to close this window and its tabs?',
    quitTitle: 'Quit',
    quitApp: `Are you sure you want to quit ${brand}?`,
    quit: 'Quit',
    initTitle: 'Init',
    initInside:
      'This folder is inside another repository. Are you sure you want to init a repository in it?',
    initInsideLines: (folder: string, repository: string) => [
      labeled('Folder', named(folder)),
      labeled('Repository', named(repository)),
    ],
    init: 'Init',
    saveTitle: 'Unsaved Changes',
    saveFile: 'Save the changes to this file before closing it?',
    saveWindowFiles:
      'Save the changes to these files before closing the window?',
    saveQuitFiles: `Save the changes to these files before quitting ${brand}?`,
    filesLines: (names: readonly string[]) =>
      names.map((name) => labeled('File', named(name))),
    save: 'Save',
    saveAll: 'Save All',
    dontSave: "Don't Save",
    cancel: 'Cancel',
    ok: 'OK',
  },
  tabs: {
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
    search: 'Search branches, remotes, tags and commits',
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
    drag: 'Drag a scrollbar or the minimap',
    copySelection: 'Copy the selection',
    paste: 'Paste',
    leftToApp: 'Go to the app rather than the shell',
    side: 'Go to the other side',
    openFolder: 'Open the selected folder, or the selected file in its app',
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
    viewFile: 'View the selected file in a tab of its own',
    editFile: 'Edit the selected file in a tab of its own',
    saveFile: 'Save the file',
    undo: 'Undo the last change',
    redo: 'Redo the change undone last',
    newLine: 'Start a new line, indented as the one before',
    indent: 'Indent the lines selected, or less',
    toggleComment: 'Comment the lines selected out, or back in',
    moveLines: 'Move the lines selected up or down',
    goToLine: 'Go to a line by its number',
    addCursor: 'Add a cursor where clicked',
    columnSelection: 'Select a column, a cursor on each line',
    nextOccurrence: 'Select the next occurrence of the selection too',
    cursorRows: 'Add a cursor on the line above or below',
    singleCursor: 'Leave one cursor, and let Tab then move the focus on',
    replaceInFile: 'Replace in the file',
    dialogButton: 'Move between the buttons of a dialog',
    newFolder: 'Make a folder in the folder of the side',
    newFile: 'Edit a new file in the folder of the side, made once saved',
    renameItem: 'Rename the selected file or folder',
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
    closeViewer: 'Close the file being viewed',
    closeCompare: 'Close the files being compared',
    viewAs: 'View the file as hex, text or a preview',
    scrollFile: 'Scroll by a row, a page, or to the start or end',
    rowEnd: 'Move to the end of the row, or select up to it',
    scrollSideways: 'Scroll sideways',
    chooseEncoding: 'Choose the encoding of the text',
    chooseLanguage: 'Choose the language the text is colored in',
    findInFile: 'Search the file',
    viewDiffFile: 'View the file shown in a tab of its own',
    zoomPdf: 'Zoom a PDF in or out',
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
    note: 'Ctrl+Tab and Ctrl+Shift+Tab show the other tools, and ↑ and ↓ go through the groups.',
    filter: 'Filter by words or keys',
    noMatches: 'No shortcut here has all of these words.',
    tools: 'Tools',
    viewer: 'File viewer',
    editor: 'Editor',
    everywhere: 'Every tab',
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
    history: {
      back: 'Back; hold or right-click for the history',
      forward: 'Forward; hold or right-click for the history',
    },
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
      minutes === 1 ? 'Fetch Every Minute' : `Fetch Every ${minutes} Minutes`,
  },
  search: {
    placeholder: 'Search…',
    locations: 'Locations',
    localBranches: 'Local branches',
    remoteBranches: 'Remote branches',
    tags: 'Tags',
    stashes: 'Stashes',
    commits: 'Commits',
    bookmarks: 'Bookmarks',
    lookingUp: (hash: string) => sentence`Looking for commit ${named(hash)}…`,
    searching: 'Searching commits…',
    noCommitStartsWith: (hash: string) =>
      sentence`No commit starts with ${named(hash)}`,
    commitsStartWith: (count: number, hash: string) =>
      sentence`${String(count)} commits start with ${named(hash)}`,
    more: (count: number) => `${count} more; type more to narrow it down`,
    moreCommits: 'More commits match; type more to narrow it down',
    moreInFolder: (count: number) => `${count} more; type to narrow them down`,
    noMatches: 'No matches',
    none: 'None',
  },
  commits: {
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
    settings: 'Commit list settings',
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
    noChanges: 'No changes',
    noDifferences: 'No differences, both have the same files',
    showAll: 'Show All Files',
    collapseAll: 'Collapse All',
    expandAll: 'Expand All',
    allChanges: 'All Changes',
    staged: 'Staged',
    unstaged: 'Unstaged',
    search: 'Search files',
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
    change: (status: string, path: string) => `${status}: ${path}`,
  },
  diff: {
    viewMissing: (file: string) =>
      sentence`${named(file)} isn't there to view.`,
    viewTooLarge: (file: string) =>
      sentence`${named(file)} is too large to view.`,
    couldNotView: (file: string, reason: Sentence) =>
      sentence`Couldn't view ${named(file)}. ${reason}`,
    showEntireFile: 'Show the Entire File',
    showWhitespaceChanges: 'Show Whitespace Changes',
    layout: 'Layout',
    inline: 'Inline',
    sideBySide: 'Side by Side',
    unchanged: 'Unchanged',
    showHiddenChange: 'Show the Hidden Change',
    show: 'Show',
    binary: 'Binary file',
    binaryOrLarge: 'Binary or very large file',
    emptyFile: 'Empty file',
    diagram: 'Diagram',
    diagramFailed: 'This diagram could not be drawn.',
    onlyWhitespace: 'Only whitespace changed',
    filesIdentical: 'The files are the same.',
    filesDifferInWhitespace: 'The files differ only in whitespace.',
    noNewlineAtEnd: 'No newline at end of file',
    renamedWithoutChanges: 'Renamed without changes',
    copiedWithoutChanges: 'Copied without changes',
    modeChanged: (from: string, to: string) =>
      `Mode changed from ${from} to ${to}`,
    symbolicLink: (target: string) =>
      sentence`Symbolic link to ${named(target)}`,
    imageDetails: (width: number, height: number, bytes: number) =>
      `${width} × ${height} · ${fileSize(bytes)}`,
    imageTooLarge: (megabytes: number) =>
      `Images over ${megabytes} MB are not previewed`,
    imageFailed: "Couldn't show this image",
    viewFile: 'View the File in a Tab of Its Own',
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
    into: (target: string) => sentence`Clones into ${named(target)}`,
    clone: 'Clone',
    stop: 'Stop',
    cloning: (url: string) => sentence`Cloning ${named(url)}`,
    intoTarget: (target: string) => sentence`into ${named(target)}`,
    connecting: 'Connecting',
    percent: (percent: number) => `${percent}%`,
    noUrl: 'Paste the URL of the repository to clone',
    urlOneLine: 'The URL must be one line',
    urlDash: "The URL can't start with -",
    urlExt: "ext:: URLs run commands, so they aren't cloned",
    noName: 'Name the folder to clone into',
    badName: (name: string) =>
      sentence`${named(name)} can't be the name of a folder`,
    notFullPath: (folder: string) =>
      sentence`${named(folder)} is not a full path`,
    noFolder: (folder: string) => sentence`${named(folder)} is not a folder`,
    taken: (target: string) =>
      sentence`${named(target)} already exists and isn't an empty folder`,
  },
  terminal: {
    newTab: 'New',
    exited: (code: number) =>
      `The shell exited with code ${code}. Press Enter to start a new one.`,
    couldNotStart: (shell: string, reason: string) =>
      `Couldn't start ${shell}. ${reason} Press Enter to try again.`,
    stopped:
      'The terminal process stopped, so the shell did too. Press Enter to start a new one.',
  },
  commander: {
    openFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be opened: ${reason}`,
    deleteFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be deleted: ${reason}`,
    notArchive: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be opened as an archive: ${reason}`,
    openWithSevenZip: 'Open with 7-Zip...',
    readingArchive: (name: string) => sentence`Reading ${named(name)}…`,
    passwordTitle: 'Password',
    passwordAsked: 'The archive is encrypted. Type its password.',
    passwordWrong: 'The password is wrong. Type it again.',
    archiveLines: (archive: string) => [labeled('Archive', named(archive))],
    passwordLabel: 'Password',
    passwordOpen: 'Open',
    noPassword: 'No password is typed.',
    zipPasswordAscii:
      "A zip's password can hold only the letters, digits and signs of English, as 7-Zip writes no other into a zip.",
    nothingTakenOut: '7-Zip took nothing out.',
    quitStopsTransfers:
      'A copy, a move or a change of an archive is still running, and quitting stops it unfinished.',
    quitDropsChanges:
      'A file opened from an archive was changed and not put back yet, and quitting deletes the change.',
    lineBreakInName:
      "7-Zip can't be told the name of an item that holds a line break.",
    namesAlike: (name: string) =>
      sentence`More than one of the files is named ${named(name)}, and only one of them can go into a folder.`,
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
    trashItem: (bin: string) => `Move to ${bin}?`,
    trashItems: (what: string, bin: string) => `Move ${what} to ${bin}?`,
    deleteItem: 'Delete permanently? This cannot be undone.',
    deleteItems: (what: string) =>
      `Delete ${what} permanently? This cannot be undone.`,
    binOffItem:
      'The Recycle Bin of this drive is turned off. Delete permanently? This cannot be undone.',
    binOffItems: (what: string) =>
      `The Recycle Bin of this drive is turned off. Delete ${what} permanently? This cannot be undone.`,
    itemLines: (name: string) => [labeled('Item', named(name))],
    oneItem: (name: string) => named(name),
    items: (count: number) => `${count} items`,
    copyTitle: 'Copy',
    moveTitle: 'Move',
    transferLines: (move: boolean, what: Value, target: string) => [
      labeled(move ? 'Move' : 'Copy', what),
      labeled('To', named(target)),
    ],
    copying: (what: Value, target: string) => [
      labeled('Copying', what),
      labeled('To', named(target)),
    ],
    moving: (what: Value, target: string) => [
      labeled('Moving', what),
      labeled('To', named(target)),
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
    clashQuestion: (what: Value) => sentence`${what} is there already.`,
    clashCopying: 'Copying',
    clashMoving: 'Moving',
    clashThere: 'There now',
    clashReadOnly: 'The file there is read-only; Overwrite replaces it anyway.',
    clashDetails: (bytes: number, date: string) =>
      `${fileSize(bytes)}, modified ${date}`,
    overwrite: 'Overwrite',
    skip: 'Skip',
    keepBoth: 'Keep Both',
    forTheRest: 'Do the same for the rest',
    copied: (what: Value | string, target: string) =>
      sentence`Copied ${what} to ${named(target)}`,
    moved: (what: Value | string, target: string) =>
      sentence`Moved ${what} to ${named(target)}`,
    copyFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be copied: ${reason}`,
    moveFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be moved: ${reason}`,
    copyFailedMany: (count: number, name: string, reason: Sentence) =>
      sentence`${String(count)} items could not be copied, among them ${named(name)}: ${reason}`,
    moveFailedMany: (count: number, name: string, reason: Sentence) =>
      sentence`${String(count)} items could not be moved, among them ${named(name)}: ${reason}`,
    alreadyIn: (target: string) =>
      sentence`The items are in ${named(target)} already.`,
    nothingToPaste: 'The clipboard holds no files to paste.',
    dropCopy: 'Copy Here',
    dropMove: 'Move Here',
    dropCopyTitle: (what: Value, target: string) =>
      `Copy ${plain(what)} to "${target}"`,
    dropMoveTitle: (what: Value, target: string) =>
      `Move ${plain(what)} to "${target}"`,
    newFolderTitle: 'New Folder',
    newFileTitle: 'New File',
    editNewFile: 'Edit',
    newFolderLines: (folder: string) => [labeled('In', named(folder))],
    newFolderName: 'Name',
    makeFolder: 'Make',
    noName: 'Type the name of the folder.',
    dotName: "A name can't be . or ..",
    nameCantHold: (characters: string) =>
      sentence`A name can't hold ${named(characters)}`,
    reservedName: (name: string) =>
      sentence`Windows keeps the name ${named(name)} for itself.`,
    nameEnd: "A name can't end in a dot or a space on Windows.",
    nameTaken: (name: string) => sentence`${named(name)} is there already.`,
    nameThere: 'An item of that name is there already.',
    makeFolderFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be made: ${reason}`,
    makeFolderAsAdministrator:
      "Folders can't be made yet in a folder read as administrator.",
    renameTitle: 'Rename',
    newName: 'New name',
    renameConfirm: 'Rename',
    goToTitle: 'Go To',
    goToField: 'Path',
    goToConfirm: 'Go',
    goToItem: 'Go To...',
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
    findingDuplicates: 'Looking for duplicates…',
    noDuplicates: 'No duplicates found',
    noPath: 'Type the path to go to.',
    copyPath: 'Copy Path',
    copyPaths: 'Copy Paths',
    copyName: 'Copy Name',
    copyNames: 'Copy Names',
    renameFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be renamed: ${reason}`,
    renameAsAdministrator:
      "Items can't be renamed yet in a folder read as administrator.",
    packAsAdministrator:
      "Items can't be packed yet in a folder read as administrator.",
    intoItself: (name: string) =>
      sentence`${named(name)} can't go into itself or a folder in it.`,
    transferAsAdministrator:
      "Items can't be copied or moved yet in a folder read as administrator.",
    packTitle: 'Pack',
    packLines: (what: Value) => [labeled('Pack', what)],
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
      sentence`${named(archive)} is there already, so nothing was packed over it.`,
    archiveThere:
      'An archive of that name is there already; packing replaces it.',
    packConfirm: 'Pack',
    archiveName: 'archive',
    volumeCd: '700 MB, a CD',
    volumeFat32: '4092 MB, the largest file FAT32 holds',
    volumeDvd: '4480 MB, a DVD',
    packingInto: (what: Value, archive: string) => [
      labeled('Packing', what),
      labeled('Into', named(archive)),
    ],
    packed: (what: Value | string, archive: string) =>
      sentence`Packed ${what} into ${named(archive)}`,
    packFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} could not be packed: ${reason}`,
    warnedMore: (count: number) => `And ${count.toLocaleString()} more.`,
    packedWithout: (name: string, reason: Sentence) =>
      sentence`${named(name)} was packed without some of the files: ${reason}`,
    deletingFrom: (what: Value, archive: string) => [
      labeled('Deleting', what),
      labeled('From', named(archive)),
    ],
    deletedFrom: (what: Value | string, archive: string) =>
      sentence`Deleted ${what} from ${named(archive)}`,
    deleteFromFailed: (name: string, reason: Sentence) =>
      sentence`Nothing could be deleted from ${named(name)}: ${reason}`,
    deletingStopped: (archive: string) =>
      sentence`Deleting from ${named(archive)} stopped unexpectedly.`,
    renamingIn: (what: Value, archive: string) => [
      labeled('Renaming', what),
      labeled('In', named(archive)),
    ],
    renamedIn: (what: Value | string, archive: string) =>
      sentence`Renamed ${what} in ${named(archive)}`,
    renameInFailed: (name: string, reason: Sentence) =>
      sentence`Nothing could be renamed in ${named(name)}: ${reason}`,
    renamingStopped: (archive: string) =>
      sentence`Renaming in ${named(archive)} stopped unexpectedly.`,
    makingFolderIn: (what: Value, archive: string) => [
      labeled('Making', what),
      labeled('In', named(archive)),
    ],
    madeFolderIn: (what: Value | string, archive: string) =>
      sentence`Made the folder ${what} in ${named(archive)}`,
    folderInFailed: (name: string, reason: Sentence) =>
      sentence`No folder could be made in ${named(name)}: ${reason}`,
    makingFolderStopped: (archive: string) =>
      sentence`Making a folder in ${named(archive)} stopped unexpectedly.`,
    copyInFailed: (name: string, reason: Sentence) =>
      sentence`Nothing could be copied into ${named(name)}: ${reason}`,
    moveInFailed: (name: string, reason: Sentence) =>
      sentence`Nothing could be moved into ${named(name)}: ${reason}`,
    movedWithout: (name: string, reason: Sentence) =>
      sentence`Not every file could be moved into ${named(name)}: ${reason}`,
    originalsKept: 'Every file moved is kept where it was.',
    keptUnmatched: (name: string, count: number) =>
      count === 1
        ? sentence`A file is kept in ${named(name)}, as 7-Zip took it out under another name, or not at all.`
        : sentence`${count.toLocaleString()} files are kept in ${named(name)}, as 7-Zip took them out under other names, or not at all.`,
    movedOutKept: (name: string, reason: Sentence) =>
      sentence`What was moved out of ${named(name)} is kept in it too, as it could not be deleted from it: ${reason}`,
    movedOutWarned: (name: string, warning: Sentence) =>
      sentence`7-Zip warned while deleting from ${named(name)} what was moved out of it: ${warning}`,
    archiveGone: (name: string) =>
      sentence`${named(name)} is no longer there, so it was not changed.`,
    updateTitle: 'Update the Archive',
    updateAsked:
      'A file was changed since it was taken out of its archive. Put it back into the archive?',
    updateLines: (name: string, archive: string) => [
      labeled('File', named(name)),
      labeled('Archive', named(archive)),
    ],
    updateConfirm: 'Update',
    updateLater: 'Not Now',
    puttingBack: (what: Value) => [labeled('Putting back', what)],
    putBack: (what: Value | string, archive: string) =>
      sentence`Put ${what} back into ${named(archive)}`,
    putBackFailed: (name: string, reason: Sentence) =>
      sentence`Nothing could be put back into ${named(name)}: ${reason}`,
    puttingBackStopped: (archive: string) =>
      sentence`Putting back into ${named(archive)} stopped unexpectedly.`,
    putBackWithout: (name: string, reason: Sentence) =>
      sentence`Not everything could be put back into ${named(name)}: ${reason}`,
    deletingMovedFrom: (name: string) =>
      sentence`Deleting from ${named(name)} what was moved out of it…`,
    thereAlready: (count: number, total: number) =>
      count < total
        ? `${count.toLocaleString()} of them are there already.`
        : total === 1
          ? 'It is there already.'
          : 'They are there already.',
    replace: 'Replace',
    skipThem: 'Skip Them',
    deleteFromArchiveItem:
      'Delete from the archive permanently? This cannot be undone.',
    deleteFromArchiveItems: (what: string) =>
      `Delete ${what} from the archive permanently? This cannot be undone.`,
    testTitle: 'Test',
    testingArchives: (what: Value) => [labeled('Testing', what)],
    testPassed: (what: Value | string) => sentence`${what} passed the test.`,
    testFailed: (name: string, reason: Sentence) =>
      sentence`${named(name)} failed the test: ${reason}`,
    testFailedMany: (count: number, name: string, reason: Sentence) =>
      sentence`${count.toLocaleString()} archives failed the test, among them ${named(name)}: ${reason}`,
    testingStopped: () => 'Testing stopped unexpectedly.',
    noPasswordGiven: 'No password was given.',
    testAsAdministrator:
      "Archives can't be tested yet in a folder read as administrator.",
    archiveTestFailed: (reason: Sentence) =>
      sentence`The archive packed failed its test, so nothing was put in place: ${reason}`,
    archiveInVolumes: (name: string) =>
      sentence`${named(name)} is cut into volumes, which 7-Zip cannot change.`,
    archiveUnchangeable: (name: string) =>
      sentence`${named(name)} cannot be changed yet, as it is inside another archive or a compressed file.`,
    packingStopped: (archive: string) =>
      sentence`Packing into ${named(archive)} stopped unexpectedly.`,
    copyingStopped: (target: string) =>
      sentence`Copying to ${named(target)} stopped unexpectedly.`,
    movingStopped: (target: string) =>
      sentence`Moving to ${named(target)} stopped unexpectedly.`,
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
      sentence`Couldn't open ${named(folder)}. ${reason}`,
    noAccessTitle: 'No Access',
    noAccess: "You don't have access to this folder.",
    folderLines: (folder: string) => [labeled('Folder', named(folder))],
    asAdministrator: 'As Administrator',
    readAsAdministrator: 'Read as administrator',
    openRepository: 'Open the repository in a git tab',
    newTerminalHere: 'New',
    openInGit: 'Open',
    cloneHere: 'Clone...',
    initHere: 'Init',
    editImage: 'Edit Image',
    showMoreOptions: '...',
    showMoreOptionsTitle: 'Show the menu of Windows',
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
    couldNotRead: (file: string, reason: Sentence) =>
      sentence`Couldn't read ${named(file)}. ${reason}`,
    layout: 'Layout',
    layouts: { details: 'Details', thumbnails: 'Thumbnails' },
    groupByColor: 'Group by Color',
    viewAs: 'View as',
    viewText: 'Text',
    viewHex: 'Hex',
    viewPreview: 'Preview',
    realSize: 'Real Size',
    encoding: 'Encoding',
    filterFolder: 'Filter the folder',
    filterPlaceholder: 'Filter…',
    filterCount: (shown: number, total: number) => `${shown} of ${total}`,
    flatView: 'List the files of every folder in it',
    flatReading: (files: number, folders: number) =>
      `Reading ${filesIn(files, folders)}…`,
    flatRead: (files: number, folders: number) => filesIn(files, folders),
    flatStopped: (files: number, folders: number) =>
      `Stopped after ${filesIn(files, folders)}`,
    flatFailed: (count: number) =>
      count === 1
        ? "1 folder couldn't be read"
        : `${count.toLocaleString()} folders couldn't be read`,
    escapeStops: 'Esc stops',
    countingSizes: (folders: number) =>
      folders === 1
        ? 'Counting the size of a folder…'
        : `Counting the sizes of ${folders.toLocaleString()} folders…`,
    unreadUnder: (count: number) =>
      count === 1
        ? "1 folder in it couldn't be read, so it may be larger"
        : `${count.toLocaleString()} folders in it couldn't be read, so it may be larger`,
    findInFile: 'Search the file',
    encodings: {
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
    encodingShort: {
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
    previewTooLarge: (megabytes: number) =>
      `Documents over ${megabytes} MB are not previewed.`,
    nothingToCompare:
      'Mark two files on a side, or select a file on each side, to compare them.',
  },
  editor: {
    tooLarge: (file: string) =>
      sentence`${named(file)} is over 50 MB, too large to edit. F3 views it.`,
    binary: (file: string) =>
      sentence`${named(file)} holds binary data, so it can't be edited as text. F3 views it.`,
    folder: (name: string) =>
      sentence`${named(name)} is a folder. F4 edits files.`,
    inArchive: (name: string) =>
      sentence`${named(name)} is inside an archive, where files can't be edited yet.`,
    asAdministrator: (name: string) =>
      sentence`${named(name)} is in a folder read as administrator, where files can't be edited yet.`,
    couldNotSave: (file: string, reason: Sentence) =>
      sentence`Couldn't save ${named(file)}. ${reason}`,
    noRoom: (file: string) =>
      sentence`Couldn't save ${named(file)}, as its drive hasn't room for it.`,
    unencodable: (
      file: string,
      encoding: string,
      characters: readonly string[],
    ) =>
      sentence`Couldn't save ${named(file)}, as ${encoding} has no ${namesBetween(characters, ', ')}.`,
    readOnly: (file: string) =>
      sentence`${named(file)} is open read-only, so it isn't saved.`,
    changedOutside: (file: string) =>
      sentence`${named(file)} changed on disk while edited here. Saving it writes over those changes.`,
    changedTitle: 'Changed on Disk',
    changedAsked:
      'The file changed on disk since it was opened here. Save over it, or read it again and drop the changes made here?',
    saveOver: 'Save Over It',
    readAgain: 'Read Again',
    askedInTab: (file: string) =>
      sentence`${named(file)} isn't saved: its tab asks what to do.`,
    position: (line: number, column: number) => `Ln ${line}, Col ${column}`,
    cursors: (cursors: number) => `${cursors} cursors`,
    selected: (lines: number, characters: number) =>
      lines > 1
        ? `${lines} lines, ${characters} characters selected`
        : `${characters} ${characters === 1 ? 'character' : 'characters'} selected`,
    between: ' · ',
    goToLineTitle: 'Go to Line',
    lineNumber: (lines: number) => `Line, 1 to ${lines}`,
    goToLine: 'Go',
    noSuchLine: (lines: number) => `Type a line from 1 to ${lines}.`,
    reopenIn: 'Reopen in',
    saveIn: 'Save in',
    encodingTitle: 'Encoding',
    withBom: (encoding: string) => `${encoding} BOM`,
    savedAs: (read: string, saved: string) => `${read} → ${saved}`,
    reopenTitle: 'Reopen',
    reopenAsked:
      'Reopening the file in another encoding drops the changes made here. Reopen it?',
    reopen: 'Reopen',
    endingNames: { lf: 'LF', crlf: 'CRLF', cr: 'CR' },
    mixed: 'Mixed',
    convertTo: (ending: string) => `Convert to ${ending}`,
    endingCounts: (counts: readonly string[], newLines: string) =>
      `${counts.join(', ')}; new lines end in ${newLines}`,
    linesEndingIn: (lines: number, ending: string) =>
      `${lines} ${lines === 1 ? 'line ends' : 'lines end'} in ${ending}`,
    overwriteTitle: 'Read-only file',
    overwriteAsked: 'The file is read-only. Save over it anyway?',
    overwriteLines: (file: string) => [labeled('File', named(file))],
    overwrite: 'Save Anyway',
    unsaved: 'Unsaved changes',
    readOnlyMark: 'Read-only',
    newFile: 'New file, made once saved',
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
    title: 'Search the diff',
    placeholder: 'Search…',
    unsearched: (count: number) =>
      `Large files not shown yet are not searched: ${count}`,
    previous: 'Previous Match',
    next: 'Next Match',
    noResults: 'No results',
    searching: 'Searching…',
    count: (current: number, matches: number, capped: boolean) =>
      `${current} of ${matches}${capped ? '+' : ''}`,
  },
  messages: {
    dismiss: 'Dismiss',
    inTab: (tab: string, message: Sentence) => sentence`${tab}: ${message}`,
    settingsProblem: (problem: Sentence) => sentence`Settings: ${problem}`,
    couldNotOpen: (folder: string, reason: Sentence) =>
      sentence`Couldn't open ${named(folder)}. ${reason}`,
    notInRepository: (folder: string) =>
      sentence`${named(folder)} is not in a git repository`,
    unreachable: "The folder isn't there, or can't be reached.",
    alreadyRepository: (folder: string) =>
      sentence`${named(folder)} is a git repository already, so it was opened`,
    couldNotInit: (folder: string, reason: Sentence) =>
      sentence`Couldn't init a repository in ${named(folder)}. ${reason}`,
    cloned: (url: string, target: string) =>
      sentence`Cloned ${named(url)} into ${named(target)}`,
    couldNotClone: (url: string, reason: Sentence) =>
      sentence`Couldn't clone ${named(url)}. ${reason}`,
    noToolOpens: (folder: string) => sentence`${named(folder)} can't be opened`,
    noFolder: (tool: string) => `${tool} doesn't know which folder it's in`,
    notRepository: (root: string) =>
      sentence`${named(root)} is not a git repository`,
    compareTab: (old: string, changed: string) => `${old} → ${changed}`,
    compareTooLarge: (megabytes: number) =>
      `Files over ${megabytes} MB together are not compared.`,
    couldNotWatchCompared: (old: string, changed: string) =>
      sentence`Couldn't watch ${named(old)} and ${named(changed)}, so their changes won't show until they are compared again`,
    couldNotCompare: (old: string, changed: string, reason: Sentence) =>
      sentence`Couldn't compare ${named(old)} with ${named(changed)}. ${reason}`,
    couldNotWatch: (root: string) =>
      sentence`Couldn't watch ${named(root)}, so changes made outside ${brand} won't show until it is opened again`,
    couldNotCheckOut: (name: string, reason: Sentence) =>
      sentence`Couldn't check out ${named(name)}. ${reason}`,
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
      sentence`Installed ${named('ff')} as ${named(file)}. Type ${named('ff')} in a terminal to open the repository of the folder you are in.`,
    commandOffPath: (file: string, folder: string) =>
      sentence`Installed ${named('ff')} as ${named(file)}, but ${named(folder)} is not on your PATH, so add it there to type ${named('ff')} in a terminal`,
    commandAlreadyInstalled: (file: string) =>
      sentence`${named('ff')} is already installed as ${named(file)}`,
    commandTaken: (file: string) =>
      sentence`${named(file)} is not from ${brand}, so ${named('ff')} was not installed there`,
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
      sentence`The saved state was broken, so it was put aside as ${named(copy)} and starts afresh`,
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
    keptGitEnded: 'The git kept running stopped',
    keptGitTimedOut: 'The git kept running did not answer in time',
    keptGitOutOfStep: 'The git kept running answered for another request',
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
