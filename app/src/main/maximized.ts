interface FramedWindow {
  on(event: 'maximize', listener: () => void): unknown;
  on(event: 'unmaximize', listener: () => void): unknown;
  on(event: 'enter-full-screen', listener: () => void): unknown;
  on(event: 'leave-full-screen', listener: () => void): unknown;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  readonly webContents: {
    on(event: 'did-finish-load', listener: () => void): unknown;
  };
}

export function tellMaximized(
  window: FramedWindow,
  tell: (maximized: boolean) => void,
): void {
  const update = () => tell(window.isMaximized() || window.isFullScreen());
  window.webContents.on('did-finish-load', update);
  window.on('maximize', update);
  window.on('unmaximize', update);
  window.on('enter-full-screen', update);
  window.on('leave-full-screen', update);
}
