import { findGit, type GitSearch } from '../tools/git/main/locate';
import { GitLocator } from '../tools/git/main/gitLocator';
import { withFoldersSavedSince, type ReadSavedPath } from './savedPath';
import { withLoginShellEnv } from './shellPath';

export async function gitLocator(): Promise<GitLocator> {
  await withLoginShellEnv(process.platform, process.env);
  const searchAgain = searchingAgain(
    process.env,
    await savedPathReader(process.platform),
  );
  return new GitLocator(await findGit(), searchAgain);
}

export function searchingAgain(
  env: NodeJS.ProcessEnv,
  readSaved: ReadSavedPath,
  find: (env: NodeJS.ProcessEnv) => Promise<GitSearch> = findGit,
): () => Promise<GitSearch> {
  const atStart = readSaved();
  return () => find(withFoldersSavedSince(env, atStart, readSaved()));
}

async function savedPathReader(
  platform: NodeJS.Platform,
): Promise<ReadSavedPath> {
  if (platform !== 'win32') {
    return () => [];
  }
  try {
    const { windowsSavedPath } = await import('./windowsSavedPath.js');
    const read = windowsSavedPath();
    return () => {
      try {
        return read();
      } catch {
        return [];
      }
    };
  } catch {
    return () => [];
  }
}
