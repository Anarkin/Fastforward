import * as fs from 'node:fs';
import * as path from 'node:path';
import { realTimer, type Timer } from '../tools/git/main/autoFetch';
import type { Log } from '../shell/main/log';
import type { ToWebview, UpdateStatus } from '../shell/shared/protocol';
import { strings } from '../shared/strings';

export type UpdateMode = 'install' | 'notify' | 'off';

const updateCheckHours = 4;

const releases = 'https://github.com/Anarkin/Fastforward/releases';

export interface UpdateCheck {
  readonly isUpdateAvailable: boolean;
  readonly updateInfo: { readonly version: string };
  readonly downloadPromise?: Promise<unknown> | null;
}

export interface Updater {
  autoDownload: boolean;
  checkForUpdates(): Promise<UpdateCheck | null>;
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
  on(
    event: 'download-progress',
    listener: (progress: { percent: number }) => void,
  ): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export function updateMode(
  development: boolean,
  platform: NodeJS.Platform,
  executable: string,
  exists: (file: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env,
  writable: (folder: string) => boolean = canWrite,
): UpdateMode {
  if (development) {
    return 'off';
  }
  if (platform === 'darwin') {
    return 'notify';
  }
  if (platform !== 'win32' && runsAsAppImage(executable, env)) {
    return writable(path.posix.dirname(env.APPIMAGE ?? ''))
      ? 'install'
      : 'notify';
  }
  const installed =
    platform === 'win32'
      ? installedOnWindows(executable, exists)
      : exists(
          path.posix.join(
            path.posix.dirname(executable),
            'resources',
            'package-type',
          ),
        );
  return installed ? 'install' : 'off';
}

export function installedOnWindows(
  executable: string,
  exists: (file: string) => boolean = fs.existsSync,
): boolean {
  return exists(
    path.win32.join(
      path.win32.dirname(executable),
      'Uninstall Fastforward.exe',
    ),
  );
}

function canWrite(folder: string): boolean {
  try {
    fs.accessSync(folder, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function runsAsAppImage(
  executable: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const { APPIMAGE, APPDIR } = env;
  if (APPIMAGE === undefined || APPDIR === undefined) {
    return false;
  }
  const inside = path.posix.relative(APPDIR, executable);
  return (
    inside !== '' &&
    inside !== '..' &&
    !inside.startsWith('../') &&
    !path.posix.isAbsolute(inside)
  );
}

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split(
    '\n',
  )[0];
}

export class Updates {
  private current: UpdateStatus = { kind: 'idle' };
  private running = false;
  private asked = false;
  private cancel: (() => void) | undefined;
  private installing: Promise<void> | undefined;
  private installStarted = false;

  constructor(
    private readonly mode: UpdateMode,
    private readonly version: string,
    private readonly updater: Updater,
    private readonly post: (message: ToWebview) => void,
    log: Log,
    private readonly open: (url: string) => void,
    private readonly writesEnded: () => Promise<unknown>,
    private readonly timer: Timer = realTimer,
  ) {
    if (mode === 'off') {
      return;
    }
    updater.autoDownload = mode === 'install';
    updater.on('download-progress', ({ percent }) => {
      const whole = Math.floor(percent);
      if (
        this.current.kind === 'downloading' &&
        this.current.percent !== whole
      ) {
        this.set({ ...this.current, percent: whole });
      }
    });
    updater.on('error', (error) => {
      log.error(strings.log.updateFailed);
      log.error(error);
      if (this.installStarted && this.current.kind === 'ready') {
        this.installFailed(this.current.version, error);
      }
    });
  }

  get status(): UpdateStatus {
    return this.current;
  }

  start(): void {
    this.check(false);
  }

  startAfter(load: Promise<unknown>): void {
    const start = () => this.start();
    void load.then(start, start);
  }

  check(asked: boolean): void {
    if (this.mode === 'off') {
      if (asked) {
        this.notice('info', strings.messages.cannotUpdate);
      }
      return;
    }
    this.asked ||= asked;
    if (!this.running && this.current.kind !== 'ready') {
      void this.run();
    }
  }

  install(): void {
    if (this.current.kind === 'ready') {
      this.installing ??= this.writesEnded().then(() => {
        this.installing = undefined;
        this.installStarted = true;
        this.updater.quitAndInstall(true, true);
      });
    } else if (this.current.kind === 'available') {
      this.open(`${releases}/tag/v${this.current.version}`);
    }
  }

  private async run(): Promise<void> {
    this.cancel?.();
    this.running = true;
    const before = this.current;
    this.set({ kind: 'checking' });
    let version: string | undefined;
    try {
      const result = await this.updater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        this.set({ kind: 'upToDate' });
        this.noticeAsked(strings.messages.upToDate(this.version));
        return;
      }
      version = result.updateInfo.version;
      if (this.mode === 'notify') {
        this.set({ kind: 'available', version });
        if (
          this.asked ||
          before.kind !== 'available' ||
          before.version !== version
        ) {
          this.notice('info', strings.messages.updateAvailable(version));
        }
        return;
      }
      this.set({ kind: 'downloading', version, percent: 0 });
      this.noticeAsked(strings.messages.downloadingUpdate(version));
      await result.downloadPromise;
      this.set({ kind: 'ready', version });
      this.notice('info', strings.messages.updateReady(version));
    } catch (error) {
      if (this.asked) {
        this.set({ kind: 'failed' });
        this.notice(
          'error',
          version === undefined
            ? strings.messages.couldNotCheckForUpdates(firstLine(error))
            : strings.messages.couldNotDownloadUpdate(
                version,
                firstLine(error),
              ),
        );
      } else {
        this.set(before);
      }
    } finally {
      this.running = false;
      this.asked = false;
      if (this.current.kind !== 'ready') {
        this.scheduleCheck();
      }
    }
  }

  private installFailed(version: string, error: unknown): void {
    this.installStarted = false;
    this.set({ kind: 'failed' });
    this.notice(
      'error',
      strings.messages.couldNotInstallUpdate(version, firstLine(error)),
    );
    this.scheduleCheck();
  }

  private set(status: UpdateStatus): void {
    this.current = status;
    this.post({ type: 'update', status });
  }

  private scheduleCheck(): void {
    this.cancel = this.timer(
      () => this.check(false),
      updateCheckHours * 3_600_000,
    );
  }

  private noticeAsked(message: string): void {
    if (this.asked) {
      this.notice('info', message);
    }
  }

  private notice(level: 'info' | 'error', message: string): void {
    this.post({ type: 'notice', level, message });
  }
}
