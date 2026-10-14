import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function githubCli(args) {
  return execFileSync(
    'gh',
    [...args, '--repo', process.env.GITHUB_REPOSITORY],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function stateOf(gh, tag) {
  let isDraft;
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
  } catch {
    return 'missing';
  }
  return isDraft.trim() === 'true' ? 'draft' : 'published';
}

function refusePublished(tag) {
  throw new Error(
    `${tag} is already published, so its installers are left as they are.`,
  );
}

export function draftRelease(gh, tag) {
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

export function uploadRelease(gh, tag, files) {
  const state = stateOf(gh, tag);
  if (state === 'published') {
    refusePublished(tag);
  }
  if (state === 'missing') {
    throw new Error(`${tag} has no draft release to upload the installers to.`);
  }
  gh(['release', 'upload', tag, ...files, '--clobber']);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [step, tag, ...files] = process.argv.slice(2);
  try {
    if (step === 'draft') {
      draftRelease(githubCli, tag);
    } else {
      uploadRelease(githubCli, tag, files);
    }
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
