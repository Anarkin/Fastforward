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
