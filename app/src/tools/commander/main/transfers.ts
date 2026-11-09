import * as path from 'node:path';
import type { Notice } from '../../../shell/main/shell';
import { strings } from '../../../shared/strings';
import {
  isClashAnswer,
  type ArchiveJob,
  type Clash,
  type TransferProgress,
  type TransferView,
} from '../shared/transfers';
import type { TransferPlan } from './transfer';
import type { TransferCommand, TransferEvent } from './transferProtocol';

export interface TransferListener {
  readonly event: (event: TransferEvent) => void;
  readonly stopped: (code: number) => void;
}

interface TransferConnection {
  readonly send: (command: TransferCommand) => void;
  readonly dispose: () => void;
}

export type ConnectTransfer = (
  listener: TransferListener,
) => TransferConnection;

export interface TransferAsk {
  readonly plan: TransferPlan;
  readonly folder: string;
  readonly names: readonly string[];
  readonly archive?: {
    readonly job: ArchiveJob;
    readonly file: string;
    readonly at?: string;
    readonly select?: string;
  };
}

export interface TransfersHost {
  readonly show: (view: TransferView | undefined) => void;
  readonly notice: (notice: Notice) => void;
  readonly finished: (ask: TransferAsk) => void;
}

interface Running {
  readonly id: number;
  readonly ask: TransferAsk;
  readonly failures: { readonly name: string; readonly reason: string }[];
  readonly warnings: string[];
  connection: TransferConnection | undefined;
  hidden: boolean;
  stopping: boolean;
  progress: TransferProgress | undefined;
  clash: (Clash & { readonly asked: number }) | undefined;
}

function whatOf({ names }: TransferAsk): string {
  return names.length === 1
    ? strings.commander.oneItem(path.basename(names[0]))
    : strings.commander.items(names.length);
}

const archiveSentences: Readonly<
  Record<
    ArchiveJob,
    {
      readonly failed: (name: string, reason: string) => string;
      readonly done: (what: string, archive: string) => string;
      readonly stopped: (archive: string) => string;
      readonly warned?: (name: string, reason: string) => string;
      readonly failedMany?: (
        count: number,
        name: string,
        reason: string,
      ) => string;
      readonly toldDone?: true;
    }
  >
> = {
  pack: {
    failed: strings.commander.packFailed,
    done: strings.commander.packed,
    stopped: strings.commander.packingStopped,
  },
  delete: {
    failed: strings.commander.deleteFromFailed,
    done: strings.commander.deletedFrom,
    stopped: strings.commander.deletingStopped,
  },
  rename: {
    failed: strings.commander.renameInFailed,
    done: strings.commander.renamedIn,
    stopped: strings.commander.renamingStopped,
  },
  folder: {
    failed: strings.commander.folderInFailed,
    done: strings.commander.madeFolderIn,
    stopped: strings.commander.makingFolderStopped,
  },
  copyIn: {
    failed: strings.commander.copyInFailed,
    done: strings.commander.copied,
    stopped: strings.commander.copyingStopped,
  },
  moveIn: {
    failed: strings.commander.moveInFailed,
    done: strings.commander.moved,
    stopped: strings.commander.movingStopped,
    warned: strings.commander.movedWithout,
  },
  test: {
    failed: strings.commander.testFailed,
    failedMany: strings.commander.testFailedMany,
    done: strings.commander.testPassed,
    stopped: strings.commander.testingStopped,
    toldDone: true,
  },
  update: {
    failed: strings.commander.putBackFailed,
    done: strings.commander.putBack,
    stopped: strings.commander.puttingBackStopped,
    warned: strings.commander.putBackWithout,
    toldDone: true,
  },
};

function failureNotice({ ask, failures }: Running): string | undefined {
  const [first] = failures;
  if (first === undefined) {
    return undefined;
  }
  if (ask.archive !== undefined) {
    const sentences = archiveSentences[ask.archive.job];
    return failures.length > 1 && sentences.failedMany !== undefined
      ? sentences.failedMany(failures.length, first.name, first.reason)
      : sentences.failed(first.name, first.reason);
  }
  const { move } = ask.plan;
  if (failures.length === 1) {
    return move
      ? strings.commander.moveFailed(first.name, first.reason)
      : strings.commander.copyFailed(first.name, first.reason);
  }
  return move
    ? strings.commander.moveFailedMany(
        failures.length,
        first.name,
        first.reason,
      )
    : strings.commander.copyFailedMany(
        failures.length,
        first.name,
        first.reason,
      );
}

export class Transfers {
  private readonly running: Running[] = [];
  private ids = 0;
  private asks = 0;

  constructor(
    private readonly connect: ConnectTransfer,
    private readonly host: TransfersHost,
  ) {}

  start(ask: TransferAsk, connect: ConnectTransfer = this.connect): void {
    const running: Running = {
      id: ++this.ids,
      ask,
      failures: [],
      warnings: [],
      connection: undefined,
      hidden: false,
      stopping: false,
      progress: undefined,
      clash: undefined,
    };
    this.running.push(running);
    running.connection = connect({
      event: (event) => this.event(running, event),
      stopped: () => this.end(running, 'broke'),
    });
    running.connection.send({ type: 'start', plan: ask.plan });
    this.show();
  }

