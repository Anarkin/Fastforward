export const brand = 'Fastforward';

export const strings = {
  app: {
    name: (version: string, development: boolean) =>
      `${brand} ${version}${development ? ' Dev' : ''}`,
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
    noRepository: 'No repository is open. Use + to open one.',
  },
  common: {
    close: 'Close',
    gone: (name: string) => `${name} doesn't exist anymore`,
    fromTo: (from: string, to: string) => `${from} → ${to}`,
  },
  symbols: {
    add: '+',
    checked: '✓',
    submenu: '▸',
    open: '▾',
    closed: '▸',
    hunk: '⋯',
    hiddenLeft: '‹',
    hiddenRight: '›',
  },
  tabs: {
    browse: 'Browse...',
    settings: 'Settings',
    sort: 'Sort A-Z',
    openDefaultSettings: 'Open Default Settings',
    openUserSettings: 'Open User Settings',
    keyboardShortcuts: 'Keyboard Shortcuts',
  },
  actions: {
    openRepository: 'Open a repository',
    repository: 'Next or previous repository',
    worktree: 'Next or previous worktree',
    closeRepository: 'Close a repository',
    head: 'Select the checked-out commit',
    upstream: 'Select the upstream of its branch',
    search: 'Search branches, remotes, tags and commits',
    commits: 'Show or hide the commit list',
    move: 'Move in a list',
    page: 'Move a page, or to either end',
    compare: 'Compare with the commit selected',
    navigate: 'Back or forward',
    column: 'Next or previous column',
    folder: 'Open or close a folder',
    change: 'Next or previous change',
    sideways: 'Scroll sideways',
    wheelSideways: 'Scroll sideways with the wheel',
    wrap: 'Wrap long lines',
    find: 'Find',
    match: 'Next or previous match',
    stopFinding: 'Stop finding',
    shortcuts: 'Show these shortcuts',
    devTools: 'Developer tools',
    close: 'Close a menu or popup',
    menuItem: 'Move in a menu',
    submenu: 'Open a submenu, or go back from it',
    result: 'Move in the search results',
    go: 'Go to the search result',
    drag: 'Drag a scrollbar or the minimap',
  },
  shortcuts: {
    title: 'Shortcuts',
    joiner: '+',
    groups: {
      Tabs: 'Tabs',
      History: 'History',
      Columns: 'Columns',
      Files: 'Files',
      Diff: 'Diff',
      App: 'App',
    },
  },
  keys: {
    Command: '⌘',
    Ctrl: 'Ctrl',
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
    BackButton: 'Mouse Back',
    ForwardButton: 'Mouse Forward',
    Wheel: 'Wheel',
  },
  navigation: {
    history: {
      back: 'Back; hold or right-click for the history',
      forward: 'Forward; hold or right-click for the history',
    },
    fetch: 'Fetch every remote, dropping branches deleted there',
    fetchEvery: (minutes: number) =>
      minutes === 1 ? 'Fetch Every Minute' : `Fetch Every ${minutes} Minutes`,
    stopFetchingEvery: (minutes: number) =>
      minutes === 1
        ? 'Stop Fetching Every Minute'
        : `Stop Fetching Every ${minutes} Minutes`,
  },
  search: {
    placeholder: 'Search…',
    localBranches: 'Local branches',
    remoteBranches: 'Remote branches',
    tags: 'Tags',
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
    uncommitted: 'Uncommitted changes',
    uncommittedSide: 'uncommitted',
    uncommittedChanges: (count: number) =>
      count === 0
        ? 'No uncommitted changes'
        : count === 1
          ? '1 uncommitted change'
          : `${count} uncommitted changes`,
    settings: 'Commit list settings',
    collapseMerges: 'Collapse merge commits',
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
    bookmark: 'Bookmark',
    addBookmark: 'Add bookmark',
    removeBookmark: 'Remove bookmark',
    notInHistory: (hash: string) => `${hash} is not in the history`,
  },
  files: {
    title: 'Files',
    compared: (comparison: string) => `Files: ${comparison}`,
    noChanges: 'No changes',
    noDifferences: 'No differences, both have the same files',
    showAll: 'Show All Files',
    collapseAll: 'Collapse All',
    expandAll: 'Expand All',
    allChanges: 'All Changes',
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
    change: (status: string, path: string) => `${status}: ${path}`,
  },
  diff: {
    pinnedEntire: 'Pinned to Show Entire Files',
    showOnlyChanges: 'Show Only the Changes',
    showEntireFile: 'Show the Entire File',
    pinEntire: 'Pin Entire Files',
    unpinEntire: 'Unpin Entire Files',
    showWhitespace: 'Show Whitespace Changes',
    ignoreWhitespace: 'Ignore Whitespace Changes',
    wrap: 'Wrap Long Lines',
    unwrap: 'Unwrap Long Lines',
    layout: 'Layout',
    inline: 'Inline',
    sideBySide: 'Side by Side',
    unchanged: 'Unchanged',
    showHiddenChange: 'Show the Hidden Change',
    show: 'Show',
    binary: 'Binary file',
    binaryOrLarge: 'Binary or very large file',
    largeFile: 'Large file',
    notLoaded: 'Not loaded',
    largeDiff: (lines: number) =>
      `Large diff: ${lines.toLocaleString()} changed lines`,
    notLoadedLines: (lines: number) =>
      `Not loaded: ${lines.toLocaleString()} changed lines`,
  },
  find: {
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
    couldNotCheckOut: (name: string, reason: string) =>
      `Couldn't check out ${name}. ${reason}`,
    leftBehind: (count: number, hashes: string, more: number) =>
      `Left ${count === 1 ? '1 commit' : `${count} commits`} behind on no branch or tag: ${hashes}${more > 0 ? ` and ${more} more` : ''}`,
    diverged: (local: string, remote: string) =>
      `Switched to ${local}, which has diverged from ${remote}; pull to combine them.`,
    couldNotFastForward: (local: string, remote: string, reason: string) =>
      `Switched to ${local}, but couldn't fast-forward it to ${remote}. ${reason}`,
    couldNotFetch: (reason: string) => `Couldn't fetch. ${reason}`,
    detachedUpstream:
      'The checked-out commit is on no branch, so it has no upstream',
    noUpstream: (branch: string) => `${branch} has no upstream`,
    upstreamGone: (upstream: string, branch: string) =>
      `${upstream}, the upstream of ${branch}, doesn't exist anymore`,
    upstreamHidden: (upstream: string) =>
      `${upstream} is not in the history while Solo shows only that of the checked-out commit`,
  },
  settings: {
    notObject: 'The user settings are not a JSON object',
    unreadable: (reason: string) =>
      `The user settings could not be read: ${reason}`,
    invalid: (reason: string) =>
      `The user settings are not valid JSON: ${reason}`,
    unknown: (name: string) => `Unknown setting "${name}"`,
    shouldBe: (name: string, kind: string) => `"${name}" should be ${kind}`,
    shouldBeOneOf: (name: string, choices: readonly string[]) =>
      `"${name}" should be ${choices.map((choice) => `"${choice}"`).join(' or ')}`,
    kinds: {
      boolean: 'a boolean',
      number: 'a number',
      string: 'a string',
      object: 'an object',
      list: 'a list',
    },
    listsOf: {
      boolean: 'a list of booleans',
      number: 'a list of numbers',
      string: 'a list of strings',
      object: 'a list of objects',
    },
  },
  errors: {
    gitFailed: (command: string, reason: string) =>
      `git ${command} failed: ${reason}`,
    fetchTimedOut: (seconds: number) =>
      `git fetch timed out after ${seconds} seconds`,
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
    updateCheckFailed: 'Checking for updates failed',
    openingFileFailed: (file: string, reason: string) =>
      `Opening ${file} failed: ${reason}`,
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
    failed: (name: string) => `${name} failed`,
    openingFailed: (folder: string) => `Opening ${folder} failed`,
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
    refsKept: 'Refs changed, keeping the history',
    refsReloaded: 'Refs changed, reloading the history',
    laidOut: (shown: number, total: number, milliseconds: number) =>
      `Graph of ${shown} of ${total} commits laid out in ${milliseconds} ms`,
    checkedOut: (kind: string, name: string) => `Checked out ${kind} ${name}`,
    checkoutFailed: (kind: string, name: string) =>
      `Checking out ${kind} ${name} failed`,
    diverged: (local: string, remote: string) =>
      `${local} and ${remote} have diverged, not fast-forwarding`,
    notCheckedOut: (local: string) =>
      `${local} is no longer checked out, not fast-forwarding`,
    fastForwarded: (local: string, remote: string) =>
      `Fast-forwarded ${local} to ${remote}`,
    fastForwardFailed: (local: string, remote: string) =>
      `Fast-forwarding ${local} to ${remote} failed`,
    fetched: 'Fetched every remote',
    fetchFailed: 'fetch failed',
  },
};
