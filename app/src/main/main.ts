import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  powerMonitor,
  protocol,
  screen,
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  findGit,
  minimumGitVersion,
  type GitSearch,
} from '../tools/git/main/cli/locate';
import { foldersHandedOff, foldersOf, handOff } from './commandLine';
import { prettyName, systemOf } from './system';
import {
  keepGitRunningWhile,
  stopRunningGit,
  writesEnded,
} from '../tools/git/main/cli/run';
import { errorLine, fileLog, type Log } from '../shell/main/log';
import { imageRoute } from '../tools/git/shared/images';
import { iconRoute, thumbnailRoute } from '../tools/commander/shared/icons';
import { viewedFileRoute } from '../tools/commander/shared/files';
import { appNameSwitch, titleBarHeight } from '../shell/shared/titleBar';
import {
  keymap,
  pressed,
  pressOfInput,
  setKeyPlatform,
} from '../shell/shared/keymap';
import type { Theme, ToHost, ToWebview } from '../shell/shared/protocol';
import { brand, plainOf, strings } from '../shared/strings';
import {
  readDefaults,
  UserSettings,
  watchSettings,
  writeReadOnly,
  type Settings,
} from '../shell/main/settings';
import {
  JsonFileStore,
  migratedState,
  Storage,
  toolState,
} from '../shell/main/storage';
import { themeCss } from '../shell/main/theme';
import { fileSystemFor } from '../tools/commander/main/fileSystem';
import { systemCodePage } from '../tools/commander/main/codePages';
import { PdfPlaces } from '../tools/commander/main/pdfPlaces';
import { renameUnlessTaken } from '../tools/commander/main/renaming';
import {
  inRepository,
  isRepository,
} from '../tools/commander/main/repositories';
import {
  folderStamp,
  watchFolder,
  watchTree,
} from '../tools/commander/main/watch';
import { isFolder } from '../tools/git/main/cli/repository';
import { Archives, workFolders } from '../tools/commander/main/archives';
import { elevatedFileSystem } from '../tools/commander/main/elevated';
import { helperOf, runHelper } from '../tools/commander/main/helper';
import { CommanderTool, rootFolder } from '../tools/commander/main/tool';
import { hostProcess } from '../tools/terminal/main/hostProcess';
import { transferProcess } from '../tools/commander/main/transferProcess';
import {
  sizeWorkers,
  unpackedKoffi,
} from '../tools/commander/main/sizeWorkers';
import { hashWorkers } from '../tools/commander/main/hashWorkers';
import {
  sevenZipProgram,
  sevenZipReaderAt,
} from '../tools/commander/main/sevenZip';
import {
  readClipboardFiles,
  writeClipboardFiles,
} from '../tools/commander/main/clipboardFiles';
import { writeShellIntegration } from '../tools/terminal/main/shellIntegration';
import { isProgram, shellLaunch } from '../tools/terminal/main/shellLaunch';
import { windowsPtyOf } from '../tools/terminal/main/windowsPty';
import { TerminalTool } from '../tools/terminal/main/tool';
import { GitStorage } from '../tools/git/main/storage';
import { GitTool } from '../tools/git/main/tool';
import { Shell, type Connection } from '../shell/main/shell';
import { spareWindowIds } from '../shell/main/windows';
import {
  appFile,
  appOrigin,
  appScheme,
  cascaded,
  tearsOffTabs,
  firstWindowSize,
  isAppUrl,
  keptBounds,
  lockDown,
  minimumHeight,
  minimumWidth,
  opensExternally,
  restoresMaximized,
  showAgain,
  startsAppPage,
  visibleBounds,
} from './files';
import { tellMaximized } from './maximized';
import { TabDrag, type DragHost, type DragWindow, type Strip } from './tabDrag';
import {
  boundsKey,
  maximizedKey,
  placesKey,
  savedPlace,
  withPlace,
  type Place,
  type SavedPlace,
} from './places';
import { reloadWhenGone } from './pageGone';
import {
  archivesFolder,
  profileFolder,
  thumbnailFolder,
  viewedFilesFolder,
} from './profile';
import { ThumbnailStore } from '../tools/commander/main/thumbnailStore';
import { QuitGuard } from './quitGuard';
import { exitOnFailure, flushBeforeQuit, whileWindowOpen } from './quit';
import { reloadOnRebuild } from './rebuild';
import { withLoginShellEnv } from './shellPath';
import {
  commandFiles,
  commandPlaceOf,
  commandState,
  installCommand,
  linkAsAdmin,
  pointCommandAt,
  refreshCommand,
} from './terminalCommand';
import { addExplorerMenu, explorerMenuOf } from './explorerMenu';
import { runsAsAppImage, updateMode, Updates } from './updates';
import { removeUnviewedCopies } from './viewedFiles';

