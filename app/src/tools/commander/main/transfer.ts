import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Clash,
  ClashAnswer,
  ClashSide,
  TransferProgress,
} from '../shared/transfers';
import { strings } from '../../../shared/strings';
import { fileIdOf } from './fileIds';
import { reasonOf } from './reasons';

export interface TransferPlan {
  readonly sources: readonly string[];
  readonly target: string;
  readonly move: boolean;
}

export interface ClashReply {
  readonly answer: ClashAnswer | 'stop';
  readonly all: boolean;
}

export interface TransferEvents {
  readonly progress: (progress: TransferProgress) => void;
  readonly clash: (clash: Clash) => Promise<ClashReply>;
  readonly failed: (name: string, reason: string) => void;
}

export interface TransferOptions {
  readonly stopped: () => boolean;
  readonly rename?: (from: string, to: string) => Promise<void>;
  readonly cloning?: boolean;
  readonly piecesFrom?: number;
  readonly pieceBytes?: number;
  readonly now?: () => number;
  readonly progressEvery?: number;
}

export type TransferEnd = 'done' | 'stopped';

interface Count {
  readonly files: number;
  readonly bytes: number;
}

const none: Count = { files: 0, bytes: 0 };

class Stopped extends Error {}

function codeOf(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

async function statsOf(file: string): Promise<fs.Stats | undefined> {
  try {
    return await fs.promises.lstat(file);
  } catch {
    return undefined;
  }
}

async function identityOf(file: string): Promise<string | undefined> {
  try {
    return fileIdOf(await fs.promises.lstat(file, { bigint: true }));
  } catch {
    return undefined;
  }
}

async function sameItem(source: string, target: string): Promise<boolean> {
  const [from, to] = await Promise.all([
    identityOf(source),
    identityOf(target),
  ]);
  return from !== undefined && from === to;
}

const markOfTheWeb = ':Zone.Identifier';

async function keptMark(source: string, target: string): Promise<void> {
  if (process.platform !== 'win32') {
    return;
  }
  const mark = await fs.promises
    .readFile(`${source}${markOfTheWeb}`)
    .catch(() => undefined);
  if (mark !== undefined) {
    await fs.promises.writeFile(`${target}${markOfTheWeb}`, mark);
  }
}

function partOf(target: string): string {
  return `${target}.${randomBytes(4).toString('hex')}.part`;
}

const ownerWrites = 0o200;

function sideOf(stats: fs.Stats): ClashSide {
  return {
    size: stats.isDirectory() ? undefined : stats.size,
    modified: stats.mtimeMs,
    ...((stats.mode & ownerWrites) === 0 && { readOnly: true }),
  };
}

async function freeName(file: string): Promise<string> {
  const { dir, name, ext } = path.parse(file);
  for (let number = 2; ; number++) {
    const candidate = path.join(dir, `${name} (${number})${ext}`);
    if ((await statsOf(candidate)) === undefined) {
      return candidate;
    }
  }
}

const ignored = () => undefined;

class Transfer {
  private readonly counts = new Map<string, Count>();
  private files = 0;
  private bytes = 0;
  private totalFiles = 0;
  private totalBytes = 0;
  private current: string | undefined;
  private reported = Number.NEGATIVE_INFINITY;
  private always: ClashAnswer | undefined;
  private readonly rename: (from: string, to: string) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly plan: TransferPlan,
    private readonly events: TransferEvents,
    private readonly options: TransferOptions,
  ) {
    this.rename = options.rename ?? fs.promises.rename;
    this.now = options.now ?? Date.now;
  }

  async run(): Promise<TransferEnd> {
    try {
      const left = this.plan.move
        ? await this.renamedWhole()
        : this.plan.sources;
      for (const source of left) {
        const count = await this.count(source);
        this.totalFiles += count.files;
        this.totalBytes += count.bytes;
      }
      this.report(true);
      for (const source of left) {
        await this.item(source, this.targetOf(source), true);
      }
      this.report(true);
      return 'done';
    } catch (error) {
      if (error instanceof Stopped) {
        this.report(true);
        return 'stopped';
      }
      throw error;
    }
  }

  private targetOf(source: string): string {
    return path.join(this.plan.target, path.basename(source));
  }

  private nameOf(target: string): string {
    return path.relative(this.plan.target, target);
  }

  private stopIfAsked(): void {
    if (this.options.stopped()) {
      throw new Stopped();
    }
  }

  private report(always = false): void {
    const now = this.now();
    if (!always && now - this.reported < (this.options.progressEvery ?? 100)) {
      return;
    }
    this.reported = now;
    this.events.progress({
      files: this.files,
      totalFiles: this.totalFiles,
      bytes: this.bytes,
      totalBytes: this.totalBytes,
      ...(this.current !== undefined && { current: this.current }),
    });
  }

  private passed({ files, bytes }: Count): void {
    this.files += files;
    this.bytes += bytes;
    this.report();
  }

  private failed(name: string, error: unknown): void {
    this.events.failed(name, reasonOf(error));
  }

  private async renamedWhole(): Promise<string[]> {
    const left: string[] = [];
    for (const source of this.plan.sources) {
      this.stopIfAsked();
      const target = this.targetOf(source);
      if ((await statsOf(target)) !== undefined) {
        left.push(source);
        continue;
      }
      try {
        await this.rename(source, target);
      } catch (error) {
        if (codeOf(error) === 'EXDEV') {
          left.push(source);
        } else {
          this.failed(this.nameOf(target), error);
        }
      }
    }
    return left;
  }

  private async count(source: string): Promise<Count> {
    const stats = await statsOf(source);
    return stats === undefined ? none : this.countWith(source, stats);
  }

  private async countWith(source: string, stats: fs.Stats): Promise<Count> {
    if (!stats.isDirectory()) {
      return { files: 1, bytes: stats.isFile() ? stats.size : 0 };
    }
    let names: string[];
    try {
      names = await fs.promises.readdir(source);
    } catch {
      return none;
    }
    const children = names.map((name) => path.join(source, name));
    const found = await Promise.all(children.map(statsOf));
    let files = 0;
    let bytes = 0;
    for (const [index, child] of children.entries()) {
      const each = found[index];
      if (each !== undefined) {
        const count = await this.countWith(child, each);
        files += count.files;
        bytes += count.bytes;
      }
    }
    const count = { files, bytes };
    this.counts.set(source, count);
    return count;
  }

  private countOf(source: string, stats: fs.Stats): Count {
    if (stats.isDirectory()) {
      return this.counts.get(source) ?? none;
    }
    return { files: 1, bytes: stats.isFile() ? stats.size : 0 };
  }

  private async answerTo(
    name: string,
    source: fs.Stats,
    target: fs.Stats,
  ): Promise<ClashAnswer> {
    if (this.always !== undefined) {
      return this.always;
    }
    this.report(true);
    const reply = await this.events.clash({
      name,
      source: sideOf(source),
      target: sideOf(target),
    });
    this.stopIfAsked();
    if (reply.answer === 'stop') {
      throw new Stopped();
    }
    if (reply.all) {
      this.always = reply.answer;
    }
    return reply.answer;
  }

  private async item(
    source: string,
    target: string,
    renaming: boolean,
  ): Promise<void> {
    this.stopIfAsked();
    const name = this.nameOf(target);
    let from: fs.Stats;
    try {
      from = await fs.promises.lstat(source);
    } catch (error) {
      this.failed(name, error);
      return;
    }
    const there = await statsOf(target);
    let into = target;
    let overwrite = false;
    if (there !== undefined) {
      if (await sameItem(source, target)) {
        this.events.failed(name, strings.commander.itselfThere);
        this.passed(this.countOf(source, from));
        return;
      }
      if (from.isDirectory() && there.isDirectory()) {
        await this.merge(source, target, renaming);
        return;
      }
      if (from.isDirectory() || there.isDirectory()) {
        this.events.failed(
          name,
          there.isDirectory()
            ? strings.commander.folderThere
            : strings.commander.fileThere,
        );
        this.passed(this.countOf(source, from));
        return;
      }
      const answer = await this.answerTo(name, from, there);
      if (answer === 'skip') {
        this.passed(this.countOf(source, from));
        return;
      }
      if (answer === 'keepBoth') {
        into = await freeName(target);
      } else {
        overwrite = true;
        if ((there.mode & ownerWrites) === 0) {
          await fs.promises
            .chmod(target, there.mode | ownerWrites)
            .catch(ignored);
        }
      }
    }
    if (this.plan.move && renaming) {
      try {
        await this.rename(source, into);
        this.passed(this.countOf(source, from));
        return;
      } catch (error) {
        if (codeOf(error) !== 'EXDEV') {
          this.failed(name, error);
          this.passed(this.countOf(source, from));
          return;
        }
      }
    }
    if (from.isDirectory()) {
      await this.copyFolder(source, into, from);
    } else if (from.isSymbolicLink()) {
      await this.copyLink(source, into, overwrite, name);
    } else {
      await this.copyFile(source, into, from, overwrite, name);
    }
  }

  private async merge(
    source: string,
    target: string,
    renaming: boolean,
  ): Promise<void> {
    let names: string[];
    try {
      names = await fs.promises.readdir(source);
    } catch (error) {
      this.failed(this.nameOf(target), error);
      return;
    }
    for (const name of names) {
      await this.item(
        path.join(source, name),
        path.join(target, name),
        renaming,
      );
    }
    if (this.plan.move) {
      await fs.promises.rmdir(source).catch(ignored);
    }
  }

  private async copyFolder(
    source: string,
    target: string,
    stats: fs.Stats,
  ): Promise<void> {
    try {
      await fs.promises.mkdir(target);
    } catch (error) {
      this.failed(this.nameOf(target), error);
      this.passed(this.countOf(source, stats));
      return;
    }
    await this.merge(source, target, false);
    await fs.promises.utimes(target, stats.atime, stats.mtime).catch(ignored);
    if (process.platform !== 'win32') {
      await fs.promises.chmod(target, stats.mode & 0o7777).catch(ignored);
    }
  }

  private async copyLink(
    source: string,
    target: string,
    overwrite: boolean,
    name: string,
  ): Promise<void> {
    try {
      const pointed = await fs.promises.readlink(source);
      const folder = (
        await fs.promises.stat(source).catch(() => undefined)
      )?.isDirectory();
      if (overwrite) {
        await fs.promises.rm(target, { force: true });
      }
      await fs.promises
        .symlink(pointed, target, folder ? 'dir' : 'file')
        .catch((error: unknown) => {
          if (
            process.platform !== 'win32' ||
            folder !== true ||
            !path.isAbsolute(pointed) ||
            codeOf(error) !== 'EPERM'
          ) {
            throw error;
          }
          return fs.promises.symlink(pointed, target, 'junction');
        });
      if (this.plan.move) {
        await fs.promises.unlink(source);
      }
    } catch (error) {
      this.failed(name, error);
    }
    this.passed({ files: 1, bytes: 0 });
  }

  private async copyFile(
    source: string,
    target: string,
    stats: fs.Stats,
    overwrite: boolean,
    name: string,
  ): Promise<void> {
    this.current = name;
    const bytesBefore = this.bytes;
    const into = overwrite ? partOf(target) : target;
    try {
      if (stats.size >= (this.options.piecesFrom ?? 16 * 1024 * 1024)) {
        await this.copyLarge(source, into, stats);
      } else {
        await fs.promises.copyFile(
          source,
          into,
          fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL,
        );
      }
      await fs.promises.utimes(into, stats.atime, stats.mtime).catch(ignored);
      if (into !== target) {
        await fs.promises.rename(into, target);
      }
    } catch (error) {
      if (into !== target) {
        await fs.promises.rm(into, { force: true }).catch(ignored);
      }
      if (error instanceof Stopped) {
        throw error;
      }
      this.failed(name, error);
      this.bytes = bytesBefore;
      this.passed({ files: 1, bytes: stats.size });
      return;
    }
    this.bytes = bytesBefore;
    this.passed({ files: 1, bytes: stats.size });
    if (this.plan.move) {
      await fs.promises
        .unlink(source)
        .catch((error: unknown) => this.failed(name, error));
    }
  }

  private async copyLarge(
    source: string,
    target: string,
    stats: fs.Stats,
  ): Promise<void> {
    if (this.options.cloning ?? true) {
      try {
        await fs.promises.copyFile(
          source,
          target,
          fs.constants.COPYFILE_FICLONE_FORCE | fs.constants.COPYFILE_EXCL,
        );
        return;
      } catch (error) {
        if (codeOf(error) === 'EEXIST') {
          throw error;
        }
      }
    }
    await this.copyInPieces(source, target, stats);
  }

  private async copyInPieces(
    source: string,
    target: string,
    stats: fs.Stats,
  ): Promise<void> {
    const pieceBytes = this.options.pieceBytes ?? 1024 * 1024;
    const input = await fs.promises.open(source, 'r');
    let output: fs.promises.FileHandle | undefined;
    try {
      output = await fs.promises.open(target, 'w', stats.mode & 0o7777);
      const piece = Buffer.allocUnsafe(pieceBytes);
      for (let position = 0; ;) {
        this.stopIfAsked();
        const { bytesRead } = await input.read(piece, 0, pieceBytes, position);
        if (bytesRead === 0) {
          break;
        }
        await output.write(piece, 0, bytesRead, position);
        position += bytesRead;
        this.bytes += bytesRead;
        this.report();
      }
      await keptMark(source, target);
    } catch (error) {
      await output?.close().catch(ignored);
      output = undefined;
      await fs.promises.rm(target, { force: true }).catch(ignored);
      throw error;
    } finally {
      await output?.close();
      await input.close();
    }
  }
}

export function runTransfer(
  plan: TransferPlan,
  events: TransferEvents,
  options: TransferOptions,
): Promise<TransferEnd> {
  return new Transfer(plan, events, options).run();
}
