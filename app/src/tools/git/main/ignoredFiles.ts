import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import { isInside } from './insideFolder';
import { runGit } from './run';
import { splitNul } from './splitNul';

export type Ignored = (
  repo: string,
  paths: readonly string[],
) => Promise<readonly string[]>;

export async function ignoredPaths(
  gitPath: string,
  repo: string,
  paths: readonly string[],
): Promise<string[]> {
  const relative = paths.map((file) => {
    const inRepo = path.relative(repo, file).split(path.sep).join('/');
    return inRepo.startsWith(':') ? `./${inRepo}` : inRepo;
  });
  const output = await runGit(
    gitPath,
    repo,
    ['check-ignore', '-z', '--stdin'],
    {
      input: relative.map((file) => `${file}\0`).join(''),
      okExitCodes: [0, 1],
      pathspecMagic: true,
    },
  );
  const ignored = new Set(splitNul(output).filter(Boolean));
  return paths.filter((_file, index) => ignored.has(relative[index]));
}

const maxKnownNotIgnored = 10_000;

export class NotIgnored {
  private readonly known = new Set<string>();
  private generation = 0;

  forget(): void {
    this.known.clear();
    this.generation++;
  }

  async any(
    ignored: Ignored,
    root: string,
    files: readonly string[],
    renamed: ReadonlySet<string>,
  ): Promise<boolean> {
    if (files.length === 0) {
      return false;
    }
    if (files.some((file) => this.known.has(file))) {
      return true;
    }
    const { generation } = this;
    let found: ReadonlySet<string>;
    try {
      found = new Set(await ignoredInRepositories(ignored, root, files));
    } catch {
      return true;
    }
    const kept = files.filter((file) => !found.has(file));
    const stats = await Promise.all(
      kept.map((file) => fs.promises.lstat(file).catch(() => undefined)),
    );
    const existingFiles = kept.filter(
      (_file, index) => stats[index]?.isDirectory() === false,
    );
    if (generation === this.generation) {
      if (this.known.size + existingFiles.length > maxKnownNotIgnored) {
        this.known.clear();
      }
      for (const file of existingFiles) {
        this.known.add(file);
      }
    }
    const changedItself = (file: string, index: number) =>
      renamed.has(file) || stats[index]?.isDirectory() !== true;
    return kept.some(changedItself);
  }
}

async function ignoredInRepositories(
  ignored: Ignored,
  root: string,
  files: readonly string[],
): Promise<string[]> {
  const holding = new Map<string, Promise<string>>();
  const repoHolding = (folder: string): Promise<string> => {
    if (folder === root || !isInside(root, folder)) {
      return Promise.resolve(root);
    }
    let repo = holding.get(folder);
    if (repo === undefined) {
      repo = fs.promises.lstat(path.join(folder, '.git')).then(
        () => folder,
        () => repoHolding(path.dirname(folder)),
      );
      holding.set(folder, repo);
    }
    return repo;
  };
  const repoOf = new Map<string, string>();
  let level = files;
  while (level.length > 0) {
    const repos = await Promise.all(
      level.map((file) => repoHolding(path.dirname(file))),
    );
    for (const [index, file] of level.entries()) {
      repoOf.set(file, repos[index]);
    }
    level = [...new Set(repos)].filter(
      (repo) => repo !== root && !repoOf.has(repo),
    );
  }
  const byRepo = Map.groupBy(repoOf, ([, repo]) => repo);
  const found = new Set(
    (
      await Promise.all(
        [...byRepo].map(([repo, inRepo]) =>
          ignored(
            repo,
            inRepo.map(([file]) => file),
          ),
        ),
      )
    ).flat(),
  );
  const isIgnored = (file: string): boolean => {
    const repo = repoOf.get(file) ?? root;
    return found.has(file) || (repo !== root && isIgnored(repo));
  };
  return files.filter(isIgnored);
}
