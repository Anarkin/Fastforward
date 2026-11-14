import * as path from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
  shell,
} from 'electron';
import type { Log } from '../shell/main/log';
import { appNameSwitch, titleBarHeight } from '../shell/shared/titleBar';
import { shellKeymap } from '../shell/shared/keymap';
import { pressed, pressOfInput } from '../lib/shared/keymap';
import type { ToHost, ToWebview } from '../shell/shared/protocol';
import { brand, strings } from '../lib/shared/strings';
import type { Settings } from '../shell/main/settings';
import type { JsonFileStore, Storage } from '../shell/main/storage';
import type { Connection, DragEvent, Shell } from '../shell/main/shell';
import { spareWindowIds } from '../shell/main/windows';
import {
  appOrigin,
  cascaded,
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
  tearsOffTabs,
  visibleBounds,
} from './files';
import { tellMaximized } from './maximized';
import { TabDrag, type DragHost, type DragWindow } from './tabDrag';
import type { Strip } from '../shell/main/hostTypes';
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
import type { QuitGuard } from './quitGuard';

interface OpenedWindow {
  readonly window: BrowserWindow;
  readonly place: () => Place;
  loading: Promise<void>;
  connection: Promise<Connection | undefined>;
  closing: boolean;
}

export interface AppWindowsDeps {
  readonly log: Log;
  readonly dist: string;
  readonly development: boolean;
  readonly storage: Storage;
  readonly state: JsonFileStore;
  readonly settings: () => Settings;
  readonly quitGuard: QuitGuard;
  readonly views: Promise<{ readonly shell: Shell }>;
  readonly gitFound: Promise<boolean>;
  readonly asking: () => Shell | undefined;
}

export class AppWindows {
  private readonly opened = new Map<string, OpenedWindow>();
  private focused: string | undefined;
  private readonly strips = new Map<string, Strip>();
  private frontToBack: string[] = [];
  private drag: TabDrag | undefined;
  private spare:
    { readonly id: string; readonly entry: OpenedWindow } | undefined;
  private readonly spareId: () => string;
  private readonly dragHost: DragHost;
  readonly everyWindow;

  constructor(private readonly deps: AppWindowsDeps) {
    this.spareId = spareWindowIds(deps.storage.layout);
    this.dragHost = {
      windows: () =>
        this.frontToBack.flatMap((id) => this.dragWindowOf(id) ?? []),
      tearOff: (tab, from) => {
        const source = this.opened.get(from);
        const asking = deps.asking();
        if (source === undefined || asking === undefined) {
          return undefined;
        }
        this.keepSpare();
        const taken = this.spare;
        if (taken === undefined) {
          return undefined;
        }
        this.spare = undefined;
        this.opened.set(taken.id, taken.entry);
        this.frontToBack = [taken.id, ...this.frontToBack];
        const size = source.window.getNormalBounds();
        taken.entry.window.setSize(size.width, size.height);
        void asking.tearOff(tab, taken.id);
        return this.dragWindowOf(taken.id);
      },
      visit: (window, visit) => deps.asking()?.visit(window, visit),
      move: (tab, into, index) => void deps.asking()?.moveTab(tab, into, index),
      close: (window) => this.close(window),
      focus: (window) => {
        const entry = this.opened.get(window);
        if (entry !== undefined && !entry.window.isDestroyed()) {
          entry.window.setAlwaysOnTop(false);
          entry.window.setOpacity(1);
          showAgain(entry.window);
        }
      },
    };
    this.everyWindow = {
      isDestroyed: () => this.opened.size === 0,
      once: (_event: 'closed', listener: () => void) =>
        app.once('will-quit', listener),
      on: (_event: 'closed', listener: () => void) =>
        app.once('will-quit', listener),
      webContents: {
        reloadIgnoringCache: () => {
          for (const { window } of [
            ...this.opened.values(),
            ...(this.spare === undefined ? [] : [this.spare.entry]),
          ]) {
            if (!window.isDestroyed()) {
              window.webContents.reloadIgnoringCache();
            }
          }
        },
      },
    };
  }

  focusedWindow(): BrowserWindow | undefined {
    return (
      (this.focused === undefined
        ? undefined
        : this.opened.get(this.focused)) ?? [...this.opened.values()].at(-1)
    )?.window;
  }

