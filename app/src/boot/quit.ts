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
  ending: () => void,
  saved: () => Promise<unknown>,
  stopped: () => Promise<unknown>,
  waited: () => Promise<unknown> = () => Promise.resolve(),
): void {
  let flushed = false;
  let started = false;
  app.on('will-quit', (event) => {
    if (flushed) {
      return;
    }
    event.preventDefault();
    if (started) {
      return;
    }
    started = true;
    void waited()
      .catch(() => undefined)
      .then(() => {
        ending();
        return Promise.all([
          saved().then(() => app.releaseSingleInstanceLock()),
          stopped(),
        ]);
      })
      .finally(() => {
        flushed = true;
        app.quit();
      });
  });
}
