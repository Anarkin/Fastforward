import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../shared/strings';
import type {
  ArchiveItem,
  ArchiveListing,
  ArchiveReader,
  ArchiveRefusal,
  ExtractOptions,
  ExtractProgress,
} from './archives';

export interface SevenZipRun {
  readonly code: number | null;
  readonly output: string;
  readonly errors: string;
}

interface SevenZipOptions {
  readonly signal?: AbortSignal;
  readonly onOutput?: (text: string) => void;
  readonly input?: string;
}

export type SevenZip = (
  args: readonly string[],
  options?: SevenZipOptions,
) => Promise<SevenZipRun>;

export function sevenZipProgram(options: {
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly appPath: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}): string {
  const folder = options.packaged
    ? path.join(options.resourcesPath, '7zip')
    : path.join(
        options.appPath,
        'build',
        '7zip',
        `${options.platform}-${options.arch}`,
      );
  return path.join(folder, options.platform === 'win32' ? '7z.exe' : '7zz');
}

function decoded(chunks: readonly Buffer[]): string {
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function sevenZipAt(program: string): SevenZip {
  return (args, { signal, onOutput, input } = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(program, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        ...(signal !== undefined && { signal }),
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(input);
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      const streamed = new TextDecoder();
      child.stdout.on('data', (chunk: Buffer) => {
        output.push(chunk);
        onOutput?.(streamed.decode(chunk, { stream: true }));
      });
      child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
      child.once('error', reject);
      child.once('close', (code) =>
        resolve({ code, output: decoded(output), errors: decoded(errors) }),
      );
    });
}

const noPrompt = '-p-';
const noArchiveSeen = 'Cannot open the file as archive';
const wrongPassword = /Wrong password/i;
const itemsStart = '----------';
const timePattern =
  /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?/;
const errorPattern = /^(?:Open )?ERROR: (.+)$/;

function fieldsOf(block: readonly string[]): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of block) {
    const at = line.indexOf(' = ');
    if (at > 0) {
      fields.set(line.slice(0, at), line.slice(at + 3));
    }
  }
  return fields;
}

function timeOf(text: string | undefined): number | undefined {
  const found = text === undefined ? null : timePattern.exec(text);
  if (found === null) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, fraction = '0'] = found;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(fraction.padEnd(3, '0')),
  );
}

function sizeOf(text: string | undefined): number | undefined {
  const size = text === undefined || text === '' ? Number.NaN : Number(text);
  return Number.isSafeInteger(size) ? size : undefined;
}

const tarShorthand = /\.t(?:az|bz2?|gz|pz|xz|zst)$/i;

