import { messageOf } from '../../../lib/shared/errors';
import * as os from 'node:os';
import { Backlog, flowLimits, type FlowLimits } from './flowControl';
import { reportFolders, type FolderPlace } from './folders';
import type { HostCommand, HostEvent, ShellLaunch } from './hostProtocol';
import { createMirror, type Mirror } from './mirror';
import type { CellRange, WindowsPty } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import { realTimer, type Timer } from '../../../lib/main/timer';

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

function line(text: string): string {
  return `\r\n${text}\r\n`;
}

function cleanScreen(rows: number): string {
  return `\x1b[${rows};1H${'\r\n'.repeat(rows)}\x1b[H`;
}

function attempt(act: () => void): void {
  try {
    act();
  } catch {
    return;
  }
}

class Session {
  private pty: Pty | undefined;
  private exitedPty: Pty | undefined;
  private listeners: Disposable[] = [];
  private readonly mirror: Mirror;
  private readonly toMirror: Backlog;
  private readonly toPage: Backlog;
  private pending = '';
  private undrawn: string[] = [];
  private drawnChars = 0;
  private readonly pageMissed: boolean[] = [];
  private cancelFlush: (() => void) | undefined;
  private cancelExit: (() => void) | undefined;
  private attachment = 0;
  private attached = false;
  private holding = false;
  private paused = false;
  private exited = false;
  private started = false;
  private killed = false;
  private readonly startedIn: (cwd: string) => void;
  constructor(
    private readonly id: string,
    private columns: number,
    private rows: number,
    private readonly spawn: SpawnPty,
    private readonly post: (event: HostEvent) => void,
    private readonly limits: FlowLimits,
    private readonly timer: Timer,
    scrollback: number,
    private readonly windowsPty: WindowsPty | undefined,
    place: FolderPlace,
  ) {
    this.mirror = createMirror({ columns, rows, scrollback, windowsPty });
    this.toMirror = new Backlog(limits);
    this.toPage = new Backlog(limits);
    this.mirror.terminal.onData((reply) => {
      if (this.pageMissed[0]) {
        this.pty?.write(reply);
      }
    });
    this.startedIn = reportFolders(
      this.mirror.terminal.parser,
      place,
      (folder) => this.post({ type: 'folder', id: this.id, folder }),
    );
  }

  get running(): boolean {
    return this.pty !== undefined;
  }

  start(launch: ShellLaunch): void {
    this.cancelExit?.();
    this.cancelExit = undefined;
    this.freeExited();
    this.stopListening();
    this.exited = false;
    this.paused = false;
    this.startedIn(launch.cwd);
    if (this.started) {
      this.take(cleanScreen(this.rows));
    }
    this.started = true;
    let pty: Pty;
    try {
      pty = this.spawn(launch, this.columns, this.rows);
    } catch (error) {
      this.take(
        line(strings.terminal.couldNotStart(launch.file, messageOf(error))),
      );
      this.end();
      return;
    }
    this.pty = pty;
    this.listeners = [
      pty.onData((data) => this.take(data)),
      pty.onExit(({ exitCode }) => {
        this.pty = undefined;
        this.exitedPty = pty;
        this.cancelExit = this.timer(() => {
          this.cancelExit = undefined;
          this.stopListening();
          this.take(line(strings.terminal.exited(exitCode)));
          this.end();
          this.freeExited();
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
    attempt(() => this.pty?.resize(columns, rows));
    this.mirror.terminal.resize(columns, rows);
  }

  attach(columns: number, rows: number, scrollback: number): void {
    this.attached = false;
    this.copyUndrawn();
    this.flush();
    const attachment = ++this.attachment;
    this.holding = true;
    this.resize(columns, rows);
    this.mirror.scrollback(scrollback);
    this.mirror.terminal.write('', () => {
      if (attachment !== this.attachment) {
        return;
      }
      const { top, selection } = this.mirror.place.place();
      this.post({
        type: 'screen',
        id: this.id,
        data: this.mirror.serialize(),
        exited: this.exited,
        ...(top !== undefined && { top }),
        ...(selection !== undefined && { selection }),
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
    this.copyUndrawn();
    this.toPage.reset();
    this.flush();
    this.balance();
  }

  acked(chars: number): void {
    this.toPage.taken(chars);
    this.drawnChars += chars;
    for (
      let [drawn] = this.undrawn;
      drawn !== undefined && drawn.length <= this.drawnChars;
      [drawn] = this.undrawn
    ) {
      this.undrawn.shift();
      this.drawnChars -= drawn.length;
      this.copy(drawn, false);
    }
    this.balance();
  }

  scrolled(top: number | undefined): void {
    this.afterOutput(() => this.mirror.place.scrolled(top));
  }

  selected(selection: CellRange | undefined): void {
    this.afterOutput(() => this.mirror.place.selected(selection));
  }

  private afterOutput(act: () => void): void {
    this.mirror.terminal.write('', () => {
      if (!this.killed) {
        act();
      }
    });
  }

  kill(): void {
    this.killed = true;
    this.attachment++;
    this.stopListening();
    this.cancelFlush?.();
    this.cancelExit?.();
    this.freeExited();
    this.pty?.kill();
    this.pty = undefined;
    this.mirror.dispose();
  }

  private freeExited(): void {
    const exited = this.exitedPty;
    this.exitedPty = undefined;
    if (exited !== undefined && this.windowsPty !== undefined) {
      attempt(() => exited.kill());
    }
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
    if (this.attached) {
      this.undrawn.push(data);
      this.toPage.sent(data.length);
      this.post({ type: 'output', id: this.id, data });
    } else {
      this.copy(data, true);
    }
    this.balance();
  }

  private copyUndrawn(): void {
    const undrawn = this.undrawn;
    this.undrawn = [];
    this.drawnChars = 0;
    for (const data of undrawn) {
      this.copy(data, false);
    }
  }

  private copy(data: string, missed: boolean): void {
    this.toMirror.sent(data.length);
    this.pageMissed.push(missed);
    this.mirror.terminal.write(data, () => {
      this.pageMissed.shift();
      this.toMirror.taken(data.length);
      this.balance();
    });
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
    private readonly place: FolderPlace = {
      platform: process.platform,
      hostname: os.hostname(),
    },
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
            command.scrollback,
            this.windowsPty,
            this.place,
          );
          this.sessions.set(command.id, session);
        }
        if (!session.running) {
          session.start(command.launch);
        }
        return;
      }
      case 'attach':
        this.sessions
          .get(command.id)
          ?.attach(command.columns, command.rows, command.scrollback);
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
      case 'scrolled':
        this.sessions.get(command.id)?.scrolled(command.top);
        return;
      case 'selected':
        this.sessions.get(command.id)?.selected(command.selection);
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
