import type { HostCommand, HostEvent } from './hostProtocol';
import type { Log } from '../../../shell/main/log';
import { strings } from '../../../lib/shared/strings';

export interface HostConnection {
  send(command: HostCommand): void;
  dispose(): void;
}

export interface HostListener {
  event(event: HostEvent): void;
  stopped(code: number): void;
}

export type ConnectHost = (listener: HostListener) => HostConnection;

export class HostLink {
  private host: HostConnection | undefined;
  private quitting = false;
  readonly queued = new Map<string, Promise<void>>();

  constructor(
    private readonly connect: ConnectHost,
    private readonly log: Log,
    private readonly listener: HostListener,
  ) {}

  quit(): void {
    this.quitting = true;
    this.host?.dispose();
    this.host = undefined;
  }

  send(command: HostCommand, starting = true): void {
    if (this.queued.has(command.id)) {
      this.sendWhen(command.id, Promise.resolve(), () => command);
    } else if (starting) {
      this.connected().send(command);
    } else {
      this.host?.send(command);
    }
  }

  sendWhen<T>(
    tab: string,
    ready: Promise<T>,
    command: (value: T) => HostCommand | undefined,
  ): void {
    const queued = Promise.all([this.queued.get(tab), ready])
      .then(([, value]) => {
        const sent = command(value);
        if (sent !== undefined && !this.quitting) {
          this.connected().send(sent);
        }
      })
      .catch((error: unknown) => {
        this.log.error(error);
      });
    this.queued.set(tab, queued);
    void queued.then(() => {
      if (this.queued.get(tab) === queued) {
        this.queued.delete(tab);
      }
    });
  }

  private connected(): HostConnection {
    this.host ??= this.connect({
      event: (event) => this.listener.event(event),
      stopped: (code) => this.stopped(code),
    });
    return this.host;
  }

  private stopped(code: number): void {
    if (this.quitting) {
      return;
    }
    this.log.error(strings.log.terminalHostStopped(code));
    this.host = undefined;
    this.listener.stopped(code);
  }
}