function nameExtractedOf(file: string): string {
  const name = path.basename(file);
  if (tarShorthand.test(name)) {
    return name.replace(/\.[^.]+$/, '.tar');
  }
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function itemOf(
  fields: ReadonlyMap<string, string>,
  file: string,
): ArchiveItem | undefined {
  const itemPath =
    fields.get('Path') ??
    (fields.has('Size') ? nameExtractedOf(file) : undefined);
  if (itemPath === undefined) {
    return undefined;
  }
  const [letters = ''] = (fields.get('Attributes') ?? '').split(' ');
  const marked = fields.get('Folder');
  const folder = marked === undefined ? letters.includes('D') : marked === '+';
  return {
    path: itemPath,
    folder,
    size: folder ? undefined : sizeOf(fields.get('Size')),
    modified: timeOf(fields.get('Modified')),
    hiddenAttribute: letters.includes('H'),
    link: (fields.get('Symbolic Link') ?? '') !== '',
    encrypted: fields.get('Encrypted') === '+',
  };
}

const slashed = (file: string) => file.replaceAll('\\', '/');

const counted = /^(?:Errors|Warnings): \d+$/;

function listedUnder(lines: readonly string[]): string[] {
  const reasons: string[] = [];
  let under = false;
  for (const line of lines.map((each) => each.trim())) {
    if (line === 'ERRORS:' || line === 'WARNINGS:') {
      under = true;
    } else if (line === '' || line.includes(' = ')) {
      under = false;
    } else if (under && !counted.test(line) && !reasons.includes(line)) {
      reasons.push(line);
    }
  }
  return reasons;
}

export function reasonOf(run: SevenZipRun, file: string): string {
  const lines = `${run.errors}\n${run.output}`.split(/\r?\n/);
  const reasons = lines.flatMap((line, at) => {
    const [, message] = errorPattern.exec(line.trim()) ?? [];
    if (message === undefined) {
      return [];
    }
    const named = message.indexOf(' : ');
    const reason =
      named >= 0 && slashed(message.slice(0, named)) === slashed(file)
        ? message.slice(named + 3)
        : message;
    if (slashed(reason) !== slashed(file)) {
      return [reason];
    }
    const next = lines[at + 1]?.trim() ?? '';
    return next === '' || next.endsWith(':') || errorPattern.test(next)
      ? []
      : [next];
  });
  const told = reasons.length > 0 ? reasons : listedUnder(lines);
  return told.length > 0
    ? told.join(' ')
    : strings.commander.sevenZipEnded(run.code);
}

function passwordGiven(password: string | undefined): {
  readonly switches: readonly string[];
  readonly input: string | undefined;
} {
  return password === undefined
    ? { switches: [noPrompt], input: undefined }
    : { switches: [], input: `${password}\n` };
}

function refusalOf(run: SevenZipRun, file: string): ArchiveRefusal {
  const reason = reasonOf(run, file);
  return {
    reason,
    ...(reason === noArchiveSeen && { noArchive: true }),
    ...(wrongPassword.test(reason) && { needsPassword: true }),
  };
}

async function listed(
  sevenZip: SevenZip,
  file: string,
  signal?: AbortSignal,
  password?: string,
): Promise<ArchiveListing> {
  const { switches, input } = passwordGiven(password);
  const run = await sevenZip(
    ['l', '-slt', '-sccUTF-8', '-slsl', '-slmu', ...switches, '--', file],
    { signal, input },
  );
  const lines = run.output.split(/\r?\n/);
  const start = lines.indexOf(itemsStart);
  if ((run.code !== 0 && run.code !== 1) || start < 0) {
    return { kind: 'refused', ...refusalOf(run, file) };
  }
  const items: ArchiveItem[] = [];
  let block: string[] = [];
  for (const line of [...lines.slice(start + 1), '']) {
    if (line !== '') {
      block.push(line);
      continue;
    }
    const item = itemOf(fieldsOf(block), file);
    if (item !== undefined) {
      items.push(item);
    }
    block = [];
  }
  return { kind: 'listed', items };
}

const progressPattern = /^(\d+)%(?:\s+(\d+))?(?:\s+-\s+(.+))?$/;

export function progressOf(piece: string): ExtractProgress | undefined {
  const found = progressPattern.exec(piece.trim());
  if (found === null) {
    return undefined;
  }
  const [, percent = '0', files = '0', current] = found;
  return {
    percent: Number(percent),
    files: Number(files),
    ...(current !== undefined && { current: current.replaceAll('\\', '/') }),
  };
}

function progressed(
  onProgress: (progress: ExtractProgress) => void,
): (text: string) => void {
  let left = '';
  return (text) => {
    const pieces = `${left}${text}`.split(/[\r\n]/);
    left = pieces.pop() ?? '';
    const last = pieces
      .map(progressOf)
      .findLast((progress) => progress !== undefined);
    if (last !== undefined) {
      onProgress(last);
    }
  };
}

async function extracted(
  sevenZip: SevenZip,
  file: string,
  paths: readonly string[],
  into: string,
  { signal, onProgress, withoutFolders = false, password }: ExtractOptions = {},
): Promise<ArchiveRefusal | undefined> {
  await fs.promises.mkdir(into, { recursive: true });
  const list = `${into}.paths`;
  await fs.promises.writeFile(list, paths.join('\n'));
  const { switches, input } = passwordGiven(password);
  try {
    const run = await sevenZip(
      [
        withoutFolders ? 'e' : 'x',
        '-y',
        ...switches,
        '-snz',
        '-spd',
        '-sccUTF-8',
        '-scsUTF-8',
        ...(onProgress === undefined ? [] : ['-bso0', '-bsp1']),
        `-o${into}`,
        `-i@${list}`,
        '--',
        file,
      ],
      {
        signal,
        input,
        ...(onProgress !== undefined && { onOutput: progressed(onProgress) }),
      },
    );
    return run.code === 0 || run.code === 1 ? undefined : refusalOf(run, file);
  } finally {
    await fs.promises.rm(list, { force: true });
  }
}

export function sevenZipReaderAt(program: string): ArchiveReader | undefined {
  return fs.existsSync(program)
    ? sevenZipReader(sevenZipAt(program))
    : undefined;
}

export function sevenZipReader(sevenZip: SevenZip): ArchiveReader {
  return {
    list: (file, signal, password) => listed(sevenZip, file, signal, password),
    extract: (file, paths, into, options) =>
      extracted(sevenZip, file, paths, into, options),
  };
}
