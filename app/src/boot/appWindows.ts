import { app, type BrowserWindow, ipcMain, screen } from 'electron';
import type { Log } from '../shell/main/log';
import type { ToHost, ToWebview } from '../shell/shared/protocol';
import { strings } from '../lib/shared/strings';
import type { Settings } from '../shell/main/settings';
import type { JsonFileStore } from '../shell/main/stateFile';
import type { Storage } from '../shell/main/storage';
import type { Connection, Shell } from '../shell/main/shell';
import type { DragEvent } from '../shell/main/dragEvents';
import { spareWindowIds } from '../shell/main/windows';
import { appPage, isAppUrl, startsAppPage } from './files';
import { cascaded } from './windowPlacement';
import { showAgain } from './showAgain';
import { tellMaximized } from './maximized';
import { WindowDrag } from './windowDrag';
import { prepareWindowPixels, windowPixels } from './windowPixels';
import { createWindow } from './browserWindow';
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
  readonly asking: () => Shell | undefined;
}

export class AppWindows {
  private readonly opened = new Map<string, OpenedWindow>();
  private focused: string | undefined;
  private frontToBack: string[] = [];
  private spare:
    { readonly id: string; readonly entry: OpenedWindow } | undefined;
  private readonly spareId: () => string;
  private readonly windowDrag: WindowDrag;
  private readonly pixelsReady: Promise<void>;
  readonly everyWindow;

  constructor(private readonly deps: AppWindowsDeps) {
    this.pixelsReady = prepareWindowPixels(process.platform);
    this.spareId = spareWindowIds(deps.storage.layout);
    this.windowDrag = new WindowDrag({
      frontToBack: () => this.frontToBack,
      windowOf: (id) => this.opened.get(id)?.window,
      windowCount: () => this.opened.size,
      takeSpare: (source) => this.takeSpare(source),
      keepSpare: () => this.keepSpare(),
      close: (id) => this.close(id),
      asking: () => deps.asking(),
    });
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
      const entry = fromApp(event);
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

  async openLaidOut(): Promise<void> {
    await this.pixelsReady;
    const { storage, state } = this.deps;
    const [firstWindow] = storage.layout.map((window, index) =>
      this.open(
        window.id,
        savedPlace((key) => state.get(key), window.id, index === 0),
      ),
    );
    const loading = firstWindow?.loading ?? Promise.resolve();
    void loading.then(() => this.keepSpare());
    await loading;
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
    this.windowDrag.dragged(window, event);
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
    const { log, quitGuard, views } = this.deps;
    const { window, place } = createWindow(
      saved,
      this.deps.settings(),
      !kept,
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
      this.windowDrag.forget(id);
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
    entry.loading = window.loadURL(appPage);
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

  private takeSpare(source: BrowserWindow): string | undefined {
    this.keepSpare();
    const taken = this.spare;
    if (taken === undefined) {
      return undefined;
    }
    this.spare = undefined;
    this.opened.set(taken.id, taken.entry);
    this.frontToBack = [taken.id, ...this.frontToBack];
    windowPixels().sizeLike(taken.entry.window, source);
    return taken.id;
  }
}
