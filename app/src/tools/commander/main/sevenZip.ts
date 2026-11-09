import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../shared/strings';
import type { PackLevel } from '../shared/packing';
import type {
  ArchiveItem,
  ArchiveListing,
  ArchiveReader,
  ArchiveRefusal,
  ExtractOptions,
  ExtractProgress,
  PackOptions,
  PackPlan,
  Packing,
  RemoveOptions,
  UpdateOptions,
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
  readonly cwd?: string;
  readonly pipeInto?: readonly string[];
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

function ended(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let failure: unknown;
    child.once('error', (error) => {
      failure = error;
      if (child.pid === undefined) {
        reject(error);
      }
    });
    child.once('close', (code) => {
      if (failure === undefined) {
        resolve(code);
      } else {
        reject(failure);
      }
    });
  });
}

export function sevenZipAt(program: string): SevenZip {
  return async (args, { signal, onOutput, input, cwd, pipeInto } = {}) => {
    const started = (each: readonly string[]) =>
      spawn(program, each, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        ...(signal !== undefined && { signal }),
        ...(cwd !== undefined && { cwd }),
      });
    const first = started(args);
    const last = pipeInto === undefined ? first : started(pipeInto);
    first.stdin.on('error', () => undefined);
    first.stdin.end(input);
    last.stdin.on('error', () => undefined);
    if (last !== first) {
      first.stdout.pipe(last.stdin);
    }
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    const streamed = new TextDecoder();
    const told = (chunk: Buffer) =>
      onOutput?.(streamed.decode(chunk, { stream: true }));
    last.stdout.on('data', (chunk: Buffer) => {
      output.push(chunk);
      if (last === first) {
        told(chunk);
      }
    });
    first.stderr.on('data', (chunk: Buffer) => {
      errors.push(chunk);
      if (last !== first) {
        told(chunk);
      }
    });
    if (last !== first) {
      last.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    }
    const [firstCode, lastCode] = await Promise.all([
      ended(first),
      last === first ? undefined : ended(last),
    ]);
    const code =
      last === first || (firstCode !== 0 && firstCode !== 1)
        ? firstCode
        : (lastCode ?? null);
    return { code, output: decoded(output), errors: decoded(errors) };
  };
}

const noPrompt = '-p-';
const noArchiveSeen = 'Cannot open the file as archive';
const wrongPassword = /Wrong password/i;
const itemsStart = '----------';
const timePattern =
  /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?/;
const errorPattern = /^(?:Open |System )?(?:ERROR|Error):(?: (.+))?$/;

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
    const found = errorPattern.exec(line.trim());
    if (found === null) {
      return [];
    }
    const [, message = file] = found;
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

const progressPattern = /^(\d+)%(?:\s+(\d+))?(?:\s+\S\s+(.+))?$/;

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

const packLevels: Record<PackLevel, number> = {
  store: 0,
  fastest: 1,
  normal: 5,
  maximum: 7,
  ultra: 9,
};
const packNames = ['-ssw', '-sccUTF-8', '-scsUTF-8', '-spd'];

function tarNameOf(archive: string): string {
  const bare = path.basename(archive).replace(/\.(?:gz|xz)$/i, '');
  return /\.tar$/i.test(bare) ? bare : `${bare.replace(/\.t[gx]z$/i, '')}.tar`;
}

function packRun(
  plan: PackPlan,
  into: string,
  progress: boolean,
): { readonly args: readonly string[]; readonly pipeInto?: readonly string[] } {
  const level = `-mx${packLevels[plan.level]}`;
  const volumes =
    plan.volumeBytes === undefined ? [] : [`-v${plan.volumeBytes}b`];
  if (plan.format === 'tar.gz' || plan.format === 'tar.xz') {
    return {
      args: [
        'a',
        '-ttar',
        '-so',
        '-an',
        ...packNames,
        '-bso2',
        progress ? '-bsp2' : '-bsp0',
        '--',
        ...plan.items,
      ],
      pipeInto: [
        'a',
        plan.format === 'tar.gz' ? '-tgzip' : '-txz',
        level,
        `-si${tarNameOf(plan.archive)}`,
        ...volumes,
        '-bso0',
        '-bsp0',
        '--',
        into,
      ],
    };
  }
  const cipher =
    plan.format === 'zip'
      ? [`-mem=${plan.zipCipher === 'zipCrypto' ? 'ZipCrypto' : 'AES256'}`]
      : plan.encryptNames === true
        ? ['-mhe=on']
        : [];
  return {
    args: [
      'a',
      `-t${plan.format}`,
      ...(plan.format === 'tar' ? [] : [level]),
      ...(passwordUsed(plan) ? ['-p', ...cipher] : []),
      ...volumes,
      ...packNames,
      ...(progress ? ['-bsp1'] : []),
      '--',
      into,
      ...plan.items,
    ],
  };
}

function passwordUsed(plan: PackPlan): boolean {
  return (
    plan.password !== undefined &&
    (plan.format === 'zip' || plan.format === '7z')
  );
}

const warnedFiles = /^(?:Scan )?WARNINGS for files(?: and folders)?:$/;
const warningsShown = 3;

function warnedIn(lines: readonly string[]): string[] {
  const warned: string[] = [];
  let under = false;
  for (const line of lines) {
    if (warnedFiles.test(line)) {
      under = true;
    } else if (/^-+$/.test(line)) {
      under = false;
    } else if (under && line !== '') {
      const named = line.indexOf(' : ');
      warned.push(
        named < 0 ? line : `${line.slice(0, named)}: ${line.slice(named + 3)}`,
      );
    }
  }
  return warned;
}

