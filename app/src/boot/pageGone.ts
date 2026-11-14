import type { Log } from '../shell/main/log';
import { strings } from '../lib/shared/strings';

interface PageWindow {
  readonly webContents: {
    on(
      event: 'render-process-gone',
      listener: (
        event: unknown,
        details: { readonly reason: string; readonly exitCode: number },
      ) => void,
    ): unknown;
    reload(): void;
  };
}

export function reloadWhenGone(
  window: PageWindow,
  log: Log,
  stayedGone: () => void,
  now: () => number = Date.now,
): void {
  let reloaded = -Infinity;
  window.webContents.on('render-process-gone', (_event, details) => {
    if (now() - reloaded < 60_000) {
      log.error(strings.log.pageGoneAgain(details.reason, details.exitCode));
      stayedGone();
      return;
    }
    log.error(strings.log.pageGone(details.reason, details.exitCode));
    reloaded = now();
    window.webContents.reload();
  });
}
