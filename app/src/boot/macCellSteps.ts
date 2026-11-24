import koffi from 'koffi';
import type { BrowserWindow } from 'electron';
import { gridAround, type CellGrid } from '../shell/shared/cellGrid';
import { structOnce } from '../lib/main/koffiTypes';
import { fittedSize } from './cellFit';
import { leastClient, resting, towardOf, type CellSteps } from './cellSteps';
import { windowPixels } from './windowPixels';

const sizeType = 'CellStepsSize';
const pointType = 'CellStepsPoint';
const frameType = 'CellStepsFrame';

interface Frame {
  readonly origin: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
}

const numberOf = (value: unknown, key: string): number => {
  const read: unknown =
    typeof value === 'object' && value !== null
      ? Reflect.get(value, key)
      : undefined;
  return typeof read === 'number' ? read : 0;
};

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;

const frameOf = (value: unknown): Frame => ({
  origin: {
    x: numberOf(fieldOf(value, 'origin'), 'x'),
    y: numberOf(fieldOf(value, 'origin'), 'y'),
  },
  size: {
    width: numberOf(fieldOf(value, 'size'), 'width'),
    height: numberOf(fieldOf(value, 'size'), 'height'),
  },
});

const unstepped = { width: 1, height: 1 };

export function macCellSteps(): CellSteps | undefined {
  if (process.arch !== 'arm64') {
    return undefined;
  }
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  structOnce(sizeType, { width: 'double', height: 'double' });
  structOnce(pointType, { x: 'double', y: 'double' });
  structOnce(frameType, { origin: pointType, size: sizeType });
  const selector = objc.func('void *sel_registerName(const char *name)');
  const send = (result: string, ...parameters: string[]) =>
    objc.func('objc_msgSend', result, ['void *', 'void *', ...parameters]);
  const object = send('void *');
  const double = send('double');
  const frame = send(frameType);
  const contentOf = send(frameType, frameType);
  const setSize = send('void', sizeType);
  const selectors = {
    window: selector('window'),
    scale: selector('backingScaleFactor'),
    frame: selector('frame'),
    content: selector('contentRectForFrameRect:'),
    increments: selector('setContentResizeIncrements:'),
  };
  const nsWindowOf = (window: BrowserWindow): unknown =>
    object(
      koffi.decode(window.getNativeWindowHandle(), 'void *'),
      selectors.window,
    );
  const fit = (window: BrowserWindow, nsWindow: unknown, grid: CellGrid) => {
    if (!resting(window)) {
      return;
    }
    const scale = Number(double(nsWindow, selectors.scale)) || 1;
    const outer = frameOf(frame(nsWindow, selectors.frame));
    const content = frameOf(contentOf(nsWindow, selectors.content, outer));
    const pixels = {
      width: Math.round(content.size.width * scale),
      height: Math.round(content.size.height * scale),
    };
    const fitted = fittedSize(
      pixels,
      grid,
      leastClient(window, scale, {
        width: Math.round((outer.size.width - content.size.width) * scale),
        height: Math.round((outer.size.height - content.size.height) * scale),
      }),
      Number.isInteger(scale) ? scale : 1,
      towardOf(window),
    );
    if (fitted.width !== pixels.width || fitted.height !== pixels.height) {
      windowPixels().sizeClientTo(window, fitted);
    }
  };
  return {
    follow: (window, report) => {
      const nsWindow = nsWindowOf(window);
      if (nsWindow === null) {
        return;
      }
      const scale = Number(double(nsWindow, selectors.scale)) || 1;
      const outer = frameOf(frame(nsWindow, selectors.frame));
      const content = frameOf(contentOf(nsWindow, selectors.content, outer));
      const grid =
        report === undefined
          ? undefined
          : gridAround(
              report,
              {
                width: Math.round(content.size.width * scale),
                height: Math.round(content.size.height * scale),
              },
              scale,
            );
      if (grid === undefined) {
        setSize(nsWindow, selectors.increments, unstepped);
        return;
      }
      setSize(nsWindow, selectors.increments, {
        width: grid.cell.width / scale,
        height: grid.cell.height / scale,
      });
      fit(window, nsWindow, grid);
    },
  };
}