const dist = __dirname;
const development = !app.isPackaged;
const smallestThumbnailCache = 16;

protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

const helper = helperOf(process.argv);

if (helper === undefined) {
  startApp();
} else {
  app.setPath(
    'userData',
    path.join(app.getPath('temp'), 'fastforward-commander-helper'),
  );
  runHelper(
    helper,
    () => fileSystemFor(process.platform),
    () => app.exit(0),
  );
}

function startApp(): void {
  const userDataDir = profileFolder(
    development,
    app.commandLine.getSwitchValue('user-data-dir'),
    app.getPath('appData'),
  );
  if (userDataDir) {
    app.setPath('userData', userDataDir);
    app.setPath('logs', path.join(userDataDir, 'logs'));
  }

  const askedFolders = foldersOf(
    process.argv,
    process.defaultApp,
    process.cwd(),
  );

  if (app.requestSingleInstanceLock(handOff(askedFolders))) {
    void exitOnFailure(app, start(askedFolders), (error) =>
      dialog.showErrorBox(brand, strings.app.couldNotStart(errorLine(error))),
    );
  } else {
    app.quit();
  }
}

async function start(asked: readonly string[]): Promise<void> {
  setKeyPlatform(process.platform);
  const gitSearch = searchGit();
  await app.whenReady();
  const log = fileLog(
    path.join(app.getPath('logs'), 'Fastforward.log'),
    development,
  );
  log.info(
    strings.log.started(
      app.getVersion(),
      process.platform,
      process.arch,
      process.versions.electron,
    ),
  );
  process.on('uncaughtException', (error) => log.error(error));
  process.on('unhandledRejection', (reason) => log.error(reason));

  const profile = app.getPath('userData');
  const archiveWork = workFolders(
    archivesFolder(
      process.platform,
      development,
      app.commandLine.getSwitchValue('user-data-dir'),
      os.homedir(),
      process.env,
    ),
  );
  const defaults = readDefaults(path.join(dist, 'settings.json'));
  const userSettingsFile = path.join(profile, 'settings.user.json');
  const defaultSettingsCopy = path.join(profile, 'settings.defaults.json');
  const userSettings = new UserSettings(defaults, userSettingsFile);
  for (const problem of userSettings.problems) {
    log.warn(plainOf(problem));
  }
  applyTheme(userSettings.settings.theme);
  const state = new JsonFileStore(
    path.join(profile, 'state.json'),
    migratedState,
  );
  for (const problem of state.problems) {
    log.warn(plainOf(problem));
  }
  const untoldStateProblems = [...state.problems];
  const pdfPlaces = new PdfPlaces(path.join(profile, 'pdf-places.json'));
  const views = Promise.withResolvers<{
    shell: Shell;
    git: GitTool;
    commander: CommanderTool;
  }>();
  protocol.handle(appScheme, (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/theme.css') {
      return new Response(themeCss(userSettings.settings), {
        headers: { 'content-type': 'text/css', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === imageRoute) {
      return views.promise.then(({ git }) => git.image(url));
    }
    if (url.pathname === iconRoute) {
      return views.promise.then(({ commander }) => commander.icon(url));
    }
    if (url.pathname === thumbnailRoute) {
      return views.promise.then(({ commander }) => commander.thumbnail(url));
    }
    if (url.pathname === viewedFileRoute) {
      return views.promise.then(({ commander }) =>
        commander.file(url, request.headers.get('range')),
      );
    }
    const file = appFile(dist, request.url);
    return file
      ? net.fetch(pathToFileURL(file).toString())
      : new Response(strings.errors.notFound, { status: 404 });
  });
  setMenu();
  const storage = new Storage(userSettings, state);
  const gitFound = gitSearch.then((git) => git.kind === 'found');
  let asking: Shell | undefined;
  const quitGuard = new QuitGuard(() => asking);
  powerMonitor.on('shutdown', () => quitGuard.systemEnding());
  app.on('before-quit', () => quitGuard.quitStarts());
  const opened = new Map<string, OpenedWindow>();
  let focused: string | undefined;
  const focusedWindow = (): BrowserWindow | undefined =>
    (
      (focused === undefined ? undefined : opened.get(focused)) ??
      [...opened.values()].at(-1)
    )?.window;
  const windowIds = () => storage.layout.map((window) => window.id);
  const savePlace = (id: string, entry: OpenedWindow) => {
    void state.update(
      placesKey,
      withPlace(state.get(placesKey), id, entry.place(), windowIds()),
    );
    for (const key of [boundsKey, maximizedKey]) {
      if (state.get(key) !== undefined) {
        void state.update(key, undefined);
      }
    }
  };
  const strips = new Map<string, Strip>();
  let frontToBack: string[] = [];
  let drag: TabDrag | undefined;
  let spare: { readonly id: string; readonly entry: OpenedWindow } | undefined;
  const spareId = spareWindowIds(storage.layout);
  const openWindow = (
    id: string,
    saved: SavedPlace,
    kept = false,
  ): OpenedWindow => {
    const { window, place } = createWindow(
      saved,
      userSettings.settings,
      kept ? Promise.resolve(false) : gitFound,
    );
    const entry: OpenedWindow = {
      window,
      place,
      loading: Promise.resolve(),
      connection: Promise.resolve(undefined),
      closing: false,
    };
    if (!kept) {
      opened.set(id, entry);
      frontToBack = [id, ...frontToBack];
    }
    window.on('focus', () => {
      focused = id;
      frontToBack = [id, ...frontToBack.filter((other) => other !== id)];
      asking?.focus(id);
    });
    window.on('close', (event) => {
      if (opened.get(id) !== entry) {
        return;
      }
      const closing = quitGuard.closing(opened.size === 1, () => app.quit());
      if (closing === 'held') {
        event.preventDefault();
        return;
      }
      if (closing === 'quits') {
        savePlace(id, entry);
        return;
      }
      if (
        !entry.closing &&
        asking?.asksBeforeClosing(id) === true &&
        asking.askToCloseWindow(id)
      ) {
        event.preventDefault();
        return;
      }
      asking?.closeWindow(id);
      savePlace(id, entry);
    });
    window.on('query-session-end', () => quitGuard.systemEnding());
    window.on('unresponsive', () => quitGuard.responsive(false));
    window.on('responsive', () => quitGuard.responsive(true));
    window.webContents.on('did-start-navigation', (details) => {
      if (startsAppPage(details)) {
        entry.connection = Promise.all([entry.connection, views.promise]).then(
          ([previous, { shell: view }]) => {
            previous?.dispose();
            return view.connect(id, (message: ToWebview) => {
              if (!window.isDestroyed()) {
                window.webContents.send('message', message);
              }
            });
          },
        );
      }
    });
    const disconnect = () =>
      void entry.connection.then((current) => current?.dispose());
    reloadWhenGone(window, log, disconnect);
    tellMaximized(window, (maximized) => {
      if (!window.isDestroyed()) {
        window.webContents.send('maximized', maximized);
      }
    });
    window.on('closed', () => {
      disconnect();
      strips.delete(id);
      frontToBack = frontToBack.filter((other) => other !== id);
      if (spare?.entry === entry) {
        spare = undefined;
      }
      if (opened.get(id) === entry) {
        opened.delete(id);
      }
      if (focused === id) {
        focused = undefined;
      }
      if (opened.size === 0) {
        spare?.entry.window.destroy();
      }
    });
    entry.loading = window.loadURL(`${appOrigin}/index.html`);
    void entry.loading.catch((error: unknown) => {
      log.error(strings.log.pageNotLoaded);
      log.error(error);
    });
    return entry;
  };
  const sendToEvery = (channel: string, message: unknown) => {
    for (const { window } of opened.values()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, message);
      }
    }
  };
  const openedBy = (sender: Electron.WebContents): OpenedWindow | undefined =>
    [...opened.values(), ...(spare === undefined ? [] : [spare.entry])].find(
      ({ window }) => !window.isDestroyed() && window.webContents === sender,
    );
  const keepSpare = () => {
    if (spare === undefined && !quitGuard.quits && opened.size > 0) {
      const id = spareId();
      spare = {
        id,
        entry: openWindow(id, { bounds: undefined, maximized: false }, true),
      };
    }
  };
  const dragWindowOf = (id: string): DragWindow | undefined => {
    const entry = opened.get(id);
    if (entry === undefined || entry.window.isDestroyed()) {
      return undefined;
    }
    const { window } = entry;
    return {
      id,
      bounds: () => window.getBounds(),
      contentBounds: () => window.getContentBounds(),
      strip: () => strips.get(id),
      shown: () =>
        !window.isDestroyed() &&
        window.isVisible() &&
        !window.isMinimized() &&
        window.getOpacity() > 0,
      moveTo: (x, y) => {
        if (!window.isDestroyed()) {
          window.setPosition(x, y);
        }
      },
      hide: (hidden) => {
        if (window.isDestroyed()) {
          return;
        }
        window.setOpacity(hidden ? 0 : 1);
        if (hidden) {
          return;
        }
        if (!window.isVisible()) {
          window.showInactive();
        }
        window.setAlwaysOnTop(true);
      },
    };
  };
  const closeOpened = (id: string) => {
    const entry = opened.get(id);
    if (entry !== undefined && !entry.window.isDestroyed()) {
      entry.closing = true;
      entry.window.close();
    }
  };
  const dragHost: DragHost = {
    windows: () => frontToBack.flatMap((id) => dragWindowOf(id) ?? []),
    tearOff: (tab, from) => {
      const source = opened.get(from);
      if (source === undefined || asking === undefined) {
        return undefined;
      }
      keepSpare();
      const taken = spare;
      if (taken === undefined) {
        return undefined;
      }
      spare = undefined;
      opened.set(taken.id, taken.entry);
      frontToBack = [taken.id, ...frontToBack];
      const size = source.window.getNormalBounds();
      taken.entry.window.setSize(size.width, size.height);
      void asking.tearOff(tab, taken.id);
      return dragWindowOf(taken.id);
    },
    visit: (window, visit) => asking?.visit(window, visit),
    move: (tab, into, index) => void asking?.moveTab(tab, into, index),
    close: (window) => closeOpened(window),
    focus: (window) => {
      const entry = opened.get(window);
      if (entry !== undefined && !entry.window.isDestroyed()) {
        entry.window.setAlwaysOnTop(false);
        entry.window.setOpacity(1);
        showAgain(entry.window);
      }
    },
  };
  const fromApp = (event: Electron.IpcMainEvent): OpenedWindow | undefined =>
    event.senderFrame !== null && isAppUrl(event.senderFrame.url)
      ? openedBy(event.sender)
      : undefined;
  ipcMain.on('message', (event, message: ToHost) => {
    void fromApp(event)?.connection.then((current) =>
      current?.receive(message),
    );
  });
  ipcMain.on(
    'dropFiles',
    (event, files: unknown, tool: unknown, message: unknown) => {
      void fromApp(event)?.connection.then((current) =>
        current?.dropped(files, tool, message),
      );
    },
  );
  ipcMain.on('windowButtonColor', (event, color: unknown) => {
    const entry = openedBy(event.sender);
    if (
      entry !== undefined &&
      typeof color === 'string' &&
      process.platform !== 'darwin'
    ) {
      try {
        entry.window.setTitleBarOverlay({
          color: '#00000000',
          symbolColor: color,
        });
      } catch (error) {
        log.error(strings.log.coloringWindowButtonsFailed);
        log.error(error);
      }
    }
  });
  const [firstWindow] = storage.layout.map((window, index) =>
    openWindow(
      window.id,
      savedPlace((key) => state.get(key), window.id, index === 0),
    ),
  );
  const loading = firstWindow?.loading ?? Promise.resolve();
  void Promise.all([loading, gitFound]).then(([, found]) => {
    if (found) {
      keepSpare();
    }
  });
  app.on(
    'second-instance',
    (_event, _argv, _workingDirectory, additionalData) => {
      const window = focusedWindow();
      if (window !== undefined) {
        showAgain(window);
      }
      if (process.platform === 'darwin') {
        app.focus({ steal: true });
      }
      const folders = foldersHandedOff(additionalData);
      if (folders.length > 0) {
        void views.promise.then(({ shell: view }) => view.openFolders(folders));
      }
    },
  );
  app.on('window-all-closed', () => app.quit());
  flushBeforeQuit(
    app,
    () => asking?.quit(),
    () => Promise.all([state.saved(), userSettings.saved(), pdfPlaces.saved()]),
    () => Promise.all([stopRunningGit(), archiveWork.clear()]),
  );
  const chooseFolders = async (
    options: Electron.OpenDialogOptions,
  ): Promise<Electron.OpenDialogReturnValue> => {
    const parent = focusedWindow();
    return parent === undefined
      ? dialog.showOpenDialog(options)
      : dialog.showOpenDialog(parent, options);
  };
  const everyWindow = {
    isDestroyed: () => opened.size === 0,
    once: (_event: 'closed', listener: () => void) =>
      app.once('will-quit', listener),
    on: (_event: 'closed', listener: () => void) =>
      app.once('will-quit', listener),
    webContents: {
      reloadIgnoringCache: () => {
        for (const { window } of [
          ...opened.values(),
          ...(spare === undefined ? [] : [spare.entry]),
        ]) {
          if (!window.isDestroyed()) {
            window.webContents.reloadIgnoringCache();
          }
        }
      },
    },
  };

  const git = await gitSearch;
  if (git.kind !== 'found') {
    await reportMissingGit(log, git);
    for (const { window } of opened.values()) {
      window.destroy();
    }
    app.quit();
    return;
  }
  log.info(strings.log.usingGit(git.version, git.path));
  const commandPlace = commandPlaceOf({
    platform: process.platform,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    home: os.homedir(),
    appImage: runsAsAppImage(process.execPath, process.env)
      ? process.env.APPIMAGE
      : undefined,
  });
  const updates = new Updates(
    updateMode(development, process.platform, process.execPath),
    app.getVersion(),
    autoUpdater,
    (message) => {
      if (message.type === 'update' && message.status.kind === 'failed') {
        quitGuard.reset();
      }
      sendToEvery('message', message);
    },
    (notice) =>
      void views.promise.then(({ shell: view }) => view.notify(notice)),
    log,
    (url) => void shell.openExternal(url),
    writesEnded,
  );
  autoUpdater.logger = {
    info: (message: unknown) => log.info(strings.log.updater(String(message))),
    warn: (message: unknown) => log.warn(strings.log.updater(String(message))),
    error: (message: unknown) =>
      log.error(strings.log.updater(String(message))),
    debug: () => {},
  };
  const system = systemOf({
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    systemVersion: process.getSystemVersion(),
    distribution: process.platform === 'linux' ? distributionName() : undefined,
  });
  const viewedFiles = viewedFilesFolder(
    process.platform,
    development,
    app.commandLine.getSwitchValue('user-data-dir'),
    os.homedir(),
    process.env,
  );
  const viewedRoots = storage.savedTabs.flatMap((tab) =>
    tab.view === true && tab.root !== undefined ? [tab.root] : [],
  );
  for (const copies of new Set([
    viewedFiles,
    path.join(profile, 'viewed-files'),
  ])) {
    await removeUnviewedCopies(copies, viewedRoots);
  }
  await archiveWork.clearEnded();
  keepGitRunningWhile(() => userSettings.settings.tools.git.keepGitRunning);
  const gitTool = new GitTool(
    log,
    git.path,
    new GitStorage(userSettings, toolState(state, 'git')),
    {
      viewedFiles,
      chooseFolders: async () => {
        const chosen = await chooseFolders({
          title: strings.app.openRepositories,
          buttonLabel: strings.app.open,
          properties: ['openDirectory', 'multiSelections'],
        });
        return chosen.canceled ? [] : chosen.filePaths;
      },
      chooseFolder: async (purpose, from) => {
        const chosen = await chooseFolders({
          ...(purpose === 'init'
            ? {
                title: strings.app.initRepository,
                buttonLabel: strings.app.init,
              }
            : {
                title: strings.app.cloneInto,
                buttonLabel: strings.app.choose,
              }),
          ...(from !== undefined && { defaultPath: from }),
          properties: ['openDirectory', 'createDirectory'],
        });
        return chosen.canceled ? undefined : chosen.filePaths[0];
      },
      clipboardText: () => clipboard.readText(),
    },
  );
  const terminalSettings = () => userSettings.settings.tools.terminal;
  const integration = path.join(profile, 'shellIntegration');
  let integrationWritten = false;
  const terminalTool = new TerminalTool(
    log,
    hostProcess(path.join(dist, 'ptyHost.js'), log),
    terminalSettings,
    (folder) => {
      if (!integrationWritten) {
        integrationWritten = true;
        try {
          writeShellIntegration(integration);
        } catch (error) {
          log.error(strings.log.writingShellIntegrationFailed);
          log.error(error);
        }
      }
      return shellLaunch(terminalSettings(), folder, {
        platform: process.platform,
        env: process.env,
        home: os.homedir(),
        version: app.getVersion(),
        isFolder,
        isFile,
        isProgram,
        integration,
      });
    },
    windowsPtyOf(process.platform, os.release()),
    {
      store: toolState(state, 'terminal'),
      home: os.homedir(),
      isFolder,
      now: () => Date.now(),
      choose: async () => {
        const chosen = await chooseFolders({
          title: strings.app.openInTerminal,
          buttonLabel: strings.app.open,
          properties: ['openDirectory', 'multiSelections'],
        });
        return chosen.canceled ? [] : chosen.filePaths;
      },
    },
  );
  const commanderTool = new CommanderTool({
    pdfPlaces,
    fileSystem: () => fileSystemFor(process.platform),
    codePage: () => systemCodePage(process.platform),
    settings: () => userSettings.settings.tools.commander,
    defaultColumns: () => userSettings.defaults.tools.commander.columns,
    saveShowHidden: (shown) =>
      userSettings.setIn('commander', 'showHidden', shown),
    saveColumns: (columns) =>
      userSettings.setIn('commander', 'columns', columns),
    saveSorts: (sorts) => userSettings.setIn('commander', 'sort', sorts),
    saveBookmarks: (bookmarks) =>
      userSettings.setIn('commander', 'bookmarks', bookmarks),
    store: toolState(state, 'commander'),
    thumbnails: new ThumbnailStore(
      thumbnailFolder(
        process.platform,
        development,
        app.commandLine.getSwitchValue('user-data-dir'),
        os.homedir(),
        process.env,
      ),
      () =>
        Math.max(
          smallestThumbnailCache,
          userSettings.settings.tools.commander.thumbnailCacheMegabytes,
        ) *
        1024 *
        1024,
    ),
    ...(process.platform === 'win32' && {
      streamed: async (file: string) =>
        (
          await import('../tools/commander/main/windowsCloudFiles.js')
        ).streamsFromGoogleDrive(file),
      binOff: async (folder: string) =>
        (
          await import('../tools/commander/main/windowsRecycleBin.js')
        ).windowsRecycleBinOff(folder),
    }),
    isRepository,
    inRepository: (folder) => inRepository(folder),
    initRepository: (folder) => gitTool.initRepositoryIn(folder),
    cloneInto: (folder) => gitTool.cloneInto(folder),
    stamp: folderStamp,
    watch: watchFolder,
    ...(process.platform !== 'linux' && { watchTree }),
    fileIcon: async (file) =>
      (await app.getFileIcon(file, { size: 'normal' })).toPNG(),
    platform: process.platform,
    ...(process.platform === 'win32' && {
      elevate: async () => {
        const { windowsLauncher } =
          await import('../tools/commander/main/windowsElevation.js');
        return elevatedFileSystem(
          windowsLauncher(
            process.execPath,
            process.defaultApp ? path.resolve(process.argv[1]) : undefined,
            () => {
              const window = focusedWindow();
              return window === undefined || window.isDestroyed()
                ? undefined
                : window.getNativeWindowHandle();
            },
          ),
          process.platform,
        );
      },
      shellMenu: async (files, at, extended) => {
        const { showShellMenu } =
          await import('../tools/commander/main/windowsShellMenu.js');
        const window = focusedWindow();
        if (window === undefined || window.isDestroyed()) {
          return;
        }
        const content = window.getContentBounds();
        const zoom = window.webContents.getZoomFactor();
        showShellMenu(
          window.getNativeWindowHandle(),
          files,
          screen.dipToScreenPoint({
            x: content.x + at.x * zoom,
            y: content.y + at.y * zoom,
          }),
          extended,
        );
      },
    }),
    archives: new Archives(
      sevenZipReaderAt(
        sevenZipProgram({
          packaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          appPath: app.getAppPath(),
          platform: process.platform,
          arch: process.arch,
        }),
      ),
      process.platform,
      archiveWork.next,
    ),
    viewedCopies: viewedFiles,
    realPath: (link) => fs.promises.realpath(link),
    openFile: (file) => shell.openPath(file),
    trash: (file) => shell.trashItem(file),
    remove: (file) => fs.promises.rm(file, { recursive: true }),
    makeFolder: (folder) => fs.promises.mkdir(folder),
    renameItem: renameUnlessTaken,
    clipboardFiles: { write: writeClipboardFiles, read: readClipboardFiles },
    startDrag: async ([file, ...more]) => {
      if (file === undefined) {
        return;
      }
      const icon = await app
        .getFileIcon(file, { size: 'normal' })
        .catch(() => nativeImage.createEmpty());
      const window = focusedWindow();
      if (window !== undefined && !window.isDestroyed()) {
        window.webContents.startDrag({ file, files: [file, ...more], icon });
      }
    },
    connectTransfer: transferProcess(path.join(dist, 'transferHost.js'), log),
    contentReader: hashWorkers(dist),
    sizeWalker: sizeWorkers(
      dist,
      process.platform === 'win32' ? unpackedKoffi() : undefined,
    ),
    root: rootFolder(process.platform, process.env),
    home: os.homedir(),
    variable: (name) => process.env[name],
    ...(process.platform === 'win32' && {
      knownFolder: async (name: string) =>
        (
          await import('../tools/commander/main/windowsKnownFolders.js')
        ).windowsKnownFolder(name),
    }),
  });
  const view = new Shell(
    log,
    storage,
    {
      openSettings: async () => {
        if (!fs.existsSync(userSettingsFile)) {
          fs.writeFileSync(userSettingsFile, '{}\n');
        }
        await openFile(log, userSettingsFile);
      },
      openDefaultSettings: async () => {
        writeReadOnly(
          defaultSettingsCopy,
          fs.readFileSync(path.join(dist, 'settings.json'), 'utf8'),
        );
        await openFile(log, defaultSettingsCopy);
      },
      settingsProblems: () => userSettings.problems,
      stateProblems: () => untoldStateProblems.splice(0),
      checkForUpdates: () => updates.check(true),
      installUpdate: () => {
        if (
          updates.status.kind !== 'ready' ||
          !quitGuard.holds(() => updates.install())
        ) {
          updates.install();
        }
      },
      quit: () => quitGuard.confirmed(),
      updateStatus: () => updates.status,
      about: () => ({
        version: app.getVersion(),
        development,
        git: git.version,
        system,
      }),
      copyText: (text) => {
        void clipboard.writeText(text);
      },
      canInstallCommand: () => commandPlace !== undefined,
      commandState: () =>
        commandPlace === undefined
          ? Promise.resolve('taken')
          : commandState(commandPlace, commandFiles),
      installCommand: () =>
        commandPlace === undefined
          ? Promise.resolve({ kind: 'cancelled' })
          : installCommand(
              commandPlace,
              commandFiles,
              linkAsAdmin(),
              (process.env.PATH ?? '').split(path.delimiter),
            ),
      openWindow: (id, near) => {
        const from = near === undefined ? undefined : opened.get(near)?.window;
        const bounds =
          from === undefined || from.isDestroyed()
            ? undefined
            : cascaded(
                from.getNormalBounds(),
                screen.getDisplayMatching(from.getNormalBounds()).workArea,
              );
        openWindow(id, { bounds, maximized: false });
      },
      closeWindow: closeOpened,
      showWindow: (id) => {
        const entry = opened.get(id);
        if (entry !== undefined) {
          showAgain(entry.window);
        }
      },
      tearsOff: () => tearsOffTabs(process.platform, process.env),
      drag: (window, event) => {
        switch (event.kind) {
          case 'strip':
            strips.set(window, event.strip);
            return;
          case 'start': {
            const source = dragWindowOf(window);
            if (
              drag === undefined &&
              source !== undefined &&
              tearsOffTabs(process.platform, process.env) &&
              (!event.alone || opened.size > 1)
            ) {
              drag = TabDrag.start(dragHost, source, event);
            }
            return;
          }
          case 'move':
            if (drag?.source.id === window) {
              drag.move(event.at);
            }
            return;
          case 'index':
            drag?.index(window, event.index);
            return;
          case 'drop':
          case 'cancel': {
            const ended = drag;
            if (ended?.source.id !== window) {
              return;
            }
            drag = undefined;
            if (event.kind === 'drop') {
              ended.drop();
            } else {
              ended.cancel();
            }
            keepSpare();
          }
        }
      },
    },
    {
      terminal: terminalTool,
      commander: commanderTool,
      git: gitTool,
    },
  );
  if (asked.length > 0) {
    void view.openFolders(asked);
  }
  views.resolve({ shell: view, git: gitTool, commander: commanderTool });
  asking = view;
  const applySettings = () => {
    log.info(strings.log.settingsChanged);
    for (const problem of userSettings.problems) {
      log.warn(plainOf(problem));
    }
    applyTheme(userSettings.settings.theme);
    view.reloadSettings();
    everyWindow.webContents.reloadIgnoringCache();
  };
  tryWatching(log, strings.log.watchingSettingsFailed, () =>
    whileWindowOpen(everyWindow, (ifOpen) =>
      watchSettings(userSettingsFile, () =>
        ifOpen(() => {
          if (userSettings.reload()) {
            applySettings();
          }
        }),
      ),
    ),
  );

  if (development && process.env.FASTFORWARD_DEV) {
    if (process.connected) {
      process.on('disconnect', () => {
        quitGuard.allow();
        app.quit();
      });
    } else {
      app.quit();
    }
    tryWatching(log, strings.log.watchingBuildFailed, () =>
      reloadOnRebuild(everyWindow, dist, () => {
        try {
          if (
            userSettings.replaceDefaults(
              readDefaults(path.join(dist, 'settings.json')),
            )
          ) {
            applySettings();
          }
        } catch (error) {
          log.error(strings.log.rebuiltDefaultsFailed);
          log.error(error);
        }
      }),
    );
  }
  updates.startAfter(loading);
  if (commandPlace !== undefined) {
    void refreshCommand(commandPlace, commandFiles).then(
      (pointed) => {
        if (pointed) {
          log.info(strings.log.pointedCommand(commandPlace.path));
        }
      },
      (error: unknown) => {
        log.error(strings.log.pointingCommandFailed);
        log.error(error);
      },
    );
    autoUpdater.on('appimage-filename-updated', (updated) => {
      try {
        if (pointCommandAt(commandPlace, updated)) {
          log.info(strings.log.pointedCommandAtUpdate(commandPlace.path));
        }
      } catch (error) {
        log.error(strings.log.pointingCommandAtUpdateFailed);
        log.error(error);
      }
    });
  }
  const explorerMenu = explorerMenuOf(process.platform, process.execPath);
  if (explorerMenu !== undefined) {
    void addExplorerMenu(explorerMenu).catch((error: unknown) => {
      log.error(strings.log.addingExplorerMenuFailed);
      log.error(error);
    });
  }
}

