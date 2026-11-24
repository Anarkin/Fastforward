import { noOpeningSwitch } from '../../shell/shared/opening';
import { spawnSync, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { _electron, type ElectronApplication } from 'playwright-core';
import { strings } from '../../lib/shared/strings';
import { rememberProfile } from './appLogs';

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

async function answeredToQuit(app: ElectronApplication): Promise<boolean> {
  for (const page of app.windows()) {
    const asked = page.locator('.confirm-popup', {
      has: page.locator('.shortcuts-title', {
        hasText: strings.confirm.quitTitle,
      }),
    });
    if ((await asked.count()) === 0) {
      continue;
    }
    const withoutSaving = asked.locator('.confirm-button', {
      hasText: strings.confirm.dontSave,
    });
    const answer =
      (await withoutSaving.count()) > 0
        ? withoutSaving
        : asked.locator('.confirm-button.default');
    if (
      await answer.click({ timeout: 500 }).then(
        () => true,
        () => false,
      )
    ) {
      return true;
    }
  }
  return false;
}

async function answeringToQuit(
  app: ElectronApplication,
  ended: AbortSignal,
): Promise<void> {
  while (!ended.aborted) {
    await answeredToQuit(app).catch(() => false);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const closedByTests = new WeakSet<ElectronApplication>();

export async function closeOrKill(app: ElectronApplication): Promise<void> {
  closedByTests.add(app);
  const closing = app.close();
  const ended = new AbortController();
  const answering = answeringToQuit(app, ended.signal);
  try {
    await within(closing, 'the app to close');
  } catch {
    killWithChildren(app.process());
    closing.catch(() => undefined);
  } finally {
    ended.abort();
  }
  await answering;
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

export function schemeAsked(): { colorScheme: 'light' | 'dark' } {
  return {
    colorScheme: process.env.FASTFORWARD_TEST_LIGHT === '1' ? 'light' : 'dark',
  };
}

function scaleAsked(scale: number | undefined): string[] {
  const asked =
    scale === undefined ? process.env.FASTFORWARD_TEST_SCALE : String(scale);
  return asked === undefined || asked === ''
    ? []
    : [`--force-device-scale-factor=${asked}`];
}

const gpuWithoutOne = [
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  ...(process.platform === 'linux' ? ['--use-webgpu-adapter=swiftshader'] : []),
  ...(process.platform === 'win32' ? ['--disable-gpu-rasterization'] : []),
];

export function appArguments(profile: string, ...after: string[]): string[] {
  return [appFolder, `--user-data-dir=${profile}`, ...after];
}

export async function launchApp(
  profile: string,
  {
    before = [],
    after = [],
    env,
    scale,
    colorScheme = schemeAsked().colorScheme,
    opening = false,
  }: {
    readonly scale?: number;
    readonly before?: readonly string[];
    readonly after?: readonly string[];
    readonly env?: Record<string, string>;
    readonly colorScheme?: 'light' | 'dark';
    readonly opening?: boolean;
  } = {},
): Promise<ElectronApplication> {
  rememberProfile(profile);
  const app = await _electron.launch({
    args: [
      ...gpuWithoutOne,
      ...scaleAsked(scale),
      ...(opening ? [] : [`--${noOpeningSwitch}`]),
      ...before,
      ...appArguments(profile, ...after),
    ],
    cwd: appFolder,
    colorScheme,
    ...(env === undefined ? {} : { env }),
  });
  app.process().once('exit', (code, signal) => {
    if (!closedByTests.has(app)) {
      process.stderr.write(
        `The app ended before its test closed it, with exit code ${String(code)} and signal ${String(signal)}
`,
      );
    }
  });
  const display = Number(process.env.FASTFORWARD_TEST_DISPLAY ?? '');
  if (Number.isInteger(display) && display > 0) {
    void app
      .evaluate(({ app: started, BrowserWindow, screen }, number) => {
        const target = screen.getAllDisplays()[number - 1];
        if (target === undefined) {
          return;
        }
        const moved = (window: Electron.BrowserWindow) => {
          const bounds = window.getBounds();
          const from = screen.getDisplayMatching(bounds).workArea;
          if (from.x === target.workArea.x && from.y === target.workArea.y) {
            return;
          }
          window.setPosition(
            target.workArea.x + Math.max(0, bounds.x - from.x),
            target.workArea.y + Math.max(0, bounds.y - from.y),
          );
        };
        for (const window of BrowserWindow.getAllWindows()) {
          moved(window);
        }
        started.on('browser-window-created', (_event, window) => {
          moved(window);
        });
      }, display)
      .catch(() => undefined);
  }
  if (process.platform !== 'linux') {
    void app
      .evaluate(({ app: started, BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.setIgnoreMouseEvents(true);
        }
        started.on('browser-window-created', (_event, window) => {
          window.setIgnoreMouseEvents(true);
        });
      })
      .catch(() => undefined);
  }
  return app;
}
