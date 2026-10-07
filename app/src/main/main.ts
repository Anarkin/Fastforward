import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  screen,
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { findGit, minimumGitVersion, type GitSearch } from '../git/locate';
import { errorLine, fileLog, type Log } from '../log';
import { appNameSwitch, titleBarHeight } from '../shared/titleBar';
import { keymap, pressed, pressOfInput } from '../shared/keymap';
import type { ToHost, ToWebview } from '../shared/protocol';
import { brand, strings } from '../shared/strings';
import {
  migrateProfile,
  readDefaults,
  UserSettings,
  watchSettings,
  writeReadOnly,
  type Settings,
} from '../settings';
import { JsonFileStore, Storage } from '../storage';
import { themeCss } from '../theme';
import { FastforwardView, type Connection } from '../view';
import {
  appFile,
  appOrigin,
  appScheme,
  firstWindowSize,
  isAppUrl,
  keptBounds,
  minimumHeight,
  minimumWindowSize,
  opensExternally,
  restoresMaximized,
  visibleBounds,
} from './files';
import { profileFolder } from './profile';
import { exitOnFailure, flushBeforeQuit } from './quit';
import { reloadOnRebuild } from './rebuild';
import { loginShellPath, mergePaths } from './shellPath';
import { checksForUpdates } from './updates';

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

if (app.requestSingleInstanceLock()) {
  void exitOnFailure(app, start(), (error) =>
    dialog.showErrorBox(brand, strings.app.couldNotStart(errorLine(error))),
  );
} else {
  app.quit();
}

async function start(): Promise<void> {
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
  if (migrateProfile(profile, defaults)) {
    log.info(strings.log.movedSettings);
  }
  const userSettingsFile = path.join(profile, 'settings.user.json');
  const defaultSettingsCopy = path.join(profile, 'settings.defaults.json');
  const userSettings = new UserSettings(defaults, userSettingsFile);
  for (const problem of userSettings.problems) {
    log.warn(problem);
  }
  const state = new JsonFileStore(path.join(profile, 'state.json'));
  protocol.handle(appScheme, (request) => {
    if (new URL(request.url).pathname === '/theme.css') {
      return new Response(themeCss(userSettings.settings), {
        headers: { 'content-type': 'text/css', 'cache-control': 'no-store' },
      });
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
  const views = Promise.withResolvers<FastforwardView>();
  let connection: Promise<Connection | undefined> = Promise.resolve(undefined);
  const connect = () => {
    connection = Promise.all([connection, views.promise]).then(
      ([previous, view]) => {
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
    if (details.isMainFrame && !details.isSameDocument) {
      connect();
    }
  });
  ipcMain.on('message', (event, message: ToHost) => {
    if (
      event.sender === window.webContents &&
      event.senderFrame &&
      isAppUrl(event.senderFrame.url)
    ) {
      void connection.then((current) => current?.receive(message));
    }
  });
  ipcMain.on('windowButtonColor', (event, color: unknown) => {
    if (
      event.sender === window.webContents &&
      typeof color === 'string' &&
      process.platform !== 'darwin'
    ) {
      window.setTitleBarOverlay({ color: '#00000000', symbolColor: color });
    }
  });
  window.on(
    'closed',
    () => void connection.then((current) => current?.dispose()),
  );
  app.on('second-instance', () => {
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  flushBeforeQuit(app, () =>
    Promise.all([state.saved(), userSettings.saved()]),
  );
  const loading = window.loadURL(`${appOrigin}/index.html`);

  const git = await gitSearch;
  if (git.kind !== 'found') {
    await reportMissingGit(log, git);
    window.destroy();
    app.quit();
    return;
  }
  log.info(strings.log.usingGit(git.version, git.path));
  const storage = new Storage(userSettings, state);
  const view = new FastforwardView(log, git.path, storage, {
    chooseFolders: async () => {
      const chosen = await dialog.showOpenDialog(window, {
        title: strings.app.openRepositories,
        buttonLabel: strings.app.open,
        properties: ['openDirectory', 'multiSelections'],
      });
      return chosen.canceled ? [] : chosen.filePaths;
    },
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
  });
  views.resolve(view);
  const applySettings = () => {
    log.info(strings.log.settingsChanged);
    for (const problem of userSettings.problems) {
      log.warn(problem);
    }
    view.reloadSettings();
    window.webContents.reloadIgnoringCache();
  };
  tryWatching(log, strings.log.watchingSettingsFailed, () =>
    watchSettings(userSettingsFile, () => {
      if (userSettings.reload()) {
        applySettings();
      }
    }),
  );

  if (development && process.env.FASTFORWARD_DEV) {
    if (process.connected) {
      process.on('disconnect', () => app.quit());
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
  void loading.then(() => checkForUpdates(log));
}

async function searchGit(): Promise<GitSearch> {
  if (process.platform !== 'win32') {
    process.env.PATH = mergePaths(
      await loginShellPath(),
      process.env.PATH,
      path.delimiter,
    );
  }
  return findGit();
}

function checkForUpdates(log: Log): void {
  if (!checksForUpdates(development, process.platform, process.execPath)) {
    return;
  }
  autoUpdater.logger = {
    info: (message: unknown) => log.info(strings.log.updater(String(message))),
    warn: (message: unknown) => log.warn(strings.log.updater(String(message))),
    error: (message: unknown) =>
      log.error(strings.log.updater(String(message))),
    debug: () => {},
  };
  autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
    log.error(strings.log.updateCheckFailed);
    log.error(error);
  });
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
    minWidth: minimumWindowSize.width,
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
  window.on('resized', kept.changed);
  window.on('moved', kept.changed);
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
