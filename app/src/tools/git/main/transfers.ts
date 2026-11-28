import { strings } from '../../../lib/shared/strings';
import { runGit } from './run';
import { splitNul } from './splitNul';

export const remoteTimeout = 5 * 60_000;

const neverAsk = {
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS_REQUIRE: 'never',
};

const messagesInEnglish = { LANGUAGE: 'C' };

const unchangedRef = new Set(['=', '!']);

const remoteBranches = 'refs/remotes/';

async function remotesSafeToPrune(
  gitPath: string,
  root: string,
  signal: AbortSignal,
): Promise<string[]> {
  const output = await runGit(
    gitPath,
    root,
    [
      'config',
      '-z',
      '--get-regexp',
      '^(fetch\\.prune|remote\\..+\\.(prune|fetch))$',
    ],
    { okExitCodes: [0, 1], signal },
  );
  const written = new Map<string, string[]>();
  const settled = new Set<string>();
  for (const entry of splitNul(output).filter(Boolean)) {
    const end = entry.indexOf('\n');
    const key = end === -1 ? entry : entry.slice(0, end);
    if (key === 'fetch.prune') {
      return [];
    }
    const remote = key.slice('remote.'.length, key.lastIndexOf('.'));
    const refspec = end === -1 ? '' : entry.slice(end + 1);
    if (key.endsWith('.prune')) {
      settled.add(remote);
    } else if (!refspec.startsWith('^')) {
      written.set(remote, [
        ...(written.get(remote) ?? []),
        refspec.replace(/^\+/, '').split(':')[1] ?? '',
      ]);
    }
  }
  return [...written]
    .filter(
      ([remote, refs]) =>
        !settled.has(remote) &&
        refs.every((ref) => ref.startsWith(remoteBranches)),
    )
    .map(([remote]) => remote);
}

const notFetched =
  /^(?:error: )?could not fetch (?:'(.+)' \(exit code: -?\d+\)|(.+))$/gm;

export function remotesNotFetched(said: string): string[] {
  return [...said.matchAll(notFetched)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
}

interface FetchOptions {
  readonly timeout?: number;
  readonly interactive?: boolean;
  readonly stop?: AbortSignal;
}

export function fetchAllRemotes(
  gitPath: string,
  root: string,
  options: FetchOptions = {},
): Promise<boolean> {
  return fetchWith(gitPath, root, ['--all', '--porcelain'], options);
}

export function fetchRemote(
  gitPath: string,
  root: string,
  remote: string,
  options: FetchOptions = {},
): Promise<boolean> {
  return fetchWith(
    gitPath,
    root,
    ['--porcelain', '--end-of-options', remote],
    options,
  );
}

async function fetchWith(
  gitPath: string,
  root: string,
  fetching: readonly string[],
  {
    timeout = remoteTimeout,
    interactive = true,
    stop = new AbortController().signal,
  }: FetchOptions,
): Promise<boolean> {
  const quiet = quietFor(timeout);
  const signal = AbortSignal.any([quiet.stalled, stop]);
  try {
    const pruning = (await remotesSafeToPrune(gitPath, root, signal)).flatMap(
      (remote) => [
        '-c',
        `remote.${remote}.prune=true`,
        '-c',
        `remote.${remote}.pruneTags=false`,
      ],
    );
    const output = await runGit(
      gitPath,
      root,
      [
        ...pruning,
        'fetch',
        '--progress',
        '--no-auto-maintenance',
        ...(interactive ? [] : ['--no-write-fetch-head']),
        ...fetching,
      ],
      {
        signal,
        env: interactive
          ? messagesInEnglish
          : { ...neverAsk, ...messagesInEnglish },
        runsUserCode: true,
        writesRefs: true,
        onActivity: quiet.heard,
        progress: true,
      },
    );
    return output
      .split('\n')
      .some((line) => line !== '' && !unchangedRef.has(line[0]));
  } catch (error) {
    if (quiet.stalled.aborted) {
      throw new Error(strings.errors.fetchStalled(Math.round(timeout / 1000)), {
        cause: error,
      });
    }
    throw error;
  } finally {
    quiet.end();
  }
}

export function quietFor(timeout: number): {
  readonly stalled: AbortSignal;
  readonly heard: () => void;
  readonly end: () => void;
} {
  const stalling = new AbortController();
  const timer = setTimeout(() => stalling.abort(), timeout);
  return {
    stalled: stalling.signal,
    heard: () => {
      timer.refresh();
    },
    end: () => clearTimeout(timer),
  };
}

export async function listRemoteTags(
  gitPath: string,
  root: string,
  remote: string,
  {
    interactive = true,
    timeout = remoteTimeout,
    stop = new AbortController().signal,
  } = {},
): Promise<Map<string, string>> {
  const output = await runGit(
    gitPath,
    root,
    ['ls-remote', '--tags', '--end-of-options', remote],
    {
      signal: AbortSignal.any([AbortSignal.timeout(timeout), stop]),
      env: interactive ? {} : neverAsk,
      runsUserCode: true,
    },
  );
  const tags = new Map<string, string>();
  for (const line of output.split('\n')) {
    const [commit, ref] = line.split('\t');
    if (!commit || !ref?.startsWith('refs/tags/')) {
      continue;
    }
    const name = ref.slice('refs/tags/'.length);
    if (name.endsWith('^{}')) {
      tags.set(name.slice(0, -'^{}'.length), commit);
    } else if (!tags.has(name)) {
      tags.set(name, commit);
    }
  }
  return tags;
}

export async function pushRef(
  gitPath: string,
  root: string,
  remote: string,
  localRef: string,
  remoteRef: string,
  {
    publish = false,
    timeout = remoteTimeout,
    stop = new AbortController().signal,
  } = {},
): Promise<void> {
  const quiet = quietFor(timeout);
  try {
    await runGit(
      gitPath,
      root,
      [
        'push',
        '--progress',
        ...(publish ? ['--set-upstream'] : []),
        '--end-of-options',
        remote,
        `${localRef}:${remoteRef}`,
      ],
      {
        signal: AbortSignal.any([quiet.stalled, stop]),
        runsUserCode: true,
        writesRefs: true,
        onActivity: quiet.heard,
        progress: true,
      },
    );
  } catch (error) {
    if (quiet.stalled.aborted) {
      throw new Error(strings.errors.pushStalled(Math.round(timeout / 1000)), {
        cause: error,
      });
    }
    throw error;
  } finally {
    quiet.end();
  }
}
