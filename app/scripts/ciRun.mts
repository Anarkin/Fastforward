export interface Run {
  readonly databaseId: number;
  readonly status: string;
  readonly conclusion: string;
  readonly url: string;
}

export type Gh = (...args: string[]) => Promise<string>;

export async function runOfPush(
  gh: Gh,
  commit: string,
): Promise<Run | undefined> {
  const runs: readonly Run[] = JSON.parse(
    await gh(
      'run',
      'list',
      '--commit',
      commit,
      '--workflow',
      'ci.yml',
      '--event',
      'push',
      '--branch',
      'main',
      '--limit',
      '1',
      '--json',
      'databaseId,status,conclusion,url',
    ),
  );
  return runs[0];
}
