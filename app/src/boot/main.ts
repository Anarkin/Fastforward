import { fs } from '../lib/main/files';
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
import {
  foldersHandedOff,
  foldersOf,
  handOff,
  startedAgainWith,
} from './commandLine';
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
import { Storage } from '../shell/main/storage';
import { fileSystemFor } from '../tools/commander/main/fileSystem';
import { PdfPlaces } from '../tools/viewer/main/pdfPlaces';
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
import { removeUnviewedCopies, viewedRootsOf } from './viewedFiles';
import { workFolders } from '../tools/commander/main/workFolders';
import type { CommanderTool } from '../tools/commander/main/tool';
import type { ViewerTool } from '../tools/viewer/main/tool';
import { gitLocator } from './gitSearch';
import { needsGit } from '../tools/git/main/gitLocator';
import type { GitSearch } from '../tools/git/main/locate';
import { gitToolOf } from './gitHost';
import { diffToolOf } from './diffHost';
import type { DiffTool } from '../tools/diff/main/tool';
import { terminalToolOf } from './terminalHost';
import { commanderToolOf } from './commanderHost';
import { viewerToolOf } from './viewerHost';
import { patternWorker } from '../lib/main/patternSearch';
import { editorToolOf } from './editorHost';
import type { EditorTool } from '../tools/editor/main/tool';
import { canvasToolOf } from './canvasHost';
import { shellHostOf } from './shellHost';
import { runsElevated } from './elevated';

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
  const state = new JsonFileStore(path.join(profile, 'state.json'));
  for (const problem of state.problems) {
    log.warn(plainOf(problem));
  }
  const untoldStateProblems = [...state.problems];
  const pdfPlaces = new PdfPlaces(path.join(profile, 'pdf-places.json'));
  const views = Promise.withResolvers<{
    shell: Shell;
    git: GitTool;
    commander: CommanderTool;
    viewer: ViewerTool;
    editor: EditorTool;
    diff: DiffTool;
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
  const quitting = flushBeforeQuit(
    app,
    () => asking?.quit(),
    () => Promise.all([state.saved(), userSettings.saved(), pdfPlaces.saved()]),
    () => Promise.all([stopRunningGit(Infinity), archiveWork.clear()]),
    () => asking?.quitWaits() ?? Promise.resolve(),
  );
  app.on(
    'second-instance',
    (_event, _argv, _workingDirectory, additionalData) => {
      if (
        quitting.startedAgainAfter(
          startedAgainWith(
            process.argv,
            process.defaultApp,
            foldersHandedOff(additionalData),
          ),
        )
      ) {
        return;
      }
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
  app.on('before-quit', () => log.info(strings.log.quitting));
  app.on('child-process-gone', (_event, details) =>
    log.warn(
      strings.log.childGone(details.type, details.reason, details.exitCode),
    ),
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
  const viewedRoots = viewedRootsOf(storage.savedTabs);
  if (state.readable) {
    for (const copies of new Set([
      viewedFiles,
      path.join(profile, 'viewed-files'),
    ])) {
      await removeUnviewedCopies(copies, viewedRoots);
    }
  }
  for (const kept of await archiveWork.clearEnded()) {
    void views.promise.then(({ shell: view }) =>
      view.notify({
        level: 'error',
        message: strings.commander.copyKept(kept.copy, kept.archive),
      }),
    );
  }
  keepGitRunningWhile(() => userSettings.settings.tools.git.keepGitRunning);
  const patterns = patternWorker(dist);
  const gitTool = gitToolOf({
    log,
    git,
    userSettings,
    state,
    viewedFiles,
    chooseFolders,
    patterns,
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
    git,
    gitTool,
    windows,
    archiveWork,
    viewedFiles,
    editRefusal: (file, named) => editorTool.refusal(file, named),
  });
  const editorTool = editorToolOf({
    userSettings,
    git,
    defaultSettingsCopy,
    commanderTool,
    viewEdited: (page, file, at) => viewerTool.viewEdited(page, file, at),
    compareHistory: (page, file) => diffTool.open(page, [file]),
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
    elevated: await runsElevated(process.platform),
    commandPlace,
    windows,
    gitTool,
    editRefusal: (file) => editorTool.refusal(file),
  });
  const diffTool = diffToolOf({
    log,
    userSettings,
    git,
    gitTool,
    viewedFiles,
    closed: (file) => commanderTool.viewClosed(file),
  });
  const viewerTool = viewerToolOf({
    pdfPlaces,
    commanderTool,
    editorTool,
    gitTool,
    diffTool,
    patterns,
  });
  const view = new Shell(log, storage, shellHost, {
    terminal: terminalTool,
    commander: commanderTool,
    git: gitTool,
    viewer: viewerTool,
    editor: editorTool,
    canvas: canvasToolOf(),
    diff: diffTool,
  });
  git.whenFound((found) => {
    logGit(log, found);
    windows.sendToEvery('message', { type: 'about', ...shellHost.about() });
  });
  if (asked.length > 0) {
    void view.openFolders(asked);
  }
  views.resolve({
    shell: view,
    git: gitTool,
    commander: commanderTool,
    viewer: viewerTool,
    editor: editorTool,
    diff: diffTool,
  });
  asking = view;
  const applySettings = () => {
    log.info(strings.log.settingsChanged);
    for (const problem of userSettings.problems) {
      log.warn(plainOf(problem));
    }
    applyTheme(userSettings.settings.theme);
    view.reloadSettings();
    windows.regroup();
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
