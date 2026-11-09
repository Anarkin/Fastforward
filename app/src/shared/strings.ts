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
    closeTab: (tool: string, tab: string) =>
      `Are you sure you want to close the ${tool} tab "${tab}"?`,
    close: 'Close',
    quitTitle: 'Quit',
    quitApp: `Are you sure you want to quit ${brand}?`,
    quit: 'Quit',
    initTitle: 'Init',
    initInside: (folder: string, repository: string) =>
      `${folder} is inside the repository ${repository}. Are you sure you want to init a repository in it?`,
    init: 'Init',
    cancel: 'Cancel',
    ok: 'OK',
  },
  tabs: {
    tabs: 'Tabs',
    newTab: 'New Tab',
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
    submenu: 'Open a submenu, or go back from it',
    result: 'Move in the search results',
    go: 'Go to the search result',
    drag: 'Drag a scrollbar or the minimap',
    copySelection: 'Copy the selection',
    paste: 'Paste',
    leftToApp: 'Leave the key to the app rather than the shell',
    side: 'Go to the other side',
    openFolder: 'Open the selected folder, or the selected file in its app',
    parentFolder: 'Go up to the parent folder',
    showHidden: 'Show or hide the hidden files',
    layout: 'Show the side as details or as thumbnails',
    groupByColor: 'Group the files of the side by their colors, or stop',
    moveAcross: 'Move to the thumbnail on the left or right',
    drive: 'Choose the drive of the left or right side',
    sort: 'Sort by a column, or reverse the order',
    folderHistory: 'Back or forward through the folders of the side',
    bookmarks:
      'Open the bookmarks of the side, to go to one or to bookmark the folder of the side',
    reread: 'Read the folder of the side again',
    viewFile: 'View the selected file in a tab of its own',
    dialogButton: 'Move between the buttons of a dialog',
    newFolder: 'Make a folder in the folder of the side',
    copyToClipboard:
      'Put the marked items, or the selected one, on the clipboard, to paste them here or into another app',
    pasteFiles: 'Copy the files on the clipboard into the folder of the side',
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
    toggleMark: 'Mark or unmark the selected file and move down',
    markClick: 'Mark or unmark a file, or mark the files up to it',
    openOnSide:
      'Open the selected folder, or the one you are in, on the left or right side',
    flatView:
      'List the files of every folder in the folder of the side, or the folder alone again',
    stopReading: 'Stop reading the folders of the side listed flat',
  },
  shortcuts: {
    title: 'Shortcuts',
    joiner: '+',
    note: 'The arrows, PgUp, PgDn, Home, End and Esc work in every list and popup.',
    groups: {
      Tabs: 'Tabs',
      Worktrees: 'Worktrees',
      Moving: 'Moving around the commits',
      Commits: 'Commits',
      Messages: 'Commit messages',
      Columns: 'Columns',
      Files: 'Files',
      Diff: 'Diff',
      Terminal: 'Terminal',
      Folders: 'Folders',
      Sides: 'Sides',
      Marking: 'Marking files',
      Viewing: 'Viewing and comparing',
      Viewer: 'Viewer',
      App: 'App',
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
    BackButton: 'Mouse Back',
    ForwardButton: 'Mouse Forward',
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
    checkedOut: 'Checked out',
    bookmarks: 'Bookmarks',
    lookingUp: (hash: string) => `Looking for commit ${hash}…`,
    searching: 'Searching commits…',
    noCommitStartsWith: (hash: string) => `No commit starts with ${hash}`,
    commitsStartWith: (count: number, hash: string) =>
      `${count} commits start with ${hash}`,
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
    notInHistory: (hash: string) => `${hash} is not in the history`,
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
    viewMissing: (file: string) => `${file} isn't there to view.`,
    viewTooLarge: (file: string) => `${file} is too large to view.`,
    couldNotView: (file: string, reason: string) =>
      `Couldn't view ${file}. ${reason}`,
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
    symbolicLink: (target: string) => `Symbolic link to ${target}`,
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
    into: (target: string) => `Clones into ${target}`,
    clone: 'Clone',
    stop: 'Stop',
    cloning: (url: string) => `Cloning ${url}`,
    intoTarget: (target: string) => `into ${target}`,
    connecting: 'Connecting',
    percent: (percent: number) => `${percent}%`,
    noUrl: 'Paste the URL of the repository to clone',
    urlOneLine: 'The URL must be one line',
    urlDash: "The URL can't start with -",
    urlExt: "ext:: URLs run commands, so they aren't cloned",
    noName: 'Name the folder to clone into',
    badName: (name: string) => `${name} can't be the name of a folder`,
    notFullPath: (folder: string) => `${folder} is not a full path`,
    noFolder: (folder: string) => `${folder} is not a folder`,
    taken: (target: string) =>
      `${target} already exists and isn't an empty folder`,
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
    openFailed: (name: string, reason: string) =>
      `${name} could not be opened: ${reason}`,
    deleteFailed: (name: string, reason: string) =>
      `${name} could not be deleted: ${reason}`,
    notArchive: (name: string, reason: string) =>
      `${name} could not be opened as an archive: ${reason}`,
    tryEnterArchive: 'Try Enter Archive',
    encryptedInArchive: (name: string) =>
      `${name} is encrypted, and no encrypted file is read from an archive yet.`,
    couldNotExtract: (reason: string) =>
      `Nothing could be taken out of the archive: ${reason}`,
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
    trashQuestion: (what: string, bin: string) => `Move ${what} to ${bin}?`,
    deleteQuestion: (what: string) =>
      `Delete ${what} permanently? This cannot be undone.`,
    binOffQuestion: (what: string) =>
      `The Recycle Bin of this drive is turned off. Delete ${what} permanently? This cannot be undone.`,
    oneItem: (name: string) => `"${name}"`,
    items: (count: number) => `${count} items`,
    copyTitle: 'Copy',
    moveTitle: 'Move',
    copyQuestion: (what: string, target: string) =>
      `Copy ${what} to "${target}"?`,
    moveQuestion: (what: string, target: string) =>
      `Move ${what} to "${target}"?`,
    copying: (what: string, target: string) => `Copying ${what} to "${target}"`,
    moving: (what: string, target: string) => `Moving ${what} to "${target}"`,
    counting: 'Counting the files…',
    transferredFiles: (files: number, total: number) =>
      `${files.toLocaleString()} of ${total.toLocaleString()} files`,
    transferredBytes: (done: number, total: number) =>
      `${fileSize(done)} of ${fileSize(total)}`,
    stopTransfer: 'Stop',
    stoppingTransfer: 'Stopping…',
    clashQuestion: (what: string) => `${what} is there already.`,
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
    copied: (what: string, target: string) => `Copied ${what} to "${target}"`,
    moved: (what: string, target: string) => `Moved ${what} to "${target}"`,
    copyFailed: (name: string, reason: string) =>
      `${name} could not be copied: ${reason}`,
    moveFailed: (name: string, reason: string) =>
      `${name} could not be moved: ${reason}`,
    copyFailedMany: (count: number, name: string, reason: string) =>
      `${count} items could not be copied, among them ${name}: ${reason}`,
    moveFailedMany: (count: number, name: string, reason: string) =>
      `${count} items could not be moved, among them ${name}: ${reason}`,
    alreadyIn: (target: string) => `The items are in "${target}" already.`,
    nothingToPaste: 'The clipboard holds no files to paste.',
    dropCopy: (what: string, target: string) => `Copy ${what} to "${target}"`,
    dropMove: (what: string, target: string) => `Move ${what} to "${target}"`,
    newFolderTitle: 'New Folder',
    newFolderIn: (folder: string) => `Make a folder in "${folder}"`,
    newFolderName: 'Name',
    makeFolder: 'Make',
    noName: 'Type the name of the folder.',
    dotName: "A name can't be . or ..",
    nameCantHold: (characters: string) => `A name can't hold ${characters}`,
    reservedName: (name: string) =>
      `Windows keeps the name ${name} for itself.`,
    nameEnd: "A name can't end in a dot or a space on Windows.",
    nameTaken: (name: string) => `"${name}" is there already.`,
    makeFolderFailed: (name: string, reason: string) =>
      `"${name}" could not be made: ${reason}`,
    makeFolderAsAdministrator:
      "Folders can't be made yet in a folder read as administrator.",
    intoItself: (name: string) =>
      `${name} can't go into itself or a folder in it.`,
    transferAsAdministrator:
      "Items can't be copied or moved yet in a folder read as administrator.",
    copyingStopped: (target: string) =>
      `Copying to "${target}" stopped unexpectedly.`,
    movingStopped: (target: string) =>
      `Moving to "${target}" stopped unexpectedly.`,
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
    couldNotOpen: (folder: string, reason: string) =>
      `Couldn't open ${folder}. ${reason}`,
    noAccessTitle: 'No Access',
    noAccess: (folder: string) => `You don't have access to ${folder}.`,
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
    couldNotRead: (file: string, reason: string) =>
      `Couldn't read ${file}. ${reason}`,
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
    inTab: (tab: string, message: string) => `${tab}: ${message}`,
    settingsProblem: (problem: string) => `Settings: ${problem}`,
    couldNotOpen: (folder: string, reason: string) =>
      `Couldn't open ${folder}. ${reason}`,
    notInRepository: (folder: string) => `${folder} is not in a git repository`,
    alreadyRepository: (folder: string) =>
      `${folder} is a git repository already, so it was opened`,
    couldNotInit: (folder: string, reason: string) =>
      `Couldn't init a repository in ${folder}. ${reason}`,
    cloned: (url: string, target: string) => `Cloned ${url} into ${target}`,
    couldNotClone: (url: string, reason: string) =>
      `Couldn't clone ${url}. ${reason}`,
    noToolOpens: (folder: string) => `${folder} can't be opened`,
    noFolder: (tool: string) => `${tool} doesn't know which folder it's in`,
    notRepository: (root: string) => `${root} is not a git repository`,
    compareTab: (old: string, changed: string) => `${old} → ${changed}`,
    compareTooLarge: (megabytes: number) =>
      `Files over ${megabytes} MB together are not compared.`,
    couldNotWatchCompared: (old: string, changed: string) =>
      `Couldn't watch ${old} and ${changed}, so their changes won't show until they are compared again`,
    couldNotCompare: (old: string, changed: string, reason: string) =>
      `Couldn't compare ${old} with ${changed}. ${reason}`,
    couldNotWatch: (root: string) =>
      `Couldn't watch ${root}, so changes made outside ${brand} won't show until it is opened again`,
    couldNotCheckOut: (name: string, reason: string) =>
      `Couldn't check out ${name}. ${reason}`,
    noRefToCheckOut: (name: string) =>
      `${name} doesn't exist, so it wasn't checked out`,
    leftBehind: (count: number, hashes: readonly string[], more: number) =>
      `Left ${count === 1 ? '1 commit' : `${count} commits`} behind on no branch or tag: ${hashes.join(' ')}${more > 0 ? ` and ${more} more` : ''}`,
    diverged: (local: string, remote: string) =>
      `Switched to ${local}, which has diverged from ${remote}, so it couldn't be fast-forwarded`,
    couldNotFastForward: (local: string, remote: string, reason: string) =>
      `Switched to ${local}, but couldn't fast-forward it to ${remote}. ${reason}`,
    couldNotFetch: (reason: string) => `Couldn't fetch. ${reason}`,
    upToDateWith: (local: string, upstream: string) =>
      `${local} is up to date with ${upstream}`,
    aheadOf: (local: string, upstream: string) =>
      `${local} is ahead of ${upstream}, with nothing to pull`,
    cannotFastForward: (local: string, upstream: string) =>
      `${local} has diverged from ${upstream}, so it can't be fast-forwarded`,
    couldNotPull: (reason: string) => `Couldn't pull. ${reason}`,
    checkedOutElsewhere: (branch: string) =>
      `${branch} is checked out in another worktree, so pull it there`,
    branchInUse: (branch: string) =>
      `${branch} is checked out, or being rebased or bisected, in a worktree, so it wasn't pulled`,
    pushed: (local: string, upstream: string) =>
      `Pushed ${local} to ${upstream}`,
    published: (local: string, upstream: string) =>
      `Published ${local} as ${upstream}`,
    behind: (local: string, upstream: string) =>
      `${local} is behind ${upstream}, with nothing to push`,
    cannotPushDiverged: (local: string, upstream: string) =>
      `${local} has diverged from ${upstream}, so pushing it would drop commits there`,
    remoteMovedOn: (local: string, upstream: string) =>
      `${upstream} has new commits on the remote that ${local} lacks, so it wasn't pushed`,
    noRemote: (local: string) =>
      `${local} has no upstream, and there's no remote to push it to`,
    severalRemotes: (local: string) =>
      `${local} has no upstream, and with several remotes, it's unclear which to push it to`,
    localUpstream: (local: string, upstream: string) =>
      `${local} tracks the local branch ${upstream}, so it has no remote to push to`,
    upstreamOtherName: (local: string, upstream: string) =>
      `${local} tracks ${upstream}, which has another name, so it wasn't pushed, as git push wouldn't push it either`,
    pushesNothing: (local: string) =>
      `With your push settings, git push wouldn't push ${local}, so it wasn't pushed either`,
    couldNotPush: (reason: string) => `Couldn't push. ${reason}`,
    tagAlreadyOnRemote: (tag: string, remote: string) =>
      `${tag} is already on ${remote}`,
    pushedTag: (tag: string, remote: string) =>
      `Pushed tag ${tag} to ${remote}`,
    tagElsewhere: (tag: string, remote: string) =>
      `${remote} already has a tag ${tag} on another commit, so it wasn't pushed`,
    noTagRemote: (tag: string, branch: string | undefined) =>
      branch === undefined
        ? `With several remotes, and no branch checked out, it's unclear where to push ${tag}`
        : `With several remotes, and ${branch} tracking none of them, it's unclear where to push ${tag}`,
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
    offerCommand: `Type ff in a terminal to open the repository of the folder you are in. Install it from the ${brand} icon at the top left.`,
    commandInstalled: (file: string) =>
      `Installed ff as ${file}. Type ff in a terminal to open the repository of the folder you are in.`,
    commandOffPath: (file: string, folder: string) =>
      `Installed ff as ${file}, but ${folder} is not on your PATH, so add it there to type ff in a terminal`,
    commandAlreadyInstalled: (file: string) =>
      `ff is already installed as ${file}`,
    commandTaken: (file: string) =>
      `${file} is not from ${brand}, so ff was not installed there`,
    commandNotMoved: `Move ${brand} into the Applications folder and start it from there to install ff, as macOS runs it from a temporary copy now`,
    couldNotInstallCommand: (reason: string) =>
      `Couldn't install ff. ${reason}`,
    cannotUpdate: `Only a copy of ${brand} set up by its installer can update itself`,
    detachedUpstream:
      'The checked-out commit is on no branch, so it has no upstream',
    noUpstream: (branch: string) => `${branch} has no upstream`,
    upstreamGone: (upstream: string, branch: string) =>
      `${upstream}, the upstream of ${branch}, doesn't exist anymore`,
    upstreamHidden: (upstream: string) =>
      `${upstream} is not in the history while Solo shows only that of the checked-out commit`,
  },
  state: {
    unreadable: (reason: string) =>
      `The saved state could not be read, so changes to it are kept until it can be: ${reason}`,
    putAside: (copy: string) =>
      `The saved state was broken, so it was put aside as ${copy} and starts afresh`,
    notPutAside: (reason: string) =>
      `The saved state was broken and could not be put aside, so it starts afresh: ${reason}`,
  },
  settings: {
    notObject: 'The user settings are not a JSON object',
    unreadable: (reason: string) =>
      `The user settings could not be read: ${reason}`,
    invalid: (reason: string) =>
      `The user settings are not valid JSON: ${reason}`,
    unknown: (name: string) => `Unknown setting "${name}"`,
    missing: (name: string) => `Missing setting "${name}"`,
    shouldBe: {
      boolean: (name: string) => `"${name}" should be a boolean`,
      number: (name: string) => `"${name}" should be a number`,
      string: (name: string) => `"${name}" should be a string`,
      object: (name: string) => `"${name}" should be an object`,
      list: (name: string) => `"${name}" should be a list`,
    },
    shouldBeListOf: {
      boolean: (name: string) => `"${name}" should be a list of booleans`,
      number: (name: string) => `"${name}" should be a list of numbers`,
      string: (name: string) => `"${name}" should be a list of strings`,
      object: (name: string) => `"${name}" should be a list of objects`,
    },
    notCssValue: (name: string) =>
      `${name} should be a value CSS takes, its brackets and quotes closed, with no ; { } \\ /* or control character`,
    shouldBeOneOf: (name: string, choices: readonly string[]) =>
      `"${name}" should be ${choices.map((choice) => `"${choice}"`).join(' or ')}`,
    fileColorTwice: (extension: string, first: number, again: number) =>
      `"tools.commander.fileColors[${again}]" lists "${extension}", which "tools.commander.fileColors[${first}]" lists already, so the earlier one colors it`,
    fileColorLanguagesTwice: (first: number, again: number) =>
      `"tools.commander.fileColors[${again}]" colors the languages, which "tools.commander.fileColors[${first}]" colors already, so the earlier one colors them`,
    fileColorExecutablesTwice: (first: number, again: number) =>
      `"tools.commander.fileColors[${again}]" colors the executables, which "tools.commander.fileColors[${first}]" colors already, so the earlier one colors them`,
    shouldBeListOrOneOf: (name: string, choices: readonly string[]) =>
      `"${name}" should be a list of strings or ${choices.map((choice) => `"${choice}"`).join(' or ')}`,
    fileColorEmpty: (group: number) =>
      `"tools.commander.fileColors[${group}].extensions" lists an empty extension, which colors nothing`,
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
    openingFileFailed: (file: string, reason: string) =>
      `Opening ${file} failed: ${reason}`,
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
