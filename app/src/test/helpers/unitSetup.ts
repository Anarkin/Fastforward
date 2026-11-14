import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach } from 'vitest';

const realPrograms: Readonly<Record<string, string>> = {
  git: 'git',
  '7z': '7-Zip',
  '7zz': '7-Zip',
};

function isFake(command: string): boolean {
  const relative = path.relative(os.tmpdir(), path.resolve(command));
  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    path.isAbsolute(command)
  );
}

export function realProgramOf(
  command: unknown,
  inShell = false,
): string | undefined {
  if (typeof command !== 'string') {
    return undefined;
  }
  const file = inShell
    ? (command.trim().split(/\s+/)[0] ?? '').replaceAll('"', '')
    : command;
  const name = path
    .basename(file)
    .toLowerCase()
    .replace(/\.exe$/, '');
  return Object.hasOwn(realPrograms, name) && !isFake(file)
    ? realPrograms[name]
    : undefined;
}

const started: string[] = [];
const starters = [
  ['spawn', false],
  ['spawnSync', false],
  ['execFile', false],
  ['execFileSync', false],
  ['exec', true],
  ['execSync', true],
] as const;

function noting(start: unknown, inShell: boolean): unknown {
  if (typeof start !== 'function') {
    return start;
  }
  const noted = (...args: unknown[]): unknown => {
    const program = realProgramOf(args[0], inShell);
    if (program !== undefined) {
      started.push(program);
    }
    return Reflect.apply(start, undefined, args);
  };
  const custom: unknown = Reflect.get(start, promisify.custom);
  if (custom !== undefined) {
    Reflect.set(noted, promisify.custom, noting(custom, inShell));
  }
  return noted;
}

for (const [name, inShell] of starters) {
  Reflect.set(
    childProcess,
    name,
    noting(Reflect.get(childProcess, name), inShell),
  );
}
syncBuiltinESMExports();

function assertNoRealPrograms(): void {
  const programs = [...new Set(started.splice(0))];
  if (programs.length > 0) {
    throw new Error(
      `This test started the installed ${programs.join(' and ')}, which the unit tests fake: name its file *.git.test.ts when it needs git, *.7zip.test.ts when it needs 7-Zip, or start a fake instead`,
    );
  }
}

afterEach(assertNoRealPrograms);
afterAll(assertNoRealPrograms);
