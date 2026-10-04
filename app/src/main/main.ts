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
import { findGit, minimumGitVersion } from '../git/locate';
import { fileLog, type Log } from '../log';
import { appName, appNameSwitch, titleBarHeight } from '../shared/titleBar';
import type { ToHost, ToWebview } from '../shared/protocol';
import {
  migrateProfile,
  readDefaults,
  UserSettings,
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
  minimumWindowSize,
  rebuilt,
  visibleBounds,
} from './files';
import { profileFolder } from './profile';
import { flushBeforeQuit } from './quit';
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
  void start();
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
    `Fastforward ${app.getVersion()} on ${process.platform} ${process.arch}, Electron ${process.versions.electron}`,
  );
  process.on('uncaughtException', (error) => log.error(error));
  process.on('unhandledRejection', (reason) =>
    log.error(reason instanceof Error ? reason : String(reason)),
  );

  const profile = app.getPath('userData');
  const defaults = readDefaults(path.join(dist, 'settings.json'));
  if (migrateProfile(profile, defaults)) {
    log.info('Moved the settings into settings.user.json and state.json');
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
      : new Response('Not found', { status: 404 });
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
      event.senderFrame?.url.startsWith(appOrigin)
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
  log.info(`Using git ${git.version} at ${git.path}`);
  const storage = new Storage(userSettings, state);
  const view = new FastforwardView(log, git.path, storage, {
    chooseFolders: async () => {
      const chosen = await dialog.showOpenDialog(window, {
        title: 'Open Repositories',
        buttonLabel: 'Open',
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
    log.info('Settings changed, reloading');
    for (const problem of userSettings.problems) {
      log.warn(problem);
    }
    view.reloadSettings();
    window.webContents.reloadIgnoringCache();
  };
  watchUserSettings(userSettingsFile, () => {
    if (userSettings.reload()) {
      applySettings();
    }
  });

  if (development && process.env.FASTFORWARD_DEV) {
    reloadOnRebuild(window, () => {
      try {
        if (
          userSettings.replaceDefaults(
            readDefaults(path.join(dist, 'settings.json')),
          )
        ) {
          applySettings();
        }
      } catch (error) {
        log.error('Reading the rebuilt default settings failed');
        log.error(error instanceof Error ? error : String(error));
      }
    });
  }
  await loading;
  checkForUpdates(log);
}

async function searchGit(): ReturnType<typeof findGit> {
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
    info: (message: unknown) => log.info(`Updater: ${String(message)}`),
    warn: (message: unknown) => log.warn(`Updater: ${String(message)}`),
    error: (message: unknown) => log.error(`Updater: ${String(message)}`),
    debug: () => {},
  };
  autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
    log.error('Checking for updates failed');
    log.error(error instanceof Error ? error : String(error));
  });
}

function createWindow(
  store: JsonFileStore,
  settings: Settings,
  shown: Promise<boolean>,
): BrowserWindow {
  const bounds = visibleBounds(
    store.get(boundsKey),
    screen.getAllDisplays().map((display) => display.workArea),
  );
  const window = new BrowserWindow({
    ...(bounds ?? { width: 1400, height: 900 }),
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    title: 'Fastforward',
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
        appNameSwitch + appName(app.getVersion(), development),
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
  window.on('close', () => {
    void store.update(boundsKey, window.getNormalBounds());
    void store.update(maximizedKey, window.isMaximized());
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin)) {
      event.preventDefault();
    }
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      input.shift &&
      (input.control || input.meta) &&
      input.key.toLowerCase() === 'i'
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
  git: Exclude<Awaited<ReturnType<typeof findGit>>, { kind: 'found' }>,
): Promise<void> {
  const needed = minimumGitVersion.join('.');
  const detail =
    git.kind === 'missing'
      ? `Install git ${needed} or later, make sure it is on the PATH, then start Fastforward again.`
      : `Git ${git.version} at ${git.path} is too old. Install git ${needed} or later, then start Fastforward again.`;
  log.error(detail);
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'Fastforward',
    message: 'Fastforward needs git',
    detail,
    buttons: ['Download Git', 'Quit'],
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
    log.error(`Opening ${file} failed: ${failure}`);
  }
}

function watchUserSettings(file: string, onChange: () => void): void {
  let timer: NodeJS.Timeout | undefined;
  fs.watch(path.dirname(file), (_event, name) => {
    if (name === path.basename(file)) {
      clearTimeout(timer);
      timer = setTimeout(onChange, 200);
    }
  });
}

function reloadOnRebuild(window: BrowserWindow, onDefaults: () => void): void {
  let page: NodeJS.Timeout | undefined;
  let defaults: NodeJS.Timeout | undefined;
  fs.watch(dist, (_event, file) => {
    const change = rebuilt(file);
    if (change === 'page') {
      clearTimeout(page);
      page = setTimeout(() => window.webContents.reloadIgnoringCache(), 100);
    } else if (change === 'defaults') {
      clearTimeout(defaults);
      defaults = setTimeout(onDefaults, 100);
    }
  });
}
