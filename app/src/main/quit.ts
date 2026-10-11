interface QuittingApp {
  on(
    event: 'will-quit',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
  quit(): void;
  releaseSingleInstanceLock(): void;
}

export async function exitOnFailure(
  app: { exit(code: number): void },
  started: Promise<void>,
  say: (error: unknown) => void,
): Promise<void> {
  try {
    await started;
  } catch (error) {
    try {
      say(error);
    } finally {
      app.exit(1);
    }
  }
}

export function flushBeforeQuit(
  app: QuittingApp,
  saved: () => Promise<unknown>,
  stopped: () => Promise<unknown>,
): void {
  let flushed = false;
  app.on('will-quit', (event) => {
    if (flushed) {
      return;
    }
    event.preventDefault();
    void Promise.all([
      saved().then(() => app.releaseSingleInstanceLock()),
      stopped(),
    ]).finally(() => {
      flushed = true;
      app.quit();
    });
  });
}

export function whileWindowOpen(
  window: {
    isDestroyed(): boolean;
    once(event: 'closed', listener: () => void): unknown;
  },
  watch: (ifOpen: (run: () => void) => void) => () => void,
): void {
  const stop = watch((run) => {
    if (!window.isDestroyed()) {
      run();
    }
  });
  window.once('closed', stop);
}
