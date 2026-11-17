import { type BrowserWindow, screen } from 'electron';

export function shellMenuIn(windows: {
  focusedWindow(): BrowserWindow | undefined;
}): (
  files: readonly string[],
  at: { readonly x: number; readonly y: number },
  extended: boolean,
) => Promise<void> {
  return async (files, at, extended) => {
    const { showShellMenu } =
      await import('../tools/commander/main/windowsShellMenu.js');
    const window = windows.focusedWindow();
    if (window === undefined || window.isDestroyed()) {
      return;
    }
    const content = window.getContentBounds();
    const zoom = window.webContents.getZoomFactor();
    showShellMenu(
      window.getNativeWindowHandle(),
      files,
      screen.dipToScreenPoint({
        x: content.x + at.x * zoom,
        y: content.y + at.y * zoom,
      }),
      extended,
    );
  };
}