function distributionName(): string | undefined {
  try {
    return prettyName(fs.readFileSync('/etc/os-release', 'utf8'));
  } catch {
    return undefined;
  }
}

function isFile(file: string): Promise<boolean> {
  return fs.promises.stat(file).then(
    (stats) => stats.isFile(),
    () => false,
  );
}

async function searchGit(): Promise<GitSearch> {
  await withLoginShellEnv(process.platform, process.env);
  return findGit();
}

function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = theme === 'auto' ? 'system' : theme;
}

interface OpenedWindow {
  readonly window: BrowserWindow;
  readonly place: () => Place;
  loading: Promise<void>;
  connection: Promise<Connection | undefined>;
  closing: boolean;
}

function createWindow(
  saved: SavedPlace,
  settings: Settings,
  shown: Promise<boolean>,
): { readonly window: BrowserWindow; readonly place: () => Place } {
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const size = firstWindowSize(screen.getPrimaryDisplay().workArea);
  const bounds = visibleBounds(saved.bounds, workAreas);
  const window = new BrowserWindow({
    ...(bounds ?? size),
    minWidth: minimumWidth(workAreas),
    minHeight: minimumHeight(workAreas),
    title: brand,
    show: false,
    backgroundColor: (nativeTheme.shouldUseDarkColors
      ? settings.colors.dark
      : settings.colors.light
    ).background,
    icon:
      process.platform === 'darwin' ? undefined : path.join(dist, 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'darwin'
        ? undefined
        : { color: '#00000000', height: titleBarHeight },
    trafficLightPosition: { x: 12, y: (titleBarHeight - 12) / 2 },
    webPreferences: {
      preload: path.join(dist, 'preload.js'),
      additionalArguments: [
        appNameSwitch + strings.app.name(app.getVersion(), development),
      ],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  const { maximized } = saved;
  window.once(
    'ready-to-show',
    () =>
      void shown.then((show) => {
        if (show) {
          if (maximized) {
            window.maximize();
          }
          window.show();
        }
      }),
  );
  const restores = restoresMaximized(window, maximized);
  window.on('maximize', restores);
  window.on('unmaximize', restores);
  window.on('resize', restores);
  const kept = keptBounds(
    window,
    bounds ?? { ...window.getNormalBounds(), ...size },
  );
  window.on('resized', kept.resized);
  window.on('moved', kept.moved);
  const reportsUserMoves = process.platform !== 'linux';
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (opensExternally(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
    }
  });
  lockDown(window.webContents.session);
  window.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      pressed(keymap.devTools, pressOfInput(input), false)
    ) {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  return {
    window,
    place: () => ({
      bounds: reportsUserMoves ? kept.bounds() : window.getNormalBounds(),
      maximized: restores(),
    }),
  };
}

function setMenu(): void {
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' },
        ])
      : null,
  );
}

async function reportMissingGit(
  log: Log,
  git: Exclude<GitSearch, { kind: 'found' }>,
): Promise<void> {
  const needed = minimumGitVersion.join('.');
  const detail =
    git.kind === 'missing'
      ? strings.app.installGit(needed)
      : strings.app.gitTooOld(git.version, git.path, needed);
  log.error(detail);
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: brand,
    message: strings.app.needsGit,
    detail,
    buttons: [strings.app.downloadGit, strings.app.quit],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    await shell.openExternal('https://git-scm.com/downloads');
  }
}

async function openFile(log: Log, file: string): Promise<void> {
  const failure = await shell.openPath(file);
  if (failure) {
    log.error(strings.log.openingFileFailed(file, failure));
  }
}

function tryWatching(log: Log, failed: string, watch: () => void): void {
  try {
    watch();
  } catch (error) {
    log.error(failed);
    log.error(error);
  }
}
