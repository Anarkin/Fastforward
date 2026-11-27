import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const types =
  'fix feat refactor test perf docs style chore ci build revert'.split(' ');

const header = new RegExp(
  String.raw`^(${types.join('|')})(\([a-z0-9]+(-[a-z0-9]+)*\))?!?: \S`,
);
const bullet = /^- \S/;
const trailer = /^\w[\w-]*(: | #)/;

export const cleanedUp = (raw: string): string =>
  raw
    .replace(/^# -+ >8 -+[\s\S]*/m, '')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');

function problemOf(line: string): string | undefined {
  if (line === '') return 'a blank line in the body';
  if (trailer.test(line)) return 'a footer or trailer';
  if (!bullet.test(line)) return 'not a bullet, - <bullet> on one line';
  return undefined;
}

export function problemsOf(message: string): string[] {
  const [first = '', second, ...body] = message.trimEnd().split('\n');
  const length = [...new Intl.Segmenter().segment(first)].length;
  return [
    header.test(first)
      ? undefined
      : `line 1: not <type>[(<scope>)][!]: <description>, of the types ${types.join(', ')}`,
    length > 72 ? `line 1: ${length} characters, at most 72` : undefined,
    second === undefined || second === '' ? undefined : 'line 2: not blank',
    ...body.map((line, at) => {
      const problem = problemOf(line);
      return problem && `line ${at + 3}: ${problem}`;
    }),
  ].filter((problem) => problem !== undefined);
}

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' });

export function refusalOfCommits(range: string): string | undefined {
  const broken = git('rev-list', '--reverse', '--abbrev-commit', range)
    .split('\n')
    .filter(Boolean)
    .flatMap((commit) => {
      const message = git('log', '-1', '--format=%B', commit);
      const problems = problemsOf(message);
      return problems.length === 0
        ? []
        : [
            `  ${commit} ${message.split('\n')[0]}`,
            ...problems.map((problem) => `    ${problem}`),
          ];
    });
  return broken.length === 0
    ? undefined
    : [
        'These commits break the rules of CONTRIBUTING.md for a commit message:',
        ...broken,
      ].join('\n');
}

function refusalOfMessage(file: string): string | undefined {
  const problems = problemsOf(cleanedUp(readFileSync(file, 'utf8')));
  return problems.length === 0
    ? undefined
    : [
        'The commit message breaks the rules of CONTRIBUTING.md:',
        ...problems.map((problem) => `  ${problem}`),
        `It is kept; edit it with git commit -e -F ${file}`,
      ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file = '', range = ''] = process.argv.slice(2);
  const refusal =
    file === '--commits' ? refusalOfCommits(range) : refusalOfMessage(file);
  if (refusal !== undefined) {
    console.error(refusal);
    process.exit(1);
  }
}
