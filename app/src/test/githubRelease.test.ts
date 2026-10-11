import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

type Gh = (args: readonly string[]) => string;

interface GithubRelease {
  readonly draftRelease: (gh: Gh, tag: string) => void;
  readonly uploadRelease: (
    gh: Gh,
    tag: string,
    files: readonly string[],
  ) => void;
}

async function githubRelease(): Promise<GithubRelease> {
  const loaded: GithubRelease = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'githubRelease.mjs')).href
  );
  return loaded;
}

function fakeGh(state: 'missing' | 'draft' | 'published') {
  const calls: string[][] = [];
  const gh: Gh = (args) => {
    calls.push([...args]);
    if (args[0] === 'release' && args[1] === 'view') {
      if (state === 'missing') {
        throw new Error('release not found');
      }
      return state === 'draft' ? 'true\n' : 'false\n';
    }
    return '';
  };
  return { gh, calls };
}

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
    draftRelease(missing.gh, 'v7.0.0');
    assert.deepStrictEqual(missing.calls, [
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
    draftRelease(draft.gh, 'v7.0.0');
    assert.deepStrictEqual(draft.calls, [view]);
  });

  test('uploads the installers to the draft, again over those a run before uploaded', async () => {
    const { uploadRelease } = await githubRelease();
    const draft = fakeGh('draft');
    uploadRelease(draft.gh, 'v7.0.0', ['a.exe', 'latest.yml']);
    assert.deepStrictEqual(draft.calls, [
      view,
      ['release', 'upload', 'v7.0.0', 'a.exe', 'latest.yml', '--clobber'],
    ]);
  });

  test('leaves a published release as it is when its run is started again, as uploading replaced the installers apps were already updating to', async () => {
    const { draftRelease, uploadRelease } = await githubRelease();
    const published = fakeGh('published');
    assert.throws(
      () => draftRelease(published.gh, 'v7.0.0'),
      /v7\.0\.0 is already published/,
    );
    assert.throws(
      () => uploadRelease(published.gh, 'v7.0.0', ['a.exe']),
      /v7\.0\.0 is already published/,
    );
    assert.deepStrictEqual(published.calls, [view, view]);
  });

  test('uploads nothing without a draft release to upload to', async () => {
    const { uploadRelease } = await githubRelease();
    const missing = fakeGh('missing');
    assert.throws(
      () => uploadRelease(missing.gh, 'v7.0.0', ['a.exe']),
      /v7.0.0 has no draft release/,
    );
    assert.deepStrictEqual(missing.calls, [view]);
  });
});
