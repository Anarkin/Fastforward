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
import { findGit, minimumGitVersion } from '../git/locate';
import { fileLog, type Log } from '../log';
import type { ToHost, ToWebview } from '../shared/protocol';
import { JsonFileStore, Storage } from '../storage';
import { FastforwardView, type Connection } from '../view';
import { appFile, appOrigin, appScheme, visibleBounds } from './files';
import { loginShellPath, mergePaths } from './shellPath';

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

if (app.requestSingleInstanceLock()) {
  void start();
} else {
  app.quit();
}

async function start(): Promise<void> {
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

  if (process.platform !== 'win32') {
    process.env.PATH = mergePaths(
      await loginShellPath(),
      process.env.PATH,
      path.delimiter,
    );
  }
  const git = await findGit();
  if (git.kind !== 'found') {
    await reportMissingGit(log, git);
    app.quit();
    return;
  }
  log.info(`Using git ${git.version} at ${git.path}`);

  protocol.handle(appScheme, (request) => {
    const file = appFile(dist, request.url);
    return file
      ? net.fetch(pathToFileURL(file).toString())
      : new Response('Not found', { status: 404 });
  });

  const store = new JsonFileStore(
    path.join(app.getPath('userData'), 'settings.json'),
  );
  setMenu();
  const window = createWindow(store);
  const view = new FastforwardView(log, git.path, new Storage(store), {
    chooseFolders: async () => {
      const chosen = await dialog.showOpenDialog(window, {
        title: 'Open Repositories',
        buttonLabel: 'Open',
        properties: ['openDirectory', 'multiSelections'],
      });
      return chosen.canceled ? [] : chosen.filePaths;
    },
  });

  let connection: Connection | undefined;
  const connect = () => {
    connection?.dispose();
    connection = view.connect((message: ToWebview) => {
      if (!window.isDestroyed()) {
        window.webContents.send('message', message);
      }
    });
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
      void connection?.receive(message);
    }
  });
  window.on('closed', () => connection?.dispose());
  app.on('second-instance', () => {
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  });
  app.on('window-all-closed', () => {
    void store.saved().finally(() => app.quit());
  });
  if (development && process.env.FASTFORWARD_DEV) {
    reloadOnRebuild(window);
  }
  await window.loadURL(`${appOrigin}/index.html`);
}

function createWindow(store: JsonFileStore): BrowserWindow {
  const bounds = visibleBounds(
    store.get(boundsKey),
    screen.getAllDisplays().map((display) => display.workArea),
  );
  const window = new BrowserWindow({
    ...(bounds ?? { width: 1400, height: 900 }),
    minWidth: 640,
    minHeight: 400,
    title: 'Fastforward',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121314' : '#ffffff',
    icon:
      process.platform === 'darwin' ? undefined : path.join(dist, 'icon.png'),
    webPreferences: {
      preload: path.join(dist, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  if (store.get(maximizedKey, false)) {
    window.maximize();
  }
  window.once('ready-to-show', () => window.show());
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

function reloadOnRebuild(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined;
  fs.watch(dist, (_event, file) => {
    if (file?.startsWith('webview.')) {
      clearTimeout(timer);
      timer = setTimeout(() => window.webContents.reloadIgnoringCache(), 100);
    }
  });
}
