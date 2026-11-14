import childProcess from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

export type Program = 'the installed git' | '7-Zip' | 'a shell' | 'Electron';

export const programsOfSuffixes: Readonly<Record<string, Program>> = {
  git: 'the installed git',
  '7zip': '7-Zip',
  shells: 'a shell',
  electron: 'Electron',
  perf: 'Electron',
};

const programsOfNames: Readonly<Record<string, Program>> = {
  git: 'the installed git',
  '7z': '7-Zip',
  '7zz': '7-Zip',
  sh: 'a shell',
  bash: 'a shell',
  zsh: 'a shell',
  fish: 'a shell',
  pwsh: 'a shell',
  powershell: 'a shell',
  electron: 'Electron',
};

function isFake(command: string): boolean {
  const relative = path.relative(os.tmpdir(), command);
  return (
    path.isAbsolute(command) &&
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

export function realProgramOf(
  command: unknown,
  inShell = false,
): Program | undefined {
  if (typeof command !== 'string') {
    return undefined;
  }
  const quoted = /^\s*"([^"]*)"/.exec(command)?.[1];
  const file =
    quoted ?? (inShell ? (command.trim().split(/\s+/)[0] ?? '') : command);
  const name = path
    .basename(file)
    .toLowerCase()
    .replace(/\.exe$/, '');
  return Object.hasOwn(programsOfNames, name) && !isFake(file)
    ? programsOfNames[name]
    : undefined;
}

export function suffixOf(file: string): string | undefined {
  return /\.([^./\\]+)\.test\.tsx?$/.exec(file)?.[1];
}

export function programExpectedOf(file: string): Program | 'none' | 'any' {
  if (/[/\\]src[/\\]test[/\\]build[/\\]/.test(file)) {
    return 'any';
  }
  const suffix = suffixOf(file);
  return suffix === undefined ? 'none' : (programsOfSuffixes[suffix] ?? 'none');
}

const namedFor = Object.entries(programsOfSuffixes)
  .map(([suffix, program]) => `*.${suffix}.test.ts for ${program}`)
  .join(', ');

const starters = [
  ['spawn', false],
  ['spawnSync', false],
  ['execFile', false],
  ['execFileSync', false],
  ['exec', true],
  ['execSync', true],
] as const;

function noting(
  start: unknown,
  inShell: boolean,
  note: (program: Program) => void,
): unknown {
  if (typeof start !== 'function') {
    return start;
  }
  const noted = (...args: unknown[]): unknown => {
    const program = realProgramOf(args[0], inShell);
    if (program !== undefined) {
      note(program);
    }
    return Reflect.apply(start, undefined, args);
  };
  const custom: unknown = Reflect.get(start, promisify.custom);
  if (custom !== undefined) {
    Reflect.set(noted, promisify.custom, noting(custom, inShell, note));
  }
  return noted;
}

export class ProgramsStarted {
  private readonly started = new Set<Program>();
  private readonly expected: Program | 'none' | 'any';
  private testsRun = 0;

  constructor(private readonly file: string) {
    this.expected = programExpectedOf(file);
    const note = (program: Program): void => {
      this.started.add(program);
    };
    for (const [name, inShell] of starters) {
      Reflect.set(
        childProcess,
        name,
        noting(Reflect.get(childProcess, name), inShell, note),
      );
    }
    syncBuiltinESMExports();
    if (this.expected === 'a shell') {
      const pty: unknown = createRequire(__filename)('node-pty');
      Reflect.set(
        Object(pty),
        'spawn',
        noting(Reflect.get(Object(pty), 'spawn'), false, note),
      );
    }
  }

  testEnded(): void {
    this.testsRun += 1;
    if (this.expected === 'none') {
      this.assertNoneStarted();
    }
  }

  fileEnded(): void {
    if (this.expected === 'none') {
      this.assertNoneStarted();
      return;
    }
    if (
      this.expected !== 'any' &&
      this.testsRun > 0 &&
      !this.started.has(this.expected)
    ) {
      throw new Error(
        `This *.${suffixOf(this.file) ?? ''}.test.ts file never started ${this.expected}, so it runs apart from verify:fast for nothing: name it for the program it starts, ${namedFor}, or *.test.ts when it starts none`,
      );
    }
  }

  private assertNoneStarted(): void {
    const programs = [...this.started];
    this.started.clear();
    if (programs.length > 0) {
      throw new Error(
        `This test, or a hook before it, started ${programs.join(' and ')}, which a unit test fakes: name its file for the program it starts, ${namedFor}, or start a fake instead`,
      );
    }
  }
}
