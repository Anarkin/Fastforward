interface QuittingApp {
  on(
    event: 'will-quit',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
  quit(): void;
  releaseSingleInstanceLock(): void;
  relaunch(options: { readonly args: string[] }): void;
}

export interface Quitting {
  readonly startedAgainAfter: (args: string[]) => boolean;
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
): Quitting {
  let flushed = false;
  let started = false;
  let relaunching = false;
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
  return {
    startedAgainAfter: (args) => {
      if (!started) {
        return false;
      }
      if (!relaunching) {
        relaunching = true;
        app.relaunch({ args });
      }
      return true;
    },
  };
}
