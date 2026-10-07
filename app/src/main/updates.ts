import * as fs from 'node:fs';
import * as path from 'node:path';
import { realTimer, type Timer } from '../autoFetch';
import type { Log } from '../log';
import type { ToWebview, UpdateStatus } from '../shared/protocol';
import { strings } from '../shared/strings';

export type UpdateMode = 'install' | 'notify' | 'off';

export const updateCheckHours = 4;

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
): UpdateMode {
  if (development) {
    return 'off';
  }
  if (platform === 'darwin') {
    return 'notify';
  }
  return platform !== 'win32' ||
    exists(
      path.win32.join(
        path.win32.dirname(executable),
        'Uninstall Fastforward.exe',
      ),
    )
    ? 'install'
    : 'off';
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

  constructor(
    private readonly mode: UpdateMode,
    private readonly version: string,
    private readonly updater: Updater,
    private readonly post: (message: ToWebview) => void,
    log: Log,
    private readonly open: (url: string) => void,
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
    });
  }

  get status(): UpdateStatus {
    return this.current;
  }

  start(): void {
    this.check(false);
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
      this.updater.quitAndInstall(true, true);
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
        this.cancel = this.timer(
          () => this.check(false),
          updateCheckHours * 3_600_000,
        );
      }
    }
  }

  private set(status: UpdateStatus): void {
    this.current = status;
    this.post({ type: 'update', status });
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
