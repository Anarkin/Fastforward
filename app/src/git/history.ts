import { spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { isHashPrefix } from '../shared/hashes';
import type {
  CommitField,
  CommitInfo,
  CommitResults,
  CommitSearch,
  HashLookup,
} from '../shared/protocol';
import { gitConfigArgs, gitEnv, runGit, splitNul } from './run';

export async function headCommit(
  gitPath: string,
  cwd: string,
): Promise<string | undefined> {
  const output = await runGit(
    gitPath,
    cwd,
    ['rev-parse', '--verify', '--quiet', 'HEAD'],
    { okExitCodes: [0, 1] },
  );
  return output.trim() || undefined;
}

export async function commitsStartingWith(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<string[]> {
  if (!isHashPrefix(prefix)) {
    return [];
  }
  const objects = (
    await runGit(gitPath, cwd, [
      'rev-parse',
      `--disambiguate=${prefix.toLowerCase()}`,
    ])
  )
    .split('\n')
    .filter(Boolean);
  if (objects.length === 0) {
    return [];
  }
  const types = await runGit(
    gitPath,
    cwd,
    ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
    { input: `${objects.join('\n')}\n` },
  );
  return types
    .split('\n')
    .filter((line) => line.endsWith(' commit'))
    .map((line) => line.slice(0, line.indexOf(' ')));
}

async function commitsWithPrefix(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<string[]> {
  if (!isHashPrefix(prefix)) {
    return [];
  }
  const hex = prefix.toLowerCase();
  const output = await runGit(gitPath, cwd, ['cat-file', '--batch-check'], {
    input: `${hex}\n`,
  });
  const [hash, type] = output.trim().split(' ');
  if (type === 'missing') {
    return [];
  }
  const unique = type !== 'ambiguous' && hash.startsWith(hex);
  if (unique) {
    return type === 'commit' ? [hash] : [];
  }
  return commitsStartingWith(gitPath, cwd, hex);
}

const commitResultLimit = 20;

export async function findCommits(
  gitPath: string,
  cwd: string,
  prefix: string,
  limit = commitResultLimit,
): Promise<CommitResults> {
  const hashes = await commitsWithPrefix(gitPath, cwd, prefix);
  return {
    commits: await logCommits(gitPath, cwd, hashes.slice(0, limit)),
    more: Math.max(0, hashes.length - limit),
  };
}

export async function findCommit(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<HashLookup> {
  const hashes = await commitsWithPrefix(gitPath, cwd, prefix);
  if (hashes.length === 1) {
    const [commit] = await logCommits(gitPath, cwd, hashes);
    return { kind: 'found', hash: hashes[0], subject: commit?.subject ?? '' };
  }
  return hashes.length === 0
    ? { kind: 'none' }
    : { kind: 'ambiguous', count: hashes.length };
}

export interface HistoryEntry {
  readonly hash: string;
  readonly parents: readonly string[];
}

export async function listHistory(
  gitPath: string,
  cwd: string,
  solo = false,
): Promise<HistoryEntry[]> {
  const output = await runGit(gitPath, cwd, [
    'rev-list',
    '--date-order',
    '--parents',
    ...historyRefs(solo),
    '--',
  ]);
  return parseHistory(output);
}

function historyRefs(solo: boolean): string[] {
  return [
    '--ignore-missing',
    'HEAD',
    ...(solo ? [] : ['--branches', '--remotes', '--tags']),
  ];
}

const searchLimit = 50;

const recordStart = '\x1e';

interface SearchedCommit {
  readonly hash: string;
  readonly author: string;
  readonly committer: string;
  readonly message: string;
}

export function parseSearchedCommit(record: string): SearchedCommit {
  const [
    hash,
    authorName,
    authorEmail,
    committerName,
    committerEmail,
    message,
  ] = record.split('\0');
  return {
    hash,
    author: `${authorName} <${authorEmail}>`,
    committer: `${committerName} <${committerEmail}>`,
    message: message ?? '',
  };
}

export function matchedFields(
  commit: SearchedCommit,
  query: string,
): CommitField[] {
  const needle = query.toLowerCase();
  const fields: CommitField[] = [];
  if (commit.author.toLowerCase().includes(needle)) {
    fields.push('author');
  }
  if (commit.committer.toLowerCase().includes(needle)) {
    fields.push('committer');
  }
  if (commit.message.toLowerCase().includes(needle)) {
    fields.push('message');
  }
  return fields;
}

interface FoundHashes {
  readonly found: { readonly hash: string; readonly fields: CommitField[] }[];
  readonly capped: boolean;
}

export function messageGrep(query: string): string[] {
  return /^[\t\x20-\x7e]+$/.test(query)
    ? ['--regexp-ignore-case', '--fixed-strings', `--grep=${query}`]
    : [];
}

export class SearchMerge {
  private readonly found: FoundHashes['found'] = [];
  private readonly messages: SearchedCommit[] = [];
  private readonly idents: SearchedCommit[] = [];
  private identsEnded = false;
  private result: FoundHashes | undefined;

  constructor(
    private readonly query: string,
    private readonly limit: number,
    private messagesEnded: boolean,
  ) {}

  addMessage(record: string): FoundHashes | undefined {
    this.messages.push(parseSearchedCommit(record));
    return this.advance();
  }

  endMessages(): FoundHashes | undefined {
    this.messagesEnded = true;
    return this.advance();
  }

  addIdent(record: string): FoundHashes | undefined {
    this.idents.push(parseSearchedCommit(record));
    return this.advance();
  }

  endIdents(): FoundHashes | undefined {
    this.identsEnded = true;
    return this.advance();
  }

  private advance(): FoundHashes | undefined {
    while (this.result === undefined && this.idents.length > 0) {
      const [ident] = this.idents;
      let commit = ident;
      if (this.messages[0]?.hash === ident.hash) {
        commit = this.messages.shift() ?? ident;
      } else if (this.messages.length === 0 && !this.messagesEnded) {
        return undefined;
      }
      this.idents.shift();
      this.take(commit);
    }
    if (this.result === undefined && this.identsEnded) {
      this.result = { found: this.found, capped: false };
    }
    return this.result;
  }

  private take(commit: SearchedCommit): void {
    const fields = matchedFields(commit, this.query);
    if (fields.length === 0) {
      return;
    }
    if (this.found.length === this.limit) {
      this.result = { found: this.found, capped: true };
      return;
    }
    this.found.push({ hash: commit.hash, fields });
  }
}

function streamRecords(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  signal: AbortSignal | undefined,
  onRecord: (record: string) => void,
  onEnd: () => void,
  onError: (error: Error) => void,
): ChildProcess {
  const child = spawn(gitPath, [...gitConfigArgs, 'log', ...args, '--'], {
    cwd,
    env: gitEnv(),
    windowsHide: true,
    signal,
  });
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    pending += decoder.write(chunk);
    let end = pending.indexOf(recordStart, 1);
    while (end !== -1) {
      onRecord(pending.slice(1, end));
      pending = pending.slice(end);
      end = pending.indexOf(recordStart, 1);
    }
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  child.on('error', onError);
  child.on('close', (code) => {
    if (code !== 0) {
      onError(new Error(`git log failed: ${stderr}`));
      return;
    }
    pending += decoder.end();
    if (pending.length > 1) {
      onRecord(pending.slice(1));
    }
    onEnd();
  });
  return child;
}

const identFormat = `--format=${recordStart}%H%x00%aN%x00%aE%x00%cN%x00%cE`;

function streamMatches(
  gitPath: string,
  cwd: string,
  query: string,
  solo: boolean,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<FoundHashes> {
  const grep = messageGrep(query);
  const merge = new SearchMerge(query, limit, grep.length === 0);
  return new Promise((resolve, reject) => {
    const children: ChildProcess[] = [];
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      for (const child of children) {
        child.kill();
      }
      settle();
    };
    const step = (next: () => FoundHashes | undefined) => {
      if (settled) {
        return;
      }
      const result = next();
      if (result !== undefined) {
        finish(() => resolve(result));
      }
    };
    const stream = (
      args: readonly string[],
      onRecord: (record: string) => FoundHashes | undefined,
      onEnd: () => FoundHashes | undefined,
    ) => {
      children.push(
        streamRecords(
          gitPath,
          cwd,
          [...historyRefs(solo), ...args],
          signal,
          (record) => step(() => onRecord(record)),
          () => step(onEnd),
          (error) => finish(() => reject(error)),
        ),
      );
    };
    const fullFormat = `${identFormat}%x00%B`;
    if (grep.length > 0) {
      stream(
        [...grep, fullFormat],
        (record) => merge.addMessage(record),
        () => merge.endMessages(),
      );
    }
    stream(
      [grep.length > 0 ? identFormat : fullFormat],
      (record) => merge.addIdent(record),
      () => merge.endIdents(),
    );
  });
}

export async function searchCommits(
  gitPath: string,
  cwd: string,
  query: string,
  solo: boolean,
  signal?: AbortSignal,
  limit = searchLimit,
): Promise<CommitSearch> {
  const { found, capped } = await streamMatches(
    gitPath,
    cwd,
    query,
    solo,
    limit,
    signal,
  );
  const commits = await logCommits(
    gitPath,
    cwd,
    found.map(({ hash }) => hash),
  );
  const fieldsOf = new Map(found.map(({ hash, fields }) => [hash, fields]));
  return {
    commits: commits.map((commit) => ({
      commit,
      fields: fieldsOf.get(commit.hash) ?? [],
    })),
    capped,
  };
}

export function parseHistory(output: string): HistoryEntry[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...parents] = line.split(' ');
      return { hash, parents };
    });
}

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
    const [hash, authorName, commitTime, body = ''] = tokens.slice(i, i + 4);
    i += 4;
    const message = body.replaceAll('\r\n', '\n').trimEnd();
    commits.push({
      hash: hash.slice(1),
      subject: message.split('\n', 1)[0],
      authorName,
      commitDate: Number(commitTime) * 1000,
    });
  }
  return commits;
}
