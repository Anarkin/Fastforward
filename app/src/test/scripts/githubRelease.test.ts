import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

type Gh = (args: readonly string[]) => string;

interface GithubRelease {
  readonly draftRelease: (gh: Gh, tag: string, built: string) => void;
  readonly uploadRelease: (
    gh: Gh,
    tag: string,
    built: string,
    files: readonly string[],
  ) => void;
  readonly publishRelease: (gh: Gh, tag: string, built: string) => void;
}

async function githubRelease(): Promise<GithubRelease> {
  const loaded: GithubRelease = await import(
    pathToFileURL(
      path.join(__dirname, '..', '..', '..', 'scripts', 'githubRelease.mts'),
    ).href
  );
  return loaded;
}

const built = 'a'.repeat(40);

function fakeGh(
  state: 'missing' | 'draft' | 'published' | 'unreachable',
  tagCommit: string = built,
) {
  const calls: string[][] = [];
  const gh: Gh = (args) => {
    calls.push([...args]);
    if (args[0] === 'api') {
      return `${tagCommit}\n`;
    }
    if (args[0] === 'release' && args[1] === 'view') {
      if (state === 'missing') {
        throw new Error(
          `Command failed: gh ${args.join(' ')}\nrelease not found\n`,
        );
      }
      if (state === 'unreachable') {
        throw new Error(
          `Command failed: gh ${args.join(' ')}\nHTTP 502: Bad Gateway (https://api.github.com/graphql)\n`,
        );
      }
      return state === 'draft' ? 'true\n' : 'false\n';
    }
    return '';
  };
  return { gh, calls };
}

const commitOf = ['api', 'repos/{owner}/{repo}/commits/v7.0.0', '--jq', '.sha'];

const publish = ['release', 'edit', 'v7.0.0', '--draft=false'];

const view = [
  'release',
  'view',
  'v7.0.0',
  '--json',
  'isDraft',
  '--jq',
  '.isDraft',
];

suite('GitHub release', () => {
  test('makes the draft release once, so the builds upload to it instead of each making one', async () => {
    const { draftRelease } = await githubRelease();
    const missing = fakeGh('missing');
    draftRelease(missing.gh, 'v7.0.0', built);
    assert.deepStrictEqual(missing.calls, [
      commitOf,
      view,
      [
        'release',
        'create',
        'v7.0.0',
        '--draft',
        '--verify-tag',
        '--title',
        '7.0.0',
      ],
    ]);
    const draft = fakeGh('draft');
    draftRelease(draft.gh, 'v7.0.0', built);
    assert.deepStrictEqual(draft.calls, [commitOf, view]);
  });

  test('makes, uploads to and publishes no release when GitHub cannot tell whether the release is there, failing with what it said, as the release may be there already and a second draft would be made', async () => {
    const { draftRelease, uploadRelease, publishRelease } =
      await githubRelease();
    const unreachable = fakeGh('unreachable');
    assert.throws(
      () => draftRelease(unreachable.gh, 'v7.0.0', built),
      /HTTP 502: Bad Gateway/,
    );
    assert.throws(
      () => uploadRelease(unreachable.gh, 'v7.0.0', built, ['a.exe']),
      /HTTP 502: Bad Gateway/,
    );
    assert.throws(
      () => publishRelease(unreachable.gh, 'v7.0.0', built),
      /HTTP 502: Bad Gateway/,
    );
    assert.deepStrictEqual(unreachable.calls, [
      commitOf,
      view,
      commitOf,
      view,
      commitOf,
      view,
    ]);
  });

  test('uploads the installers to the draft, again over those a run before uploaded', async () => {
    const { uploadRelease } = await githubRelease();
    const draft = fakeGh('draft');
    uploadRelease(draft.gh, 'v7.0.0', built, ['a.exe', 'latest.yml']);
    assert.deepStrictEqual(draft.calls, [
      commitOf,
      view,
      ['release', 'upload', 'v7.0.0', 'a.exe', 'latest.yml', '--clobber'],
    ]);
  });

  test('leaves a published release as it is when its run is started again, as uploading replaced the installers apps were already updating to', async () => {
    const { draftRelease, uploadRelease } = await githubRelease();
    const published = fakeGh('published');
    assert.throws(
      () => draftRelease(published.gh, 'v7.0.0', built),
      /v7\.0\.0 is already published/,
    );
    assert.throws(
      () => uploadRelease(published.gh, 'v7.0.0', built, ['a.exe']),
      /v7\.0\.0 is already published/,
    );
    assert.deepStrictEqual(published.calls, [commitOf, view, commitOf, view]);
  });

  test('uploads nothing without a draft release to upload to', async () => {
    const { uploadRelease } = await githubRelease();
    const missing = fakeGh('missing');
    assert.throws(
      () => uploadRelease(missing.gh, 'v7.0.0', built, ['a.exe']),
      /v7.0.0 has no draft release/,
    );
    assert.deepStrictEqual(missing.calls, [commitOf, view]);
  });

  test('publishes the draft once its installers are uploaded, so installed apps update to it', async () => {
    const { publishRelease } = await githubRelease();
    const draft = fakeGh('draft');
    publishRelease(draft.gh, 'v7.0.0', built);
    assert.deepStrictEqual(draft.calls, [commitOf, view, publish]);
  });

  test('leaves a release published already as it is, as publishing is what was asked for', async () => {
    const { publishRelease } = await githubRelease();
    const published = fakeGh('published');
    publishRelease(published.gh, 'v7.0.0', built);
    assert.deepStrictEqual(published.calls, [commitOf, view]);
  });

  test('publishes nothing without a draft release to publish', async () => {
    const { publishRelease } = await githubRelease();
    const missing = fakeGh('missing');
    assert.throws(
      () => publishRelease(missing.gh, 'v7.0.0', built),
      /v7\.0\.0 has no draft release to publish/,
    );
    assert.deepStrictEqual(missing.calls, [commitOf, view]);
  });

  test('leaves the draft as it is when the tag was moved to another commit since the run started, so an old run does not replace or publish the installers of a newer one', async () => {
    const { draftRelease, uploadRelease, publishRelease } =
      await githubRelease();
    const moved = fakeGh('draft', 'b'.repeat(40));
    assert.throws(
      () => draftRelease(moved.gh, 'v7.0.0', built),
      /v7\.0\.0 now points at another commit/,
    );
    assert.throws(
      () => uploadRelease(moved.gh, 'v7.0.0', built, ['a.exe']),
      /v7\.0\.0 now points at another commit/,
    );
    assert.throws(
      () => publishRelease(moved.gh, 'v7.0.0', built),
      /v7\.0\.0 now points at another commit/,
    );
    assert.deepStrictEqual(moved.calls, [commitOf, commitOf, commitOf]);
  });
});
