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
import { stopRunningGit, writesEnded } from '../tools/git/main/cli/run';
import { errorLine, fileLog, type Log } from '../shell/main/log';
import { imageRoute } from '../tools/git/shared/images';
import { appNameSwitch, titleBarHeight } from '../shell/shared/titleBar';
import {
  keymap,
  pressed,
  pressOfInput,
  setKeyPlatform,
} from '../shell/shared/keymap';
import type { ToHost, ToWebview } from '../shell/shared/protocol';
import { brand, strings } from '../shared/strings';
import {
  readDefaults,
  UserSettings,
  watchSettings,
  writeReadOnly,
  type Settings,
} from '../shell/main/settings';
import { JsonFileStore, Storage, toolState } from '../shell/main/storage';
import { themeCss } from '../shell/main/theme';
import { FilesTool } from '../tools/files/main/tool';
import { hostProcess } from '../tools/terminal/main/hostProcess';
import { shellLaunch } from '../tools/terminal/main/shellLaunch';
import { windowsPtyOf } from '../tools/terminal/main/windowsPty';
import { TerminalTool } from '../tools/terminal/main/tool';
import { GitStorage } from '../tools/git/main/storage';
import { GitTool } from '../tools/git/main/tool';
import { Shell, type Connection } from '../shell/main/shell';
import {
  appFile,
  appOrigin,
  appScheme,
  firstWindowSize,
  isAppUrl,
  keptBounds,
  minimumHeight,
  minimumWidth,
  opensExternally,
  restoresMaximized,
  showAgain,
  startsAppPage,
  visibleBounds,
} from './files';
import { tellMaximized } from './maximized';
import { reloadWhenGone } from './pageGone';
import { profileFolder } from './profile';
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

const dist = __dirname;
const development = !app.isPackaged;
const boundsKey = 'windowBounds';
const maximizedKey = 'windowMaximized';

protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

const userDataDir = profileFolder(
  development,
  app.commandLine.getSwitchValue('user-data-dir'),
  app.getPath('appData'),
);
if (userDataDir) {
  app.setPath('userData', userDataDir);
  app.setPath('logs', path.join(userDataDir, 'logs'));
}

const askedFolders = foldersOf(process.argv, process.defaultApp, process.cwd());

