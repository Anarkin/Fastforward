import * as fs from 'node:fs';

interface RebuiltWindow {
  on(event: 'closed', listener: () => void): unknown;
  readonly webContents: { reloadIgnoringCache(): void };
}

type Watch = (
  folder: string,
  listener: (event: string, file: string | null) => void,
) => { close(): void };

export function reloadOnRebuild(
  window: RebuiltWindow,
  folder: string,
  onDefaults: () => void,
  watch: Watch = fs.watch,
): void {
  let page: NodeJS.Timeout | undefined;
  let defaults: NodeJS.Timeout | undefined;
  const watcher = watch(folder, (_event, file) => {
    const change = rebuilt(file);
    if (change === 'page') {
      clearTimeout(page);
      page = setTimeout(() => window.webContents.reloadIgnoringCache(), 100);
    } else if (change === 'defaults') {
      clearTimeout(defaults);
      defaults = setTimeout(onDefaults, 100);
    }
  });
  window.on('closed', () => {
    watcher.close();
    clearTimeout(page);
    clearTimeout(defaults);
  });
}

export function rebuilt(file: string | null): 'page' | 'defaults' | undefined {
  if (
    file?.startsWith('webview.') ||
    file?.startsWith('syntaxWorker.') ||
    file === 'index.html'
  ) {
    return 'page';
  }
  return file === 'settings.json' ? 'defaults' : undefined;
}
