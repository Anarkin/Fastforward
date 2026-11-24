import koffi from 'koffi';
import { screen, type BrowserWindow } from 'electron';
import {
  gridAround,
  type CellGrid,
  type CellReport,
} from '../shell/shared/cellGrid';
import { structOnce } from '../lib/main/koffiTypes';
import { draggedTo, fittedSize, type DraggedEdge, type Edges } from './cellFit';
import { leastClient, resting, towardOf, type CellSteps } from './cellSteps';
import { windowPixels } from './windowPixels';

const sizing = 0x0214;
const enterSizeMove = 0x0231;
const exitSizeMove = 0x0232;

const draggedEdges: Readonly<Record<number, DraggedEdge>> = {
  1: 'left',
  2: 'right',
  3: 'top',
  4: 'topLeft',
  5: 'topRight',
  6: 'bottom',
  7: 'bottomLeft',
  8: 'bottomRight',
};

const rectType = 'CellStepsRect';

const edgeOf = (value: unknown, key: keyof Edges): number => {
  const read: unknown =
    typeof value === 'object' && value !== null
      ? Reflect.get(value, key)
      : undefined;
  return typeof read === 'number' ? read : 0;
};

const edgesOf = (value: unknown): Edges => ({
  left: edgeOf(value, 'left'),
  top: edgeOf(value, 'top'),
  right: edgeOf(value, 'right'),
  bottom: edgeOf(value, 'bottom'),
});

const scaleOf = (window: BrowserWindow) =>
  screen.getDisplayMatching(window.getBounds()).scaleFactor;

const frameOf = (sizes: {
  readonly outer: { readonly width: number; readonly height: number };
  readonly client: { readonly width: number; readonly height: number };
}) => ({
  width: sizes.outer.width - sizes.client.width,
  height: sizes.outer.height - sizes.client.height,
});

const handleOf = (window: BrowserWindow): unknown =>
  koffi.decode(window.getNativeWindowHandle(), 'void *');

export function windowsCellSteps(): CellSteps {
  const user32 = koffi.load('user32.dll');
  structOnce(rectType, {
    left: 'int32_t',
    top: 'int32_t',
    right: 'int32_t',
    bottom: 'int32_t',
  });
  const windowRect = user32.func(
    `bool GetWindowRect(void *window, _Out_ ${rectType} *rect)`,
  );
  const clientRect = user32.func(
    `bool GetClientRect(void *window, _Out_ ${rectType} *rect)`,
  );
  const arranged = (() => {
    try {
      return user32.func('bool IsWindowArranged(void *window)');
    } catch {
      return undefined;
    }
  })();
  const rectOf = (
    read: typeof windowRect,
    handle: unknown,
  ): Edges | undefined => {
    const rect = { left: 0, top: 0, right: 0, bottom: 0 };
    return read(handle, rect) === true ? rect : undefined;
  };
  const sizesOf = (handle: unknown) => {
    const outer = rectOf(windowRect, handle);
    const client = rectOf(clientRect, handle);
    return outer === undefined || client === undefined
      ? undefined
      : {
          outer: {
            width: outer.right - outer.left,
            height: outer.bottom - outer.top,
          },
          client: {
            width: client.right - client.left,
            height: client.bottom - client.top,
          },
        };
  };
  const grids = new WeakMap<BrowserWindow, CellGrid>();
  const reports = new WeakMap<BrowserWindow, CellReport>();
  const hooked = new WeakSet<BrowserWindow>();
  const dragged = new WeakSet<BrowserWindow>();
  const hook = (window: BrowserWindow) => {
    hooked.add(window);
    window.hookWindowMessage(enterSizeMove, () => {
      dragged.add(window);
    });
    window.hookWindowMessage(exitSizeMove, () => {
      dragged.delete(window);
      apply(window, reports.get(window));
    });
    window.hookWindowMessage(sizing, (wParam, lParam) => {
      const grid = grids.get(window);
      const edge = draggedEdges[wParam.readUInt32LE(0)];
      const sizes = sizesOf(handleOf(window));
      if (grid === undefined || edge === undefined || sizes === undefined) {
        return;
      }
      const pointer: unknown = koffi.decode(lParam, 'void *');
      const frame = frameOf(sizes);
      koffi.encode(
        pointer,
        rectType,
        draggedTo(
          edgesOf(koffi.decode(pointer, rectType)),
          edge,
          frame,
          grid,
          leastClient(window, scaleOf(window), frame),
        ),
      );
    });
  };
  const fit = (window: BrowserWindow, grid: CellGrid) => {
    const handle = handleOf(window);
    const sizes = sizesOf(handle);
    if (
      sizes === undefined ||
      !resting(window) ||
      arranged?.(handle) === true
    ) {
      return;
    }
    const fitted = fittedSize(
      sizes.client,
      grid,
      leastClient(window, scaleOf(window), frameOf(sizes)),
      1,
      towardOf(window),
    );
    if (
      fitted.width !== sizes.client.width ||
      fitted.height !== sizes.client.height
    ) {
      windowPixels().sizeClientTo(window, fitted);
    }
  };
  const apply = (window: BrowserWindow, report: CellReport | undefined) => {
    const sizes = sizesOf(handleOf(window));
    const grid =
      report === undefined || sizes === undefined
        ? undefined
        : gridAround(report, sizes.client, scaleOf(window));
    if (grid === undefined) {
      grids.delete(window);
      return;
    }
    grids.set(window, grid);
    if (!hooked.has(window)) {
      hook(window);
    }
    fit(window, grid);
  };
  return {
    follow: (window, report) => {
      if (report === undefined) {
        reports.delete(window);
      } else {
        reports.set(window, report);
      }
      if (!dragged.has(window)) {
        apply(window, report);
      }
    },
  };
}
