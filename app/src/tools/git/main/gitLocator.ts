import { strings } from '../../../lib/shared/strings';
import { plainOf, type Sentence } from '../../../lib/shared/sentences';
import { minimumGitVersion, type GitSearch } from './locate';

export type FoundGit = Extract<GitSearch, { readonly kind: 'found' }>;

type NoGit = Exclude<GitSearch, { readonly kind: 'found' }>;

export function needsGit(git: NoGit): Sentence {
  const needed = minimumGitVersion.join('.');
  return strings.app.needsGit(
    git.kind === 'missing'
      ? strings.app.installGit(needed)
      : strings.app.gitTooOld(git.version, git.path, needed),
  );
}

export class GitLocator {
  private searching: Promise<GitSearch> | undefined;
  private readonly waiting: ((git: FoundGit) => void)[] = [];

  constructor(
    private known: GitSearch,
    private readonly search: () => Promise<GitSearch>,
  ) {}

  get git(): GitSearch {
    return this.known;
  }

  get path(): string | undefined {
    return this.known.kind === 'found' ? this.known.path : undefined;
  }

  pathToRun(): string {
    if (this.known.kind !== 'found') {
      throw new Error(plainOf(needsGit(this.known)));
    }
    return this.known.path;
  }

  located(): Promise<GitSearch> {
    if (this.known.kind === 'found') {
      return Promise.resolve(this.known);
    }
    this.searching ??= this.search()
      .catch((): GitSearch => ({ kind: 'missing' }))
      .then((git) => {
        this.searching = undefined;
        this.known = git;
        if (git.kind === 'found') {
          for (const found of this.waiting.splice(0)) {
            found(git);
          }
        }
        return git;
      });
    return this.searching;
  }

  whenFound(found: (git: FoundGit) => void): void {
    this.waiting.push(found);
  }
}
