import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  app,
  dialog,
  Menu,
  nativeTheme,
  powerMonitor,
  protocol,
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { foldersHandedOff, foldersOf, handOff } from './commandLine';
import { prettyName, systemOf } from './system';
import { writesEnded } from '../tools/git/main/gitProcesses';
import { keepGitRunningWhile, stopRunningGit } from '../tools/git/main/run';
import { errorLine, fileLog, type Log } from '../shell/main/log';
import { setKeyPlatform } from '../lib/shared/keymap';
import { brand, strings } from '../lib/shared/strings';
import { plainOf } from '../lib/shared/sentences';
import { readDefaults, type Theme } from '../shell/main/settings';
import { UserSettings } from '../shell/main/userSettings';
import { watchSettings } from '../shell/main/settingsWatch';
import { JsonFileStore } from '../shell/main/stateFile';
import { migratedState } from '../shell/main/stateMigration';
import { Storage } from '../shell/main/storage';
import { fileSystemFor } from '../tools/commander/main/fileSystem';
import { PdfPlaces } from '../tools/commander/main/pdfPlaces';
import { runHelper } from '../tools/commander/main/helper';
import { helperOf } from '../tools/commander/main/helperProtocol';
import type { GitTool } from '../tools/git/main/tool';
import { Shell } from '../shell/main/shell';
import { appScheme } from './files';
import { showAgain } from './showAgain';
import { AppWindows } from './appWindows';
import { serveApp } from './appProtocol';
import { keepCommandPointed, keepExplorerMenu } from './installs';
import { archivesFolder, profileFolder, viewedFilesFolder } from './profile';
import { QuitGuard } from './quitGuard';
import { exitOnFailure, flushBeforeQuit } from './quit';
import { whileWindowOpen } from './whileWindowOpen';
import { reloadOnRebuild } from './rebuild';
import { commandPlaceOf } from './terminalCommand';
import { Updates } from './updates';
import { runsAsAppImage, updateMode } from './installation';
import { removeUnviewedCopies } from './viewedFiles';
import { workFolders } from '../tools/commander/main/workFolders';
import type { CommanderTool } from '../tools/commander/main/tool';
import { gitLocator } from './gitSearch';
import { needsGit } from '../tools/git/main/gitLocator';
import type { GitSearch } from '../tools/git/main/locate';
import { gitToolOf } from './gitHost';
import { terminalToolOf } from './terminalHost';
import { commanderToolOf } from './commanderHost';
import { shellHostOf } from './shellHost';

const dist = __dirname;
const development = !app.isPackaged;

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
  const locating = gitLocator();
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

  const git = await locating;
  logGit(log, git.git);
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
  const gitTool = gitToolOf({
    log,
    git,
    userSettings,
    state,
    viewedFiles,
    chooseFolders,
  });
  const terminalTool = terminalToolOf({
    log,
    dist,
    profile,
    userSettings,
    state,
    chooseFolders,
  });
  const commanderTool = commanderToolOf({
    log,
    dist,
    development,
    userSettings,
    state,
    pdfPlaces,
    git,
    gitTool,
    windows,
    defaultSettingsCopy,
    archiveWork,
    viewedFiles,
  });
  const shellHost = shellHostOf({
    dist,
    development,
    userSettingsFile,
    defaultSettingsCopy,
    userSettings,
    untoldStateProblems,
    updates,
    quitGuard,
    git,
    system,
    commandPlace,
    windows,
  });
  const view = new Shell(log, storage, shellHost, {
    terminal: terminalTool,
    commander: commanderTool,
    git: gitTool,
  });
  git.whenFound((found) => {
    logGit(log, found);
    windows.sendToEvery('message', { type: 'about', ...shellHost.about() });
  });
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

function logGit(log: Log, git: GitSearch): void {
  if (git.kind === 'found') {
    log.info(strings.log.usingGit(git.version, git.path));
  } else {
    log.warn(plainOf(needsGit(git)));
  }
}

function distributionName(): string | undefined {
  try {
    return prettyName(fs.readFileSync('/etc/os-release', 'utf8'));
  } catch {
    return undefined;
  }
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

function tryWatching(log: Log, failed: string, watch: () => void): void {
  try {
    watch();
  } catch (error) {
    log.error(failed);
    log.error(error);
  }
}
