export type ReadSavedPath = () => readonly string[];

export function withFoldersSavedSince(
  env: NodeJS.ProcessEnv,
  before: readonly string[],
  now: readonly string[],
): NodeJS.ProcessEnv {
  const key =
    Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'Path';
  const current = (env[key] ?? '').split(';').filter(Boolean);
  const known = new Set([...current, ...before].map(sameFolder));
  const added: string[] = [];
  for (const folder of now) {
    if (!known.has(sameFolder(folder))) {
      known.add(sameFolder(folder));
      added.push(folder);
    }
  }
  return added.length === 0
    ? env
    : { ...env, [key]: [...current, ...added].join(';') };
}

function sameFolder(folder: string): string {
  return folder.replaceAll('"', '').replace(/\\+$/, '').toLowerCase();
}
