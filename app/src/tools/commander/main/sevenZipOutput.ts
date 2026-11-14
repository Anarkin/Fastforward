import { strings } from '../../../lib/shared/strings';
import type {
  ArchiveRefusal,
  ExtractProgress,
  PackOptions,
  Packing,
} from './archiveReader';
import type { SevenZipRun } from './sevenZip';

const noArchiveSeen = 'Cannot open the file as archive';
const wrongPassword = /Wrong password/i;
const errorPattern = /^(?:Open |System )?(?:ERROR|Error):(?: (.+))?$/;

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

export function refusalOf(run: SevenZipRun, file: string): ArchiveRefusal {
  const reason = reasonOf(run, file);
  return {
    reason,
    ...(reason === noArchiveSeen && { noArchive: true }),
    ...(wrongPassword.test(reason) && { needsPassword: true }),
  };
}

const progressPattern = /^(\d+)%(?:\s+(\d+))?(?:\s+\S\s+(.+))?$/;

const progressBreak = /[\r\n\b]+/;

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

export function progressed(
  onProgress: (progress: ExtractProgress) => void,
): (text: string) => void {
  let left = '';
  return (text) => {
    const pieces = `${left}${text}`.split(progressBreak);
    left = pieces.pop() ?? '';
    const last = pieces
      .map(progressOf)
      .findLast((progress) => progress !== undefined);
    if (last !== undefined) {
      onProgress(last);
    }
  };
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

export function warningOf(run: SevenZipRun, file: string): string {
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
export const keptPattern =
  /^Keep old data in archive: (?:\d+ folders?, )?(\d+) files?, (\d+) bytes/;

export function packOutput(
  { onProgress, onTotals }: PackOptions,
  totalsPattern: RegExp = addedPattern,
): ((text: string) => void) | undefined {
  if (onProgress === undefined && onTotals === undefined) {
    return undefined;
  }
  let left = '';
  return (text) => {
    const pieces = `${left}${text}`.split(progressBreak);
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

export function outcomeOf(run: SevenZipRun, file: string): Packing {
  if (run.code === 0) {
    return { kind: 'packed' };
  }
  return run.code === 1
    ? { kind: 'packed', warning: warningOf(run, file) }
    : { kind: 'refused', ...refusalOf(run, file) };
}
