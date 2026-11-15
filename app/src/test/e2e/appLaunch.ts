import { spawnSync, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { _electron, type ElectronApplication } from 'playwright-core';

export const appFolder = path.join(__dirname, '..', '..', '..');

export function within<T>(
  promise: Promise<T>,
  what: string,
  timeout = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${what}`)),
        timeout,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function closeOrKill(app: ElectronApplication): Promise<void> {
  const closing = app.close();
  try {
    await within(closing, 'the app to close');
  } catch {
    killWithChildren(app.process());
    closing.catch(() => undefined);
  }
}

function killWithChildren(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    return;
  }
  child.kill('SIGKILL');
}

export const baseSettings = {
  scrolling: { smooth: true },
  text: { wordWrap: false },
  tools: { diff: { diffLayout: 'inline' } },
};

export function savedTabs(
  roots: readonly string[],
  active: string,
): { tabs: unknown[]; activeTab: string } {
  return {
    tabs: roots.map((root, index) => ({
      id: String(index + 1),
      tool: 'git',
      root,
    })),
    activeTab: String(roots.indexOf(active) + 1),
  };
}

export function appArguments(profile: string, ...after: string[]): string[] {
  return [appFolder, `--user-data-dir=${profile}`, ...after];
}

export async function launchApp(
  profile: string,
  {
    before = [],
    after = [],
    env,
  }: {
    readonly before?: readonly string[];
    readonly after?: readonly string[];
    readonly env?: Record<string, string>;
  } = {},
): Promise<ElectronApplication> {
  return _electron.launch({
    args: [...before, ...appArguments(profile, ...after)],
    cwd: appFolder,
    ...(env === undefined ? {} : { env }),
  });
}
