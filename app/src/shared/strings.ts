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
  return kilobytes < 1024
    ? `${kilobytes.toFixed(1)} KB`
    : `${(kilobytes / 1024).toFixed(1)} MB`;
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
    open: 'Open',
    crashed: (error: string) => `Something went wrong: ${error}`,
    reload: 'Reload',
    noRepository:
      'No repository is open. Use + to open one. The app menu is at the top right.',
    explorerMenuEntry: `Open in ${brand}`,
  },
  common: {
    close: 'Close',
    gone: (name: string) => `${name} doesn't exist anymore`,
    fromTo: (from: string, to: string) => `${from} → ${to}`,
    fromToWithin: (start: string, from: string, to: string, end: string) =>
      `${start}{${from} → ${to}}${end}`,
  },
  symbols: {
    checked: '✓',
    submenu: '▸',
    open: '▾',
    closed: '▸',
    hunk: '⋯',
    hiddenLeft: '‹',
    hiddenRight: '›',
    breaks: '↵',
    space: '·',
    tab: '→',
    carriageReturn: '␍',
    nonBreakingSpace: '⍽',
    invisible: '¤',
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
  tabs: {
    repositories: 'Repositories',
    worktrees: 'Worktrees',
    browse: 'Browse...',
    removeRecent: (name: string) => `Remove ${name} from this list`,
    label: (name: string, folder?: string) =>
      folder === undefined ? name : `${name} (${folder})`,
    settings: 'Settings',
    sort: 'Sort Tabs A-Z',
    sortAutomatically: 'Sort Tabs A-Z Automatically',
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
    openRepository: 'Open a repository',
    repository: 'Next or previous repository',
    worktree: 'Next or previous worktree',
    closeRepository: 'Close a repository',
    moveRepository: 'Move a repository among the tabs',
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
    about: 'Show About',
    devTools: 'Developer tools',
    close: 'Close a menu or popup',
    dialogFocus: 'Move between the controls of a popup',
    menuItem: 'Move in a menu',
    removeItem: 'Remove a recent repository from the menu',
    submenu: 'Open a submenu, or go back from it',
    result: 'Move in the search results',
    go: 'Go to the search result',
    drag: 'Drag a scrollbar or the minimap',
  },
  shortcuts: {
    title: 'Shortcuts',
    joiner: '+',
    note: 'The arrows, PgUp, PgDn, Home, End and Esc work in every list and popup.',
    groups: {
      Repositories: 'Repositories',
      Moving: 'Moving around the commits',
      Commits: 'Commits',
      Messages: 'Commit messages',
      Columns: 'Columns',
      Files: 'Files',
      Diff: 'Diff',
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
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    Click: 'Click',
    MiddleClick: 'Middle-click',
    Drag: 'Drag',
    BackButton: 'Mouse Back',
    ForwardButton: 'Mouse Forward',
    Wheel: 'Wheel',
    Hover: 'Hover',
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
    showEntireFile: 'Show the Entire File',
    pinEntire: 'Pin Entire Files',
    showWhitespace: 'Show Whitespace',
    showWhitespaceChanges: 'Show Whitespace Changes',
    wrap: 'Wrap Long Lines',
    layout: 'Layout',
    inline: 'Inline',
    sideBySide: 'Side by Side',
    unchanged: 'Unchanged',
    showHiddenChange: 'Show the Hidden Change',
    show: 'Show',
    binary: 'Binary file',
    binaryOrLarge: 'Binary or very large file',
    emptyFile: 'Empty file',
    onlyWhitespace: 'Only whitespace changed',
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
    showImage: 'Show the Image',
    showPreview: 'Show the Preview',
    largeFile: 'Large file',
    notLoaded: 'Not loaded',
    largeDiff: (lines: number) =>
      `Large diff: ${lines.toLocaleString()} changed lines`,
    notLoadedLines: (lines: number) =>
      `Not loaded: ${lines.toLocaleString()} changed lines`,
  },
  find: {
    title: 'Search the diff',
    placeholder: 'Search…',
    unsearched: (count: number) =>
      `Large files not shown yet are not searched: ${count}`,
    previous: 'Previous Match',
    next: 'Next Match',
    noResults: 'No results',
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
    notRepository: (root: string) => `${root} is not a git repository`,
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
      `${brand} ${version} is downloaded. Restart from the menu at the top right to update now, or it updates when you quit.`,
    updateAvailable: (version: string) =>
      `${brand} ${version} is out. Download it from the menu at the top right.`,
    couldNotCheckForUpdates: (reason: string) =>
      `Couldn't check for updates. ${reason}`,
    couldNotDownloadUpdate: (version: string, reason: string) =>
      `Couldn't download ${brand} ${version}. ${reason}`,
    couldNotInstallUpdate: (version: string, reason: string) =>
      `Couldn't install ${brand} ${version}. ${reason}`,
    offerCommand:
      'Type ff in a terminal to open the repository of the folder you are in. Install it from the menu at the top right.',
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
    shouldBeOneOf: (name: string, choices: readonly string[]) =>
      `"${name}" should be ${choices.map((choice) => `"${choice}"`).join(' or ')}`,
  },
  errors: {
    gitFailed: (command: string, said: string) =>
      `git ${command} failed: ${said}`,
    gitExited: (command: string, code: number | null) =>
      `git ${command} failed: it exited with code ${code}`,
    gitStoppedBy: (command: string, signal: string) =>
      `git ${command} failed: it was stopped by ${signal}`,
    gitOutputTooLarge: (command: string, megabytes: number) =>
      `git ${command} failed: it printed over ${megabytes} MB`,
    pushStalled: (seconds: number) =>
      `git push printed nothing for ${seconds} seconds, so it was stopped`,
    fetchStalled: (seconds: number) =>
      `git fetch printed nothing for ${seconds} seconds, so it was stopped`,
    outsideRepository: (path: string) => `${path} is outside the repository`,
    notInCommit: (path: string, hash: string) => `${path} is not in ${hash}`,
    notObject: (file: string) => `${file} is not a JSON object`,
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
    movedSettings: 'Moved the settings into settings.user.json and state.json',
    settingsChanged: 'Settings changed, reloading',
    watchingSettingsFailed: 'Watching the settings failed',
    watchingBuildFailed: 'Watching the build failed',
    rebuiltDefaultsFailed: 'Reading the rebuilt default settings failed',
    updater: (message: string) => `Updater: ${message}`,
    updateFailed: 'Updating failed',
    openingFileFailed: (file: string, reason: string) =>
      `Opening ${file} failed: ${reason}`,
    pageNotLoaded: 'The page did not finish loading',
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
    openingAsked: (folders: string) =>
      `Asked from the command line to open ${folders}`,
    checkingCommandFailed: 'Checking the ff command failed',
    installingCommandFailed: 'Installing the ff command failed',
    pointedCommand: (file: string) => `Pointed ${file} at this AppImage`,
    pointingCommandFailed: 'Pointing the ff command at this AppImage failed',
    addingExplorerMenuFailed: `Adding Open in ${brand} to the Explorer menu failed`,
    openingAskedFailed:
      'Opening the folders asked for from the command line failed',
    tabOpen: (root: string) => `Tab ${root} is open`,
    tabShownAsLeft: (root: string) => `Tab ${root} is shown as it was left`,
    groupingFailed: 'Grouping the tabs by repository failed',
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
    listingRemoteTagsFailed: (reason: string) =>
      `Listing the remotes to read their tags failed: ${reason}`,
    listingTagsOfRemoteFailed: (remote: string, reason: string) =>
      `Listing the tags of ${remote} failed: ${reason}`,
  },
};