  answer(id: unknown, asked: unknown, answer: unknown, all: unknown): void {
    const running = this.find(id);
    if (
      running?.clash === undefined ||
      running.clash.asked !== asked ||
      !isClashAnswer(answer) ||
      typeof all !== 'boolean'
    ) {
      return;
    }
    running.clash = undefined;
    running.connection?.send({ type: 'answer', reply: { answer, all } });
    this.show();
  }

  stop(id: unknown): void {
    const running = this.find(id);
    if (running === undefined || running.stopping) {
      return;
    }
    running.stopping = true;
    running.clash = undefined;
    running.connection?.send({ type: 'stop' });
    this.show();
  }

  hide(id: unknown): void {
    const running = this.find(id);
    if (running === undefined) {
      return;
    }
    if (running.clash !== undefined) {
      this.stop(id);
      return;
    }
    running.hidden = true;
    this.show();
  }

  resend(): void {
    this.show();
  }

  quit(): void {
    for (const running of this.running.splice(0)) {
      running.connection?.dispose();
      running.connection = undefined;
    }
  }

  private find(id: unknown): Running | undefined {
    return this.running.find((running) => running.id === id);
  }

  private event(running: Running, event: TransferEvent): void {
    if (!this.running.includes(running)) {
      return;
    }
    switch (event.type) {
      case 'progress':
        running.progress = event.progress;
        if (this.shownOne() === running) {
          this.show();
        }
        return;
      case 'clash':
        running.clash = { ...event.clash, asked: ++this.asks };
        running.hidden = false;
        this.show();
        return;
      case 'failed':
        running.failures.push({ name: event.name, reason: event.reason });
        return;
      case 'warned':
        running.warnings.push(event.reason);
        return;
      case 'done':
        this.end(
          running,
          event.error !== undefined
            ? 'broke'
            : event.stopped
              ? 'stopped'
              : 'done',
        );
        return;
    }
  }

  private end(running: Running, how: 'done' | 'stopped' | 'broke'): void {
    const index = this.running.indexOf(running);
    if (index === -1) {
      return;
    }
    this.running.splice(index, 1);
    running.connection?.dispose();
    running.connection = undefined;
    const { move, target } = running.ask.plan;
    const failed = failureNotice(running);
    if (failed !== undefined) {
      this.host.notice({ level: 'error', message: failed });
    }
    const { archive } = running.ask;
    if (archive !== undefined) {
      this.archiveEnded(running, how, archive);
      return;
    }
    if (running.warnings.length > 0) {
      this.host.notice({
        level: 'error',
        message: running.warnings.join(' '),
      });
    }
    if (how === 'broke') {
      this.host.notice({
        level: 'error',
        message: move
          ? strings.commander.movingStopped(target)
          : strings.commander.copyingStopped(target),
      });
    } else if (how === 'done' && running.hidden) {
      const what = whatOf(running.ask);
      this.host.notice({
        level: 'info',
        message: move
          ? strings.commander.moved(what, target)
          : strings.commander.copied(what, target),
      });
    }
    this.host.finished(running.ask);
    this.show();
  }

  private archiveEnded(
    running: Running,
    how: 'done' | 'stopped' | 'broke',
    {
      job,
      file,
      at = file,
    }: {
      readonly job: ArchiveJob;
      readonly file: string;
      readonly at?: string;
    },
  ): void {
    const sentences = archiveSentences[job];
    if (running.warnings.length > 0) {
      this.host.notice({
        level: 'error',
        message: (sentences.warned ?? strings.commander.packedWithout)(
          path.basename(file),
          running.warnings.join(' '),
        ),
      });
    }
    if (how === 'broke') {
      this.host.notice({
        level: 'error',
        message: sentences.stopped(at),
      });
    } else if (
      how === 'done' &&
      (running.hidden || sentences.toldDone === true) &&
      running.failures.length === 0
    ) {
      this.host.notice({
        level: 'info',
        message: sentences.done(whatOf(running.ask), at),
      });
    }
    this.host.finished(running.ask);
    this.show();
  }

  private shownOne(): Running | undefined {
    return (
      this.running.find(
        (running) => !running.hidden && running.clash !== undefined,
      ) ?? this.running.findLast((running) => !running.hidden)
    );
  }

  private show(): void {
    const running = this.shownOne();
    this.host.show(running && this.viewOf(running));
  }

  private viewOf(running: Running): TransferView {
    const { ask, progress, clash } = running;
    return {
      id: running.id,
      move: ask.plan.move,
      ...(ask.archive !== undefined && { archiveJob: ask.archive.job }),
      items: ask.names.length,
      ...(ask.names.length === 1 && { name: path.basename(ask.names[0]) }),
      target: ask.archive?.at ?? ask.archive?.file ?? ask.plan.target,
      ...(progress !== undefined && { progress }),
      ...(clash !== undefined && { clash }),
      stopping: running.stopping,
    };
  }
}
