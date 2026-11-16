import { StringDecoder } from 'node:string_decoder';
import { type FileChange, type LeftOut } from '../shared/protocol';
import {
  collapseThreshold,
  patchByteBudget,
  patchLineBudget,
} from '../../../components/diff/shared/patchBudget';
import { headerOf } from './patchText';
import { runGitBytes } from './run';

export interface PatchSection {
  readonly header: string;
  readonly lines: number | undefined;
  readonly kept: boolean;
}

export interface BudgetedPatch {
  readonly patch: string;
  readonly sections: readonly PatchSection[];
  readonly stopped: boolean;
}

interface OpenSection {
  readonly header: string;
  readonly text: string[];
  lines: number;
  bytes: number;
  inHunk: boolean;
}

export class PatchBudget {
  stopped = false;
  private readonly kept: string[] = [];
  private readonly sections: PatchSection[] = [];
  private readonly decoder = new StringDecoder('utf8');
  private pending = '';
  private pendingBytes = 0;
  private section: OpenSection | undefined;
  private keptLines = 0;
  private readBytes = 0;

  add(chunk: Buffer): boolean {
    if (this.stopped) {
      return true;
    }
    const decoded = this.decoder.write(chunk);
    const end = decoded.lastIndexOf('\n');
    let from = 0;
    if (end === -1) {
      this.pending += decoded;
    } else {
      const text = this.pending + decoded.slice(0, end);
      this.pending = decoded.slice(end + 1);
      for (const line of text.split('\n')) {
        const at = chunk.indexOf(0x0a, from);
        const bytes = this.pendingBytes + at + 1 - from;
        this.pendingBytes = 0;
        from = at + 1;
        if (this.addLine(line, bytes, true)) {
          return true;
        }
      }
    }
    this.pendingBytes += chunk.length - from;
    if (
      this.section &&
      this.readBytes + this.section.bytes + this.pendingBytes > patchByteBudget
    ) {
      this.stop(this.section, undefined);
    }
    return this.stopped;
  }

  end(): BudgetedPatch {
    if (!this.stopped) {
      const rest = this.pending + this.decoder.end();
      if (rest) {
        this.addLine(rest, this.pendingBytes, false);
      }
      this.close();
    }
    return {
      patch: this.kept.join(''),
      sections: this.sections,
      stopped: this.stopped,
    };
  }

  private addLine(line: string, bytes: number, newline: boolean): boolean {
    if (line === this.section?.header) {
      this.section.inHunk = false;
    } else if (line.startsWith('diff --git ')) {
      if (this.close()) {
        return true;
      }
      this.section = {
        header: line,
        text: [],
        lines: 0,
        bytes: 0,
        inHunk: false,
      };
    }
    const text = newline ? `${line}\n` : line;
    const { section } = this;
    if (!section) {
      this.kept.push(text);
      return false;
    }
    section.bytes += bytes;
    if (line.startsWith('@@')) {
      section.inHunk = true;
    } else if (section.inHunk && (line[0] === '+' || line[0] === '-')) {
      section.lines++;
    }
    if (section.lines <= collapseThreshold) {
      section.text.push(text);
    }
    if (this.readBytes + section.bytes > patchByteBudget) {
      this.stop(section, undefined);
      return true;
    }
    return false;
  }

  private close(): boolean {
    const { section } = this;
    this.section = undefined;
    if (!section) {
      return false;
    }
    const { header, lines, bytes } = section;
    this.readBytes += bytes;
    if (lines > collapseThreshold) {
      this.sections.push({ header, lines, kept: false });
      return false;
    }
    if (this.keptLines + lines > patchLineBudget) {
      this.stop(section, lines);
      return true;
    }
    this.keptLines += lines;
    this.kept.push(section.text.join(''));
    this.sections.push({ header, lines, kept: true });
    return false;
  }

  private stop(section: OpenSection, lines: number | undefined): void {
    this.sections.push({ header: section.header, lines, kept: false });
    this.section = undefined;
    this.stopped = true;
  }
}

export function leftOutOf(
  { sections, stopped }: BudgetedPatch,
  files: readonly FileChange[],
): LeftOut[] {
  const headers = files.map(headerOf);
  const leftOut: LeftOut[] = [];
  let next = 0;
  for (const { header, lines, kept } of sections) {
    let at = next;
    while (at < headers.length && headers[at] !== header) {
      at++;
    }
    if (at === headers.length) {
      continue;
    }
    next = at + 1;
    if (!kept) {
      leftOut.push({ path: files[at].path, lines });
    }
  }
  if (stopped) {
    for (const { path } of files.slice(next)) {
      leftOut.push({ path, lines: 0 });
    }
  }
  return leftOut;
}

export interface ReadPatch extends BudgetedPatch {
  readonly exited: Promise<void>;
}

export async function readPatch(
  gitPath: string,
  cwd: string,
  commands: readonly (readonly string[])[],
  signal?: AbortSignal,
): Promise<ReadPatch> {
  const budget = new PatchBudget();
  const stopping = new AbortController();
  const exits: Promise<unknown>[] = [];
  for (const args of commands) {
    if (budget.stopped) {
      break;
    }
    const reached = Promise.withResolvers<void>();
    const running = runGitBytes(gitPath, cwd, args, {
      signal: signal
        ? AbortSignal.any([signal, stopping.signal])
        : stopping.signal,
      onOutput: (chunk) => {
        if (budget.add(chunk)) {
          stopping.abort();
          reached.resolve();
        }
      },
    });
    exits.push(running.catch(() => undefined));
    await Promise.race([running, reached.promise]).catch((error: unknown) => {
      if (!budget.stopped || signal?.aborted) {
        throw error;
      }
    });
  }
  return {
    ...budget.end(),
    exited: Promise.all(exits).then(() => undefined),
  };
}
