import type { CommitInfo } from '../shared/protocol';
import { runGit, splitNul } from './run';

export async function logCommits(
  gitPath: string,
  cwd: string,
  hashes: readonly string[],
): Promise<CommitInfo[]> {
  if (hashes.length === 0) {
    return [];
  }
  const output = await runGit(
    gitPath,
    cwd,
    [
      'log',
      '--stdin',
      '--no-walk=unsorted',
      '-z',
      '--format=%x1e%H%x00%aN%x00%ct%x00%B',
      '--',
    ],
    { input: `${hashes.join('\n')}\n` },
  );
  return parseLog(output);
}

export function parseLog(output: string): CommitInfo[] {
  const tokens = splitNul(output);
  const commits: CommitInfo[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!tokens[i].startsWith('\x1e')) {
      i++;
      continue;
    }
    const [hash, authorName, commitTime, message = ''] = tokens.slice(i, i + 4);
    i += 4;
    const [subject, ...rest] = message
      .replaceAll('\r\n', '\n')
      .trimEnd()
      .split('\n');
    commits.push({
      hash: hash.slice(1),
      subject,
      body: rest.join('\n').replace(/^(?:[ \t]*\n)+/, ''),
      authorName,
      commitDate: Number(commitTime) * 1000,
    });
  }
  return commits;
}