function warningOf(run: SevenZipRun, file: string): string {
  const warned = warnedIn(
    `${run.errors}\n${run.output}`.split(/\r?\n/).map((line) => line.trim()),
  );
  if (warned.length === 0) {
    return reasonOf(run, file);
  }
  return [
    ...warned.slice(0, warningsShown),
    ...(warned.length > warningsShown
      ? [strings.commander.warnedMore(warned.length - warningsShown)]
      : []),
  ].join(' ');
}

const addedPattern =
  /^Add new data to archive: (?:\d+ folders?, )?(\d+) files?, (\d+) bytes/;
const keptPattern =
  /^Keep old data in archive: (?:\d+ folders?, )?(\d+) files?, (\d+) bytes/;

function packOutput(
  { onProgress, onTotals }: PackOptions,
  totalsPattern: RegExp = addedPattern,
): ((text: string) => void) | undefined {
  if (onProgress === undefined && onTotals === undefined) {
    return undefined;
  }
  let left = '';
  return (text) => {
    const pieces = `${left}${text}`.split(/[\r\n]/);
    left = pieces.pop() ?? '';
    let last: ExtractProgress | undefined;
    for (const piece of pieces) {
      const [, files, bytes] = totalsPattern.exec(piece.trim()) ?? [];
      if (files !== undefined && bytes !== undefined) {
        onTotals?.({ files: Number(files), bytes: Number(bytes) });
      }
      last = progressOf(piece) ?? last;
    }
    if (last !== undefined) {
      onProgress?.(last);
    }
  };
}

async function packed(
  sevenZip: SevenZip,
  plan: PackPlan,
  into: string,
  options: PackOptions = {},
): Promise<Packing> {
  const { signal } = options;
  const onOutput = packOutput(options);
  const { args, pipeInto } = packRun(plan, into, onOutput !== undefined);
  const run = await sevenZip(args, {
    cwd: plan.folder,
    ...(signal !== undefined && { signal }),
    ...(pipeInto !== undefined && { pipeInto }),
    ...(passwordUsed(plan) && { input: `${plan.password}\n` }),
    ...(onOutput !== undefined && { onOutput }),
  });
  if (run.code === 0) {
    return { kind: 'packed' };
  }
  return run.code === 1
    ? { kind: 'packed', warning: warningOf(run, into) }
    : { kind: 'refused', ...refusalOf(run, into) };
}

async function removed(
  sevenZip: SevenZip,
  file: string,
  paths: readonly string[],
  { listIn, password, signal, ...told }: RemoveOptions,
): Promise<Packing> {
  const list = path.join(listIn, 'removed.paths');
  await fs.promises.writeFile(list, paths.join('\n'));
  const onOutput = packOutput(told, keptPattern);
  const { switches, input } = passwordGiven(password);
  try {
    const run = await sevenZip(
      [
        'd',
        '-y',
        ...switches,
        '-spd',
        '-sccUTF-8',
        '-scsUTF-8',
        ...(onOutput === undefined ? [] : ['-bsp1']),
        `-i@${list}`,
        '--',
        file,
      ],
      {
        ...(signal !== undefined && { signal }),
        ...(input !== undefined && { input }),
        ...(onOutput !== undefined && { onOutput }),
      },
    );
    if (run.code === 0) {
      return { kind: 'packed' };
    }
    return run.code === 1
      ? { kind: 'packed', warning: warningOf(run, file) }
      : { kind: 'refused', ...refusalOf(run, file) };
  } finally {
    await fs.promises.rm(list, { force: true });
  }
}

function outcomeOf(run: SevenZipRun, file: string): Packing {
  if (run.code === 0) {
    return { kind: 'packed' };
  }
  return run.code === 1
    ? { kind: 'packed', warning: warningOf(run, file) }
    : { kind: 'refused', ...refusalOf(run, file) };
}

async function renamedIn(
  sevenZip: SevenZip,
  file: string,
  from: string,
  to: string,
  { password, signal, ...told }: UpdateOptions,
): Promise<Packing> {
  const onOutput = packOutput(told, keptPattern);
  const { switches, input } = passwordGiven(password);
  const run = await sevenZip(
    [
      'rn',
      '-y',
      ...switches,
      '-spd',
      '-sccUTF-8',
      '-scsUTF-8',
      ...(onOutput === undefined ? [] : ['-bsp1']),
      '--',
      file,
      from,
      to,
    ],
    {
      ...(signal !== undefined && { signal }),
      ...(input !== undefined && { input }),
      ...(onOutput !== undefined && { onOutput }),
    },
  );
  return outcomeOf(run, file);
}

async function addedTo(
  sevenZip: SevenZip,
  file: string,
  folder: string,
  items: readonly string[],
  { password, signal, ...told }: UpdateOptions,
): Promise<Packing> {
  const onOutput = packOutput(told);
  const run = await sevenZip(
    [
      'a',
      '-y',
      ...(password === undefined ? [] : ['-p']),
      ...packNames,
      ...(onOutput === undefined ? [] : ['-bsp1']),
      '--',
      file,
      ...items,
    ],
    {
      cwd: folder,
      ...(signal !== undefined && { signal }),
      ...(password !== undefined && { input: `${password}\n${password}\n` }),
      ...(onOutput !== undefined && { onOutput }),
    },
  );
  return outcomeOf(run, file);
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
    pack: (plan, into, options) => packed(sevenZip, plan, into, options),
    remove: (file, paths, options) => removed(sevenZip, file, paths, options),
    rename: (file, from, to, options) =>
      renamedIn(sevenZip, file, from, to, options),
    add: (file, folder, items, options) =>
      addedTo(sevenZip, file, folder, items, options),
  };
}
