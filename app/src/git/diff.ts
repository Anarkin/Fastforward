import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import {
  collapseThreshold,
  patchByteBudget,
  patchLineBudget,
  type FileChange,
  type LeftOut,
} from '../shared/protocol';
import { blobSizes } from './files';
import { runGit, runGitBytes, splitNul } from './run';

export const diffArgs = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--histogram',
  '--full-index',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

const showArgs = [
  'show',
  '--diff-merges=first-parent',
  '--format=',
  '-M',
  ...diffArgs,
];

export const changesArgs = ['--raw', '--numstat', '-z', '--no-abbrev'];

const listArgs = ['--raw', '-z', '--no-abbrev'];

const compareArgs = ['diff', '-M', ...diffArgs];

export function showFiles(
  gitPath: string,
  cwd: string,
  hash: string,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  return changedFiles(gitPath, cwd, [...showArgs, ...listArgs, hash], signal);
}

export function compareFiles(
  gitPath: string,
  cwd: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<FileChange[]> {
  return changedFiles(
    gitPath,
    cwd,
    [...compareArgs, ...listArgs, from, to],
    signal,
  );
}

async function changedFiles(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  signal: AbortSignal | undefined,
): Promise<FileChange[]> {
  return parseChanges(await runGit(gitPath, cwd, args, { signal }));
}

export function showPatchArgs(hash: string, scope: PatchScope): string[] {
  return [...showArgs, '--patch', ...diffOptionArgs(scope), hash];
}

export function comparePatchArgs(
  from: string,
  to: string,
  scope: PatchScope,
): string[] {
  return [...compareArgs, ...diffOptionArgs(scope), from, to];
}

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
  private section: OpenSection | undefined;
  private keptLines = 0;
  private keptBytes = 0;

  add(chunk: Buffer): boolean {
    if (this.stopped) {
      return true;
    }
    const text = this.pending + this.decoder.write(chunk);
    const end = text.lastIndexOf('\n');
    this.pending = text.slice(end + 1);
    if (end !== -1) {
      for (const line of text.slice(0, end).split('\n')) {
        if (this.addLine(line, true)) {
          return true;
        }
      }
    }
    if (
      this.section &&
      this.section.bytes + this.pending.length > patchByteBudget
    ) {
      this.stop(this.section, undefined);
    }
    return this.stopped;
  }

  end(): BudgetedPatch {
    if (!this.stopped) {
      const rest = this.pending + this.decoder.end();
      if (rest) {
        this.addLine(rest, false);
      }
      this.close();
    }
    return {
      patch: this.kept.join(''),
      sections: this.sections,
      stopped: this.stopped,
    };
  }

  private addLine(line: string, newline: boolean): boolean {
    if (line.startsWith('diff --git ')) {
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
    section.bytes += text.length;
    if (line.startsWith('@@')) {
      section.inHunk = true;
    } else if (section.inHunk && (line[0] === '+' || line[0] === '-')) {
      section.lines++;
    }
    if (section.lines <= collapseThreshold) {
      section.text.push(text);
    }
    if (section.bytes > patchByteBudget) {
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
    if (lines > collapseThreshold) {
      this.sections.push({ header, lines, kept: false });
      return false;
    }
    if (
      this.keptLines + lines > patchLineBudget ||
      this.keptBytes + bytes > patchByteBudget
    ) {
      this.stop(section, lines);
      return true;
    }
    this.keptLines += lines;
    this.keptBytes += bytes;
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
    leftOut.push(...files.slice(next).map(({ path }) => ({ path, lines: 0 })));
  }
  return leftOut;
}

function headerOf(file: FileChange): string {
  return `diff --git ${quoted(`a/${file.oldPath ?? file.path}`)} ${quoted(`b/${file.path}`)}`;
}

const escapes: Readonly<Record<string, string>> = {
  '"': '\\"',
  '\\': '\\\\',
  '\x07': '\\a',
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\v': '\\v',
  '\f': '\\f',
  '\r': '\\r',
};

function quoted(name: string): string {
  let escaped = '';
  for (const character of name) {
    const code = character.charCodeAt(0);
    escaped +=
      escapes[character] ??
      (code < 0x20 || code === 0x7f
        ? `\\${code.toString(8).padStart(3, '0')}`
        : character);
  }
  return escaped === name ? name : `"${escaped}"`;
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

export interface RawChange {
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldId: string;
  readonly newId: string;
  readonly linesCounted: boolean;
  readonly file: FileChange;
}

export async function withBytes(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  { fromDisk = false, reverse = false } = {},
): Promise<RawChange[]> {
  const counted = ({ file }: RawChange) => file.insertions + file.deletions > 0;
  const sizes = await blobSizes(gitPath, cwd, [
    ...new Set(
      changes
        .filter(counted)
        .flatMap(({ oldId, newId }) => [oldId, newId])
        .filter((id) => !isNullId(id)),
    ),
  ]);
  const sizeOnDisk = async (path: string) => {
    if (!fromDisk) {
      return 0;
    }
    const stats = await lstat(join(cwd, path)).catch(() => undefined);
    return stats?.isFile() ? stats.size : 0;
  };
  return Promise.all(
    changes.map(async (change) => {
      if (!counted(change)) {
        return change;
      }
      const { oldId, newId, file } = change;
      const [oldSide, newSide, path] = reverse
        ? [newId, oldId, file.oldPath ?? file.path]
        : [oldId, newId, file.path];
      const bytes =
        (sizes.get(oldSide) ?? 0) +
        (sizes.get(newSide) ?? (await sizeOnDisk(path)));
      return { ...change, file: { ...file, bytes } };
    }),
  );
}

export function isNullId(id: string): boolean {
  return /^0+$/.test(id);
}

export interface PatchScope {
  readonly path?: string;
  readonly oldPath?: string;
  readonly include?: readonly string[];
  readonly entireFile?: boolean;
  readonly ignoreWhitespace?: boolean;
}

export function diffOptionArgs({
  entireFile,
  ignoreWhitespace,
}: PatchScope): string[] {
  return [
    ...(entireFile ? ['--unified=2147483647'] : []),
    ...(ignoreWhitespace ? ['--ignore-all-space'] : []),
  ];
}

export function pathspecs({ path, oldPath, include }: PatchScope): string[] {
  if (path !== undefined) {
    return oldPath ? ['--', oldPath, path] : ['--', path];
  }
  return include ? ['--', ...include] : [];
}

export function showPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  return patchOf(gitPath, cwd, [...showArgs, '--patch'], [hash], scope, signal);
}

export function comparePatch(
  gitPath: string,
  cwd: string,
  from: string,
  to: string,
  scope: PatchScope = {},
  signal?: AbortSignal,
): Promise<string> {
  return patchOf(gitPath, cwd, compareArgs, [from, to], scope, signal);
}

function patchOf(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  revisions: readonly string[],
  scope: PatchScope,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (scope.include?.length === 0) {
    return Promise.resolve('');
  }
  return runGit(
    gitPath,
    cwd,
    [...args, ...diffOptionArgs(scope), ...revisions, ...pathspecs(scope)],
    { signal },
  );
}

const simpleStatuses = ['A', 'M', 'D', 'T'] as const;

export function parseChanges(output: string): FileChange[] {
  return parseRawChanges(output).map(({ file }) => file);
}

export function parseRawChanges(output: string): RawChange[] {
  const tokens = splitNul(output);
  const files: Omit<RawChange, 'linesCounted'>[] = [];
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith(':')) {
      const [oldMode = '', newMode = '', oldId = '', newId = '', status = ''] =
        token.slice(1).split(' ');
      const sides = { oldMode, newMode, oldId, newId };
      const code = status[0] ?? '';
      if (code === 'R' || code === 'C') {
        files.push({
          ...sides,
          file: {
            status: code,
            oldPath: tokens[i + 1],
            path: tokens[i + 2],
            insertions: 0,
            deletions: 0,
            ...(oldId === newId && !isNullId(newId) ? { id: newId } : {}),
          },
        });
        i += 2;
      } else {
        files.push({
          ...sides,
          file: {
            status: simpleStatuses.find((known) => known === code) ?? '?',
            oldPath: undefined,
            path: tokens[i + 1],
            insertions: 0,
            deletions: 0,
          },
        });
        i += 1;
      }
      continue;
    }
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(token);
    if (!match) {
      continue;
    }
    let path = match[3];
    if (path === '') {
      path = tokens[i + 2];
      i += 2;
    }
    stats.set(path, {
      insertions: Number(match[1]) || 0,
      deletions: Number(match[2]) || 0,
    });
  }
  return files.map((change) => {
    const counted = stats.get(change.file.path);
    return {
      ...change,
      linesCounted: counted !== undefined,
      file: { ...change.file, ...counted },
    };
  });
}
