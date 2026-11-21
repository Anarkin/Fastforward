import * as path from 'node:path';
import { app, BrowserWindow, nativeTheme, screen, shell } from 'electron';
import { titleBarHeight } from '../shell/shared/titleBar';
import { appNameSwitch } from '../shell/shared/bridge';
import { shellKeymap } from '../shell/shared/keymap';
import { pressed, pressOfInput } from '../lib/shared/keymap';
import { brand, strings } from '../lib/shared/strings';
import type { Settings } from '../shell/main/settings';
import { keepOnAppPage, lockDown, opensExternally } from './lockDown';
import {
  firstWindowSize,
  minimumHeight,
  minimumWidth,
  restoresMaximized,
  visibleBounds,
} from './windowPlacement';
import { keptBounds } from './savedBounds';
import { windowPixels } from './windowPixels';
import type { Place, SavedPlace } from './places';

export function createWindow(
  saved: SavedPlace,
  settings: Settings,
  shown: boolean,
  dist: string,
  development: boolean,
): { readonly window: BrowserWindow; readonly place: () => Place } {
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const size = firstWindowSize(screen.getPrimaryDisplay().workArea);
  const bounds = visibleBounds(saved.bounds, workAreas);
  const least = {
    width: minimumWidth(workAreas),
    height: minimumHeight(workAreas),
  };
  const window = new BrowserWindow({
    ...(bounds ?? size),
    minWidth: least.width,
    minHeight: least.height,
    title: brand,
    show: false,
    backgroundColor: (nativeTheme.shouldUseDarkColors
      ? settings.colors.dark
      : settings.colors.light
    ).background,
    icon:
      process.platform === 'darwin'
        ? undefined
        : path.join(
            dist,
            process.platform === 'win32' ? 'icon.ico' : 'icon.png',
          ),
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
  const asked = bounds ?? size;
  windowPixels().sizeTo(window, {
    width: Math.max(asked.width, least.width),
    height: Math.max(asked.height, least.height),
  });
  window.once('ready-to-show', () => {
    if (shown) {
      if (maximized) {
        window.maximize();
      }
      window.show();
    }
  });
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
  keepOnAppPage(window.webContents);
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