  listen(): void {
    const fromApp = (event: Electron.IpcMainEvent): OpenedWindow | undefined =>
      event.senderFrame !== null && isAppUrl(event.senderFrame.url)
        ? this.openedBy(event.sender)
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
      const entry = this.openedBy(event.sender);
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
          this.deps.log.error(strings.log.coloringWindowButtonsFailed);
          this.deps.log.error(error);
        }
      }
    });
  }

  openLaidOut(): Promise<void> {
    const { storage, state, gitFound } = this.deps;
    const [firstWindow] = storage.layout.map((window, index) =>
      this.open(
        window.id,
        savedPlace((key) => state.get(key), window.id, index === 0),
      ),
    );
    const loading = firstWindow?.loading ?? Promise.resolve();
    void Promise.all([loading, gitFound]).then(([, found]) => {
      if (found) {
        this.keepSpare();
      }
    });
    return loading;
  }

  destroyAll(): void {
    for (const { window } of this.opened.values()) {
      window.destroy();
    }
  }

  sendToEvery(channel: string, message: unknown): void {
    for (const { window } of this.opened.values()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, message);
      }
    }
  }

  openNear(id: string, near: string | undefined): void {
    const from = near === undefined ? undefined : this.opened.get(near)?.window;
    const bounds =
      from === undefined || from.isDestroyed()
        ? undefined
        : cascaded(
            from.getNormalBounds(),
            screen.getDisplayMatching(from.getNormalBounds()).workArea,
          );
    this.open(id, { bounds, maximized: false });
  }

  close(id: string): void {
    const entry = this.opened.get(id);
    if (entry !== undefined && !entry.window.isDestroyed()) {
      entry.closing = true;
      entry.window.close();
    }
  }

  show(id: string): void {
    const entry = this.opened.get(id);
    if (entry !== undefined) {
      showAgain(entry.window);
    }
  }

  dragged(window: string, event: DragEvent): void {
    switch (event.kind) {
      case 'strip':
        this.strips.set(window, event.strip);
        return;
      case 'start': {
        const source = this.dragWindowOf(window);
        if (
          this.drag === undefined &&
          source !== undefined &&
          tearsOffTabs(process.platform, process.env) &&
          (!event.alone || this.opened.size > 1)
        ) {
          this.drag = TabDrag.start(this.dragHost, source, event);
        }
        return;
      }
      case 'move':
        if (this.drag?.source.id === window) {
          this.drag.move(event.at);
        }
        return;
      case 'index':
        this.drag?.index(window, event.index);
        return;
      case 'drop':
      case 'cancel': {
        const ended = this.drag;
        if (ended?.source.id !== window) {
          return;
        }
        this.drag = undefined;
        if (event.kind === 'drop') {
          ended.drop();
        } else {
          ended.cancel();
        }
        this.keepSpare();
      }
    }
  }

  private windowIds(): string[] {
    return this.deps.storage.layout.map((window) => window.id);
  }

  private savePlace(id: string, entry: OpenedWindow): void {
    const { state } = this.deps;
    void state.update(
      placesKey,
      withPlace(state.get(placesKey), id, entry.place(), this.windowIds()),
    );
    for (const key of [boundsKey, maximizedKey]) {
      if (state.get(key) !== undefined) {
        void state.update(key, undefined);
      }
    }
  }

  private open(id: string, saved: SavedPlace, kept = false): OpenedWindow {
    const { log, quitGuard, views, gitFound } = this.deps;
    const { window, place } = createWindow(
      saved,
      this.deps.settings(),
      kept ? Promise.resolve(false) : gitFound,
      this.deps.dist,
      this.deps.development,
    );
    const entry: OpenedWindow = {
      window,
      place,
      loading: Promise.resolve(),
      connection: Promise.resolve(undefined),
      closing: false,
    };
    if (!kept) {
      this.opened.set(id, entry);
      this.frontToBack = [id, ...this.frontToBack];
    }
    window.on('focus', () => {
      this.focused = id;
      this.frontToBack = [
        id,
        ...this.frontToBack.filter((other) => other !== id),
      ];
      this.deps.asking()?.focus(id);
    });
    window.on('close', (event) => {
      if (this.opened.get(id) !== entry) {
        return;
      }
      const closing = quitGuard.closing(this.opened.size === 1, () =>
        app.quit(),
      );
      if (closing === 'held') {
        event.preventDefault();
        return;
      }
      if (closing === 'quits') {
        this.savePlace(id, entry);
        return;
      }
      const asking = this.deps.asking();
      if (
        !entry.closing &&
        asking?.asksBeforeClosing(id) === true &&
        asking.askToCloseWindow(id)
      ) {
        event.preventDefault();
        return;
      }
      asking?.closeWindow(id);
      this.savePlace(id, entry);
    });
    window.on('query-session-end', () => quitGuard.systemEnding());
    window.on('unresponsive', () => quitGuard.responsive(id, false));
    window.on('responsive', () => quitGuard.responsive(id, true));
    window.webContents.on('did-start-navigation', (details) => {
      if (startsAppPage(details)) {
        entry.connection = Promise.all([entry.connection, views]).then(
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
      quitGuard.forget(id);
      disconnect();
      this.strips.delete(id);
      this.frontToBack = this.frontToBack.filter((other) => other !== id);
      if (this.spare?.entry === entry) {
        this.spare = undefined;
      }
      if (this.opened.get(id) === entry) {
        this.opened.delete(id);
      }
      if (this.focused === id) {
        this.focused = undefined;
      }
      if (this.opened.size === 0) {
        this.spare?.entry.window.destroy();
      }
    });
    entry.loading = window.loadURL(`${appOrigin}/index.html`);
    void entry.loading.catch((error: unknown) => {
      log.error(strings.log.pageNotLoaded);
      log.error(error);
    });
    return entry;
  }

  private openedBy(sender: Electron.WebContents): OpenedWindow | undefined {
    return [
      ...this.opened.values(),
      ...(this.spare === undefined ? [] : [this.spare.entry]),
    ].find(
      ({ window }) => !window.isDestroyed() && window.webContents === sender,
    );
  }

  private keepSpare(): void {
    if (
      this.spare === undefined &&
      !this.deps.quitGuard.quits &&
      this.opened.size > 0
    ) {
      const id = this.spareId();
      this.spare = {
        id,
        entry: this.open(id, { bounds: undefined, maximized: false }, true),
      };
    }
  }

  private dragWindowOf(id: string): DragWindow | undefined {
    const entry = this.opened.get(id);
    if (entry === undefined || entry.window.isDestroyed()) {
      return undefined;
    }
    const { window } = entry;
    return {
      id,
      bounds: () => window.getBounds(),
      contentBounds: () => window.getContentBounds(),
      strip: () => this.strips.get(id),
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
  }
}

function createWindow(
  saved: SavedPlace,
  settings: Settings,
  shown: Promise<boolean>,
  dist: string,
  development: boolean,
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
      pressed(shellKeymap.devTools, pressOfInput(input), false)
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
