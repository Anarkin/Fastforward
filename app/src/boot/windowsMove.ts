import koffi from 'koffi';
import { type BrowserWindow, screen } from 'electron';

const keepSize = 0x0001;
const keepOrder = 0x0004;
const keepActivation = 0x0010;

export type MoveContent = (window: BrowserWindow, x: number, y: number) => void;

export function windowsMove(): MoveContent {
  const user32 = koffi.load('user32.dll');
  koffi.struct('WindowsMoveRect', {
    left: 'int32_t',
    top: 'int32_t',
    right: 'int32_t',
    bottom: 'int32_t',
  });
  koffi.struct('WindowsMovePoint', { x: 'int32_t', y: 'int32_t' });
  const windowRect = user32.func(
    'bool GetWindowRect(void *window, _Out_ WindowsMoveRect *rect)',
  );
  const clientToScreen = user32.func(
    'bool ClientToScreen(void *window, _Inout_ WindowsMovePoint *point)',
  );
  const setWindowPos = user32.func(
    'bool SetWindowPos(void *window, void *after, int x, int y, int width, int height, uint32_t flags)',
  );
  return (window, x, y) => {
    const handle: unknown = koffi.decode(
      window.getNativeWindowHandle(),
      'void *',
    );
    const outer = { left: 0, top: 0, right: 0, bottom: 0 };
    const client = { x: 0, y: 0 };
    if (!windowRect(handle, outer) || !clientToScreen(handle, client)) {
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
  };
}
