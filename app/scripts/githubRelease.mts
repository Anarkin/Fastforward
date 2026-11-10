import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Gh = (args: readonly string[]) => string;

function githubCli(args: readonly string[]): string {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY names no repository to release in.');
  }
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_REPO: repository },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function refuseMoved(gh: Gh, tag: string, built: string) {
  const commit = gh([
    'api',
    `repos/{owner}/{repo}/commits/${tag}`,
    '--jq',
    '.sha',
  ]).trim();
  if (commit !== built) {
    throw new Error(
      `${tag} now points at another commit than the one this run built, so its installers are left as they are.`,
    );
  }
}

function stateOf(gh: Gh, tag: string) {
  let isDraft: string;
  try {
    isDraft = gh([
      'release',
      'view',
      tag,
      '--json',
      'isDraft',
      '--jq',
      '.isDraft',
    ]);
  } catch (error) {
    if (error instanceof Error && /release not found/.test(error.message)) {
      return 'missing';
    }
    throw error;
  }
  return isDraft.trim() === 'true' ? 'draft' : 'published';
}

function refusePublished(tag: string): never {
  throw new Error(
    `${tag} is already published, so its installers are left as they are.`,
  );
}

export function draftRelease(gh: Gh, tag: string, built: string) {
  refuseMoved(gh, tag, built);
  const state = stateOf(gh, tag);
  if (state === 'published') {
    refusePublished(tag);
  }
  if (state === 'missing') {
    gh([
      'release',
      'create',
      tag,
      '--draft',
      '--verify-tag',
      '--title',
      tag.replace(/^v/, ''),
    ]);
  }
}

export function uploadRelease(
  gh: Gh,
  tag: string,
  built: string,
  files: readonly string[],
) {
  refuseMoved(gh, tag, built);
  const state = stateOf(gh, tag);
  if (state === 'published') {
    refusePublished(tag);
  }
  if (state === 'missing') {
    throw new Error(`${tag} has no draft release to upload the installers to.`);
  }
  gh(['release', 'upload', tag, ...files, '--clobber']);
}

export function publishRelease(gh: Gh, tag: string, built: string) {
  refuseMoved(gh, tag, built);
  const state = stateOf(gh, tag);
  if (state === 'missing') {
    throw new Error(`${tag} has no draft release to publish.`);
  }
  if (state === 'draft') {
    gh(['release', 'edit', tag, '--draft=false']);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [step, tag, ...files] = process.argv.slice(2);
  try {
    const built = process.env.GITHUB_SHA;
    if (!built) {
      throw new Error('GITHUB_SHA names no commit this run built.');
    }
    if (step === 'draft') {
      draftRelease(githubCli, tag, built);
    } else if (step === 'upload') {
      uploadRelease(githubCli, tag, built, files);
    } else if (step === 'publish') {
      publishRelease(githubCli, tag, built);
    } else {
      throw new Error(
        `${step} is no step of a release, which are draft, upload and publish.`,
      );
    }
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
