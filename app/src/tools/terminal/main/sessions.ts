import { SerializeAddon } from '@xterm/addon-serialize';
import { Terminal } from '@xterm/headless';
import { Backlog, flowLimits, type FlowLimits } from './flowControl';
import type { HostCommand, HostEvent, ShellLaunch } from './hostProtocol';
import { scrollback, type WindowsPty } from '../shared/protocol';
import { strings } from '../../../shared/strings';

interface Disposable {
  dispose(): void;
}

export interface Pty {
  onData(listener: (data: string) => void): Disposable;
  onExit(listener: (exit: { readonly exitCode: number }) => void): Disposable;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  pause(): void;
  resume(): void;
  kill(): void;
}

export type SpawnPty = (
  launch: ShellLaunch,
  columns: number,
  rows: number,
) => Pty;

export type Timer = (run: () => void, ms: number) => () => void;

export const realTimer: Timer = (run, ms) => {
  const timeout = setTimeout(run, ms);
  return () => clearTimeout(timeout);
};

function line(text: string): string {
  return `\r\n${text}\r\n`;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class Session {
  private pty: Pty | undefined;
  private listeners: Disposable[] = [];
  private readonly mirror: Terminal;
  private readonly serializer = new SerializeAddon();
  private readonly toMirror: Backlog;
  private readonly toPage: Backlog;
  private pending = '';
  private cancelFlush: (() => void) | undefined;
  private cancelExit: (() => void) | undefined;
  private attachment = 0;
  private attached = false;
  private holding = false;
  private paused = false;
  private exited = false;

  constructor(
    private readonly id: string,
    private columns: number,
    private rows: number,
    private readonly spawn: SpawnPty,
    private readonly post: (event: HostEvent) => void,
    private readonly limits: FlowLimits,
    private readonly timer: Timer,
    windowsPty: WindowsPty | undefined,
  ) {
    this.mirror = new Terminal({
      cols: columns,
      rows,
      scrollback,
      allowProposedApi: true,
      ...(windowsPty && { windowsPty }),
    });
    this.mirror.loadAddon(this.serializer);
    this.toMirror = new Backlog(limits);
    this.toPage = new Backlog(limits);
  }

  get running(): boolean {
    return this.pty !== undefined;
  }

  start(launch: ShellLaunch): void {
    this.cancelExit?.();
    this.cancelExit = undefined;
    this.stopListening();
    this.exited = false;
    this.paused = false;
    let pty: Pty;
    try {
      pty = this.spawn(launch, this.columns, this.rows);
    } catch (error) {
      this.take(
        line(strings.terminal.couldNotStart(launch.file, reasonOf(error))),
      );
      this.end();
      return;
    }
    this.pty = pty;
    this.listeners = [
      pty.onData((data) => this.take(data)),
      pty.onExit(({ exitCode }) => {
        this.pty = undefined;
        this.cancelExit = this.timer(() => {
          this.cancelExit = undefined;
          this.stopListening();
          this.take(line(strings.terminal.exited(exitCode)));
          this.end();
        }, this.limits.exitMilliseconds);
      }),
    ];
  }

  write(data: string): void {
    this.pty?.write(data);
  }

  resize(columns: number, rows: number): void {
    if (columns === this.columns && rows === this.rows) {
      return;
    }
    this.columns = columns;
    this.rows = rows;
    this.pty?.resize(columns, rows);
    this.mirror.resize(columns, rows);
  }

  attach(columns: number, rows: number): void {
    this.flush();
    const attachment = ++this.attachment;
    this.attached = false;
    this.holding = true;
    this.resize(columns, rows);
    this.mirror.write('', () => {
      if (attachment !== this.attachment) {
        return;
      }
      this.post({
        type: 'screen',
        id: this.id,
        data: this.serializer.serialize(),
        exited: this.exited,
      });
      this.attached = true;
      this.holding = false;
      this.toPage.reset();
      this.flush();
      this.balance();
    });
  }

  detach(): void {
    this.attachment++;
    this.attached = false;
    this.holding = false;
    this.toPage.reset();
    this.flush();
    this.balance();
  }

  acked(chars: number): void {
    this.toPage.taken(chars);
    this.balance();
  }

  kill(): void {
    this.attachment++;
    this.stopListening();
    this.cancelFlush?.();
    this.cancelExit?.();
    this.pty?.kill();
    this.pty = undefined;
    this.mirror.dispose();
  }

  private take(data: string): void {
    this.pending += data;
    if (this.pending.length >= this.limits.batchChars) {
      this.flush();
    } else {
      this.cancelFlush ??= this.timer(() => {
        this.cancelFlush = undefined;
        this.flush();
      }, this.limits.batchMilliseconds);
    }
  }

  private flush(): void {
    this.cancelFlush?.();
    this.cancelFlush = undefined;
    if (this.holding || this.pending === '') {
      return;
    }
    const data = this.pending;
    this.pending = '';
    this.toMirror.sent(data.length);
    this.mirror.write(data, () => {
      this.toMirror.taken(data.length);
      this.balance();
    });
    if (this.attached) {
      this.toPage.sent(data.length);
      this.post({ type: 'output', id: this.id, data });
    }
    this.balance();
  }

  private end(): void {
    this.flush();
    this.exited = true;
    this.paused = false;
    this.post({ type: 'exited', id: this.id });
  }

  private balance(): void {
    if (this.pty === undefined) {
      return;
    }
    if (!this.paused && (this.toMirror.full || this.toPage.full)) {
      this.paused = true;
      this.pty.pause();
    } else if (this.paused && this.toMirror.drained && this.toPage.drained) {
      this.paused = false;
      this.pty.resume();
    }
  }

  private stopListening(): void {
    for (const listener of this.listeners) {
      listener.dispose();
    }
    this.listeners = [];
  }
}

export class PtyHost {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly spawn: SpawnPty,
    private readonly post: (event: HostEvent) => void,
    private readonly limits: FlowLimits = flowLimits,
    private readonly timer: Timer = realTimer,
    private readonly windowsPty?: WindowsPty,
  ) {}

  receive(command: HostCommand): void {
    switch (command.type) {
      case 'spawn': {
        let session = this.sessions.get(command.id);
        if (session === undefined) {
          session = new Session(
            command.id,
            command.columns,
            command.rows,
            this.spawn,
            this.post,
            this.limits,
            this.timer,
            this.windowsPty,
          );
          this.sessions.set(command.id, session);
        }
        if (!session.running) {
          session.start(command.launch);
        }
        return;
      }
      case 'attach':
        this.sessions.get(command.id)?.attach(command.columns, command.rows);
        return;
      case 'detach':
        this.sessions.get(command.id)?.detach();
        return;
      case 'input':
        this.sessions.get(command.id)?.write(command.data);
        return;
      case 'resize':
        this.sessions.get(command.id)?.resize(command.columns, command.rows);
        return;
      case 'ack':
        this.sessions.get(command.id)?.acked(command.chars);
        return;
      case 'kill':
        this.sessions.get(command.id)?.kill();
        this.sessions.delete(command.id);
        return;
      default:
        return command satisfies never;
    }
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
  }
}
