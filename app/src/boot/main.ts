import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  app,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
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
} from '../tools/git/main/locate';
import { foldersHandedOff, foldersOf, handOff } from './commandLine';
import { prettyName, systemOf } from './system';
import {
  keepGitRunningWhile,
  stopRunningGit,
  writesEnded,
} from '../tools/git/main/run';
import { errorLine, fileLog, type Log } from '../shell/main/log';
import { setKeyPlatform } from '../lib/shared/keymap';
import type { Theme } from '../shell/shared/protocol';
import { brand, plainOf, strings } from '../lib/shared/strings';
import {
  readDefaults,
  UserSettings,
  watchSettings,
  writeReadOnly,
} from '../shell/main/settings';
import {
  JsonFileStore,
  migratedState,
  Storage,
  toolState,
} from '../shell/main/storage';
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
import { isFolder } from '../tools/git/main/repository';
import { elevatedFileSystem } from '../tools/commander/main/elevated';
import { helperOf, runHelper } from '../tools/commander/main/helper';
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
import { Shell } from '../shell/main/shell';
import { appScheme, tearsOffTabs, showAgain } from './files';
import { AppWindows } from './appWindows';
import { serveApp } from './appProtocol';
import { keepCommandPointed, keepExplorerMenu } from './installs';
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
} from './terminalCommand';
import { runsAsAppImage, updateMode, Updates } from './updates';
import { editorConfigOf } from '../tools/commander/main/editorConfig';
import { saveFile } from '../tools/commander/main/fileSaving';
import { gitEndingOf } from '../tools/commander/main/gitEnding';
import {
  textDefaultsOf,
  endingSourcesOf,
  type TextDefaultSources,
} from '../tools/commander/main/textDefaults';
import { removeUnviewedCopies } from './viewedFiles';
import { Archives } from '../tools/commander/main/archives';
import { workFolders } from '../tools/commander/main/archiveFiles';
import { CommanderTool } from '../tools/commander/main/tool';
import { rootFolder } from '../tools/commander/main/listings';

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
  serveApp(dist, () => userSettings.settings, views.promise);
  setMenu();
  const storage = new Storage(userSettings, state);
  const gitFound = gitSearch.then((git) => git.kind === 'found');
  let asking: Shell | undefined;
  const quitGuard = new QuitGuard(() => asking);
  powerMonitor.on('shutdown', () => quitGuard.systemEnding());
  app.on('before-quit', () => quitGuard.quitStarts());
  const windows = new AppWindows({
    log,
    dist,
    development,
    storage,
    state,
    settings: () => userSettings.settings,
    quitGuard,
    views: views.promise,
    gitFound,
    asking: () => asking,
  });
  windows.listen();
  const loading = windows.openLaidOut();
  app.on(
    'second-instance',
    (_event, _argv, _workingDirectory, additionalData) => {
      const window = windows.focusedWindow();
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
    const parent = windows.focusedWindow();
    return parent === undefined
      ? dialog.showOpenDialog(options)
      : dialog.showOpenDialog(parent, options);
  };

  const git = await gitSearch;
  if (git.kind !== 'found') {
    await reportMissingGit(log, git);
    windows.destroyAll();
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
      windows.sendToEvery('message', message);
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
    (tab.view === true || tab.edit === true) && tab.root !== undefined
      ? [tab.root]
      : [],
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
  const editorSourcesOf = (): TextDefaultSources => ({
    settings: userSettings.settings.editor,
    editorConfig: (edited) =>
      editorConfigOf(edited, (config) =>
        fs.promises.readFile(config, 'utf8').catch(() => undefined),
      ),
    gitEnding: (edited) => gitEndingOf(git.path, edited),
  });
  const commanderTool = new CommanderTool({
    pdfPlaces,
    fileSystem: () => fileSystemFor(process.platform),
    codePage: () => systemCodePage(process.platform),
    saveEdited: async (file, bytes, overwriteReadOnly) =>
      saveFile(file, bytes, {
        overwriteReadOnly,
        ...(process.platform === 'win32' && {
          replaceFile: (
            await import('../tools/commander/main/windowsReplaceFile.js')
          ).windowsReplaceFile(),
        }),
      }),
    readOnlyFile: (file) => path.relative(file, defaultSettingsCopy) === '',
    editorDefaults: (file, asksGit) =>
      textDefaultsOf(file, asksGit, editorSourcesOf()),
    editorSources: (file) => endingSourcesOf(file, editorSourcesOf()),
    settings: () => userSettings.settings.tools.commander,
    closesBrackets: () => userSettings.settings.editor.closeBrackets,
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
              const window = windows.focusedWindow();
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
        const window = windows.focusedWindow();
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
      const window = windows.focusedWindow();
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
      userSettingsFile: async () => {
        if (!fs.existsSync(userSettingsFile)) {
          await fs.promises.writeFile(userSettingsFile, '{}\n');
        }
        return userSettingsFile;
      },
      defaultSettingsFile: () => {
        writeReadOnly(
          defaultSettingsCopy,
          fs.readFileSync(path.join(dist, 'settings.json'), 'utf8'),
        );
        return Promise.resolve(defaultSettingsCopy);
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
      openWindow: (id, near) => windows.openNear(id, near),
      closeWindow: (id) => windows.close(id),
      showWindow: (id) => windows.show(id),
      tearsOff: () => tearsOffTabs(process.platform, process.env),
      drag: (window, event) => windows.dragged(window, event),
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
    windows.everyWindow.webContents.reloadIgnoringCache();
  };
  tryWatching(log, strings.log.watchingSettingsFailed, () =>
    whileWindowOpen(windows.everyWindow, (ifOpen) =>
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
      reloadOnRebuild(windows.everyWindow, dist, () => {
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
    keepCommandPointed(log, commandPlace, (moved) =>
      autoUpdater.on('appimage-filename-updated', moved),
    );
  }
  keepExplorerMenu(log);
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

function tryWatching(log: Log, failed: string, watch: () => void): void {
  try {
    watch();
  } catch (error) {
    log.error(failed);
    log.error(error);
  }
}
