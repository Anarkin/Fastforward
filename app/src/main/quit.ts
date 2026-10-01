interface QuittingApp {
  on(
    event: 'will-quit',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
  quit(): void;
}

// Quitting with Cmd+Q or app.quit() closes the windows without the
// window-all-closed event, so their last state would not finish saving
export function flushBeforeQuit(
  app: QuittingApp,
  saved: () => Promise<unknown>,
): void {
  let flushed = false;
  app.on('will-quit', (event) => {
    if (flushed) {
      return;
    }
    event.preventDefault();
    void saved().finally(() => {
      flushed = true;
      app.quit();
    });
  });
}
