interface QuittingApp {
  on(
    event: 'will-quit',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
  quit(): void;
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
