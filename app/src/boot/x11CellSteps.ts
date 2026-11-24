import koffi from 'koffi';
import { app, type BrowserWindow } from 'electron';
import { structOnce } from '../lib/main/koffiTypes';
import { electronClient, fitByElectron, type CellSteps } from './cellSteps';
import { gridAround } from '../shell/shared/cellGrid';

const hintsType = 'CellStepsSizeHints';
const aspectType = 'CellStepsAspect';

const resizeSteps = 1 << 6;
const baseSize = 1 << 8;

const xidOf = (window: BrowserWindow) =>
  Number(window.getNativeWindowHandle().readBigUInt64LE(0));

export const onWayland = (
  environment: NodeJS.ProcessEnv,
  platformSwitch: string,
): boolean =>
  platformSwitch !== 'x11' &&
  (platformSwitch === 'wayland' ||
    (environment.WAYLAND_DISPLAY ?? '') !== '' ||
    environment.XDG_SESSION_TYPE === 'wayland');

export function x11CellSteps(): CellSteps | undefined {
  if (
    onWayland(process.env, app.commandLine.getSwitchValue('ozone-platform'))
  ) {
    return undefined;
  }
  const x11 = koffi.load('libX11.so.6');
  structOnce(aspectType, { x: 'int', y: 'int' });
  structOnce(hintsType, {
    flags: 'long',
    x: 'int',
    y: 'int',
    width: 'int',
    height: 'int',
    min_width: 'int',
    min_height: 'int',
    max_width: 'int',
    max_height: 'int',
    width_inc: 'int',
    height_inc: 'int',
    min_aspect: aspectType,
    max_aspect: aspectType,
    base_width: 'int',
    base_height: 'int',
    win_gravity: 'int',
  });
  const openDisplay = x11.func('void *XOpenDisplay(const char *name)');
  const closeDisplay = x11.func('int XCloseDisplay(void *display)');
  const flush = x11.func('int XFlush(void *display)');
  const readHints = x11.func(
    `int XGetWMNormalHints(void *display, unsigned long window, _Out_ ${hintsType} *hints, _Out_ long *supplied)`,
  );
  const writeHints = x11.func(
    `void XSetWMNormalHints(void *display, unsigned long window, ${hintsType} *hints)`,
  );
  const hinted = (
    window: BrowserWindow,
    change: (hints: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const display: unknown = openDisplay(null);
    if (display === null) {
      return;
    }
    try {
      const xid = xidOf(window);
      const hints: Record<string, unknown> = {};
      if (Number(readHints(display, xid, hints, [0])) !== 0) {
        writeHints(display, xid, change(hints));
        flush(display);
      }
    } finally {
      closeDisplay(display);
    }
  };
  return {
    follow: (window, report) => {
      if (window.isDestroyed()) {
        return;
      }
      const grid =
        report === undefined
          ? undefined
          : gridAround(report, electronClient(window));
      hinted(window, (hints) => {
        const flags = Number(hints.flags) & ~(resizeSteps | baseSize);
        return grid === undefined
          ? { ...hints, flags }
          : {
              ...hints,
              flags: flags | resizeSteps | baseSize,
              width_inc: grid.cell.width,
              height_inc: grid.cell.height,
              base_width: grid.around.width,
              base_height: grid.around.height,
            };
      });
      if (grid !== undefined) {
        fitByElectron(window, grid);
      }
    },
  };
}
