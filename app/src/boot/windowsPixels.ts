import koffi from 'koffi';
import { type BrowserWindow, screen } from 'electron';
import { copiesPixels, pixelsToSize, type WindowPixels } from './windowPixels';
import { structOnce } from '../lib/main/koffiTypes';

const keepSize = 0x0001;
const keepPlace = 0x0002;
const keepOrder = 0x0004;
const keepActivation = 0x0010;

const sizingTries = 4;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function handleOf(window: BrowserWindow): unknown {
  return koffi.decode(window.getNativeWindowHandle(), 'void *');
}

export function windowsPixels(byElectron: WindowPixels): WindowPixels {
  const user32 = koffi.load('user32.dll');
  structOnce('WindowsPixelsRect', {
    left: 'int32_t',
    top: 'int32_t',
    right: 'int32_t',
    bottom: 'int32_t',
  });
  structOnce('WindowsPixelsPoint', { x: 'int32_t', y: 'int32_t' });
  const windowRect = user32.func(
    'bool GetWindowRect(void *window, _Out_ WindowsPixelsRect *rect)',
  );
  const clientToScreen = user32.func(
    'bool ClientToScreen(void *window, _Inout_ WindowsPixelsPoint *point)',
  );
  const setWindowPos = user32.func(
    'bool SetWindowPos(void *window, void *after, int x, int y, int width, int height, uint32_t flags)',
  );
  const rectOf = (handle: unknown): Rect | undefined => {
    const rect = { left: 0, top: 0, right: 0, bottom: 0 };
    return windowRect(handle, rect) ? rect : undefined;
  };
  return {
    moveContent: (window, x, y) => {
      if (window.isMaximized() || window.isFullScreen()) {
        return;
      }
      const handle = handleOf(window);
      const outer = rectOf(handle);
      const client = { x: 0, y: 0 };
      if (outer === undefined || !clientToScreen(handle, client)) {
        return;
      }
      const at = screen.dipToScreenPoint({ x, y });
      setWindowPos(
        handle,
        null,
        at.x - (client.x - outer.left),
        at.y - (client.y - outer.top),
        0,
        0,
        keepSize | keepOrder | keepActivation,
      );
    },
    sizeLike: (window, source) => {
      const from = rectOf(handleOf(source));
      const current = source.getBounds();
      if (
        from === undefined ||
        !copiesPixels({
          maximized: source.isMaximized(),
          fullScreen: source.isFullScreen(),
          current,
          normal: source.getNormalBounds(),
          sourceScale: screen.getDisplayMatching(current).scaleFactor,
          windowScale: screen.getDisplayMatching(window.getBounds())
            .scaleFactor,
        })
      ) {
        byElectron.sizeLike(window, source);
        return;
      }
      setWindowPos(
        handleOf(window),
        null,
        0,
        0,
        from.right - from.left,
        from.bottom - from.top,
        keepPlace | keepOrder | keepActivation,
      );
    },
    sizeTo: (window, size) => {
      if (window.isMaximized() || window.isFullScreen()) {
        return;
      }
      const handle = handleOf(window);
      for (let tried = 0; tried < sizingTries; tried++) {
        const seen = window.getBounds();
        const outer = rectOf(handle);
        if (
          outer === undefined ||
          (seen.width === size.width && seen.height === size.height)
        ) {
          return;
        }
        const pixels = pixelsToSize(
          { width: outer.right - outer.left, height: outer.bottom - outer.top },
          seen,
          size,
          tried === 0 ? screen.getDisplayMatching(seen).scaleFactor : 1,
        );
        setWindowPos(
          handle,
          null,
          0,
          0,
          pixels.width,
          pixels.height,
          keepPlace | keepOrder | keepActivation,
        );
      }
    },
  };
}