if (app.requestSingleInstanceLock(handOff(askedFolders))) {
  void exitOnFailure(app, start(askedFolders), (error) =>
    dialog.showErrorBox(brand, strings.app.couldNotStart(errorLine(error))),
  );
} else {
  app.quit();
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
  const defaults = readDefaults(path.join(dist, 'settings.json'));
  const userSettingsFile = path.join(profile, 'settings.user.json');
  const defaultSettingsCopy = path.join(profile, 'settings.defaults.json');
  const userSettings = new UserSettings(defaults, userSettingsFile);
  for (const problem of userSettings.problems) {
    log.warn(problem);
  }
  const state = new JsonFileStore(path.join(profile, 'state.json'));
  for (const problem of state.problems) {
    log.warn(problem);
  }
  const views = Promise.withResolvers<{ shell: Shell; git: GitTool }>();
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
    const file = appFile(dist, request.url);
    return file
      ? net.fetch(pathToFileURL(file).toString())
      : new Response(strings.errors.notFound, { status: 404 });
  });
  setMenu();
  const window = createWindow(
    state,
    userSettings.settings,
    gitSearch.then((git) => git.kind === 'found'),
  );
  let asking: Shell | undefined;
  const quitGuard = new QuitGuard(() => asking);
  window.on('close', (event) => {
    if (quitGuard.holds(() => app.quit())) {
      event.preventDefault();
    }
  });
  window.on('query-session-end', () => quitGuard.systemEnding());
  window.on('unresponsive', () => quitGuard.responsive(false));
  window.on('responsive', () => quitGuard.responsive(true));
  powerMonitor.on('shutdown', () => quitGuard.systemEnding());
  let connection: Promise<Connection | undefined> = Promise.resolve(undefined);
  const connect = () => {
    connection = Promise.all([connection, views.promise]).then(
      ([previous, { shell: view }]) => {
        previous?.dispose();
        return view.connect((message: ToWebview) => {
          if (!window.isDestroyed()) {
            window.webContents.send('message', message);
          }
        });
      },
    );
  };
  window.webContents.on('did-start-navigation', (details) => {
    if (startsAppPage(details)) {
      connect();
    }
  });
  reloadWhenGone(window, log);
  ipcMain.on('message', (event, message: ToHost) => {
    if (
      event.sender === window.webContents &&
      event.senderFrame &&
      isAppUrl(event.senderFrame.url)
    ) {
      void connection.then((current) => current?.receive(message));
    }
  });
  tellMaximized(window, (maximized) => {
    if (!window.isDestroyed()) {
      window.webContents.send('maximized', maximized);
    }
  });
  ipcMain.on('windowButtonColor', (event, color: unknown) => {
    if (
      event.sender === window.webContents &&
      typeof color === 'string' &&
      process.platform !== 'darwin'
    ) {
      try {
        window.setTitleBarOverlay({ color: '#00000000', symbolColor: color });
      } catch (error) {
        log.error(strings.log.coloringWindowButtonsFailed);
        log.error(error);
      }
    }
  });
  window.on(
    'closed',
    () => void connection.then((current) => current?.dispose()),
  );
  app.on(
    'second-instance',
    (_event, _argv, _workingDirectory, additionalData) => {
      showAgain(window);
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
    () => Promise.all([state.saved(), userSettings.saved()]),
    stopRunningGit,
  );
  const loading = window.loadURL(`${appOrigin}/index.html`);
  void loading.catch((error: unknown) => {
    log.error(strings.log.pageNotLoaded);
    log.error(error);
  });

  const git = await gitSearch;
  if (git.kind !== 'found') {
    await reportMissingGit(log, git);
    window.destroy();
    app.quit();
    return;
  }
  log.info(strings.log.usingGit(git.version, git.path));
  const storage = new Storage(userSettings, state);
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
      if (!window.isDestroyed()) {
        window.webContents.send('message', message);
      }
    },
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
  const gitTool = new GitTool(
    log,
    git.path,
    new GitStorage(userSettings, toolState(state, 'git')),
    {
      chooseFolders: async () => {
        const chosen = await dialog.showOpenDialog(window, {
          title: strings.app.openRepositories,
          buttonLabel: strings.app.open,
          properties: ['openDirectory', 'multiSelections'],
        });
        return chosen.canceled ? [] : chosen.filePaths;
      },
    },
  );
  const terminalSettings = () => userSettings.settings.tools.terminal;
  const terminalTool = new TerminalTool(
    log,
    hostProcess(path.join(dist, 'ptyHost.js'), log),
    terminalSettings,
    (folder) =>
      shellLaunch(terminalSettings(), folder, {
        platform: process.platform,
        env: process.env,
        home: os.homedir(),
        version: app.getVersion(),
        isFolder: (each) =>
          fs.statSync(each, { throwIfNoEntry: false })?.isDirectory() === true,
        isFile: (file) =>
          fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true,
      }),
    windowsPtyOf(process.platform, os.release()),
  );
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
    },
    { git: gitTool, files: new FilesTool(), terminal: terminalTool },
  );
  if (asked.length > 0) {
    void view.openFolders(asked);
  }
  views.resolve({ shell: view, git: gitTool });
  asking = view;
  app.on('will-quit', () => view.quit());
  const applySettings = () => {
    log.info(strings.log.settingsChanged);
    for (const problem of userSettings.problems) {
      log.warn(problem);
    }
    view.reloadSettings();
    window.webContents.reloadIgnoringCache();
  };
  tryWatching(log, strings.log.watchingSettingsFailed, () =>
    whileWindowOpen(window, (ifOpen) =>
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
      reloadOnRebuild(window, dist, () => {
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

async function searchGit(): Promise<GitSearch> {
  await withLoginShellEnv(process.platform, process.env);
  return findGit();
}

function createWindow(
  store: JsonFileStore,
  settings: Settings,
  shown: Promise<boolean>,
): BrowserWindow {
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const size = firstWindowSize(screen.getPrimaryDisplay().workArea);
  const bounds = visibleBounds(store.get(boundsKey), workAreas);
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
  const maximized = store.get(maximizedKey) === true;
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
  window.on('close', () => {
    void store.update(
      boundsKey,
      reportsUserMoves ? kept.bounds() : window.getNormalBounds(),
    );
    void store.update(maximizedKey, restores());
  });
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
  window.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      pressed(keymap.devTools, pressOfInput(input), false)
    ) {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  return window;
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
