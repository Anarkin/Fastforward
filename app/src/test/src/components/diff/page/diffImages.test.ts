import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../../lib/shared/comparisons';
import { imageSourceOf } from '../../../../../components/diff/shared/imageSources';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  parsePatch,
  type DiffFile,
} from '../../../../../components/diff/page/diff';
import {
  diffImageUrl,
  previewsImage,
  previewsWholeImage,
  wholeImageUrl,
  withUnchangedObjects,
  type ImageOrigin,
} from '../../../../../components/diff/page/diffImages';

const oldId = '1'.repeat(40);
const newId = '2'.repeat(40);
const commit = 'c'.repeat(40);

function binaryFile(from: string, to: string, index: string): DiffFile {
  const [file] = parsePatch(
    [
      `diff --git a/${from} b/${to}`,
      ...(from === to ? [] : [`rename from ${from}`, `rename to ${to}`]),
      `index ${index}`,
      `Binary files a/${from} and b/${to} differ`,
    ].join('\n'),
  );
  return file;
}

const modified = binaryFile('a.png', 'a.png', `${oldId}..${newId}`);

const at = (hash: string, area?: ImageOrigin['area']) => ({
  route: '/image',
  root: '/repo',
  hash,
  ...(area ? { area } : {}),
});

const source = (url: string | undefined) =>
  url === undefined
    ? undefined
    : imageSourceOf(new URL(url, 'fastforward://app'), '/image');

const change = (file: string, id?: string) => ({
  path: file,
  oldPath: undefined,
  status: 'R' as const,
  insertions: 0,
  deletions: 0,
  ...(id ? { id } : {}),
});

suite('Image previews', () => {
  test('previews an image moved or copied unchanged by the object its change names', () => {
    const [moved, renamedText, edited] = parsePatch(
      [
        'diff --git a/resources/a.png b/src/a.png',
        'similarity index 100%',
        'rename from resources/a.png',
        'rename to src/a.png',
        'diff --git a/a.ts b/b.ts',
        'similarity index 100%',
        'rename from a.ts',
        'rename to b.ts',
        'diff --git a/c.png b/c.png',
        `index ${oldId}..${newId}`,
        'Binary files a/c.png and b/c.png differ',
      ].join('\n'),
    );
    const files = [moved, renamedText, edited];
    const [image, text, kept] = withUnchangedObjects(files, [
      change('src/a.png', commit),
      change('b.ts', commit),
      change('c.png', commit),
    ]);
    assert.strictEqual(previewsImage(moved), false);
    assert.strictEqual(previewsImage(image), true);
    assert.deepStrictEqual(
      [
        source(diffImageUrl(at(commit), image, 'old')),
        source(diffImageUrl(at(commit), image, 'new'))?.path,
      ],
      [
        { root: '/repo', path: 'resources/a.png', id: commit, disk: false },
        'src/a.png',
      ],
    );
    assert.strictEqual(text.binary, false);
    assert.strictEqual(kept, edited);
    assert.strictEqual(
      withUnchangedObjects(files, [change('src/a.png')]),
      files,
    );
  });

  test('previews no symbolic link moved unchanged, though it is named like an image, as its object is the path it points to', () => {
    const files = parsePatch(
      [
        'diff --git a/resources/a.png b/src/a.png',
        'similarity index 100%',
        'rename from resources/a.png',
        'rename to src/a.png',
      ].join('\n'),
    );
    assert.strictEqual(
      withUnchangedObjects(files, [
        { ...change('src/a.png', commit), link: true },
      ]),
      files,
    );
  });

  test('previews a binary image that has either side', () => {
    assert.strictEqual(previewsImage(modified), true);
    assert.strictEqual(
      previewsImage(
        binaryFile('a.png', 'a.png', `${'0'.repeat(40)}..${newId}`),
      ),
      true,
    );
    assert.strictEqual(
      previewsImage(binaryFile('a.bin', 'a.bin', `${oldId}..${newId}`)),
      false,
    );
    assert.strictEqual(
      previewsImage({ path: 'a.png', binary: true, hunks: [] }),
      false,
    );
    assert.strictEqual(previewsImage({ ...modified, binary: false }), false);
  });

  test('reads the working tree side of an image from disk, and the rest from git, as git diffs give the working tree side the id its blob would have without storing the blob', () => {
    const disk = (origin: ImageOrigin) => [
      source(diffImageUrl(origin, modified, 'old'))?.disk,
      source(diffImageUrl(origin, modified, 'new'))?.disk,
    ];
    assert.deepStrictEqual(disk(at(commit)), [false, false]);
    assert.deepStrictEqual(disk(at(workingTreeHash)), [false, true]);
    assert.deepStrictEqual(disk(at(workingTreeHash, 'unstaged')), [
      false,
      true,
    ]);
    assert.deepStrictEqual(disk(at(workingTreeHash, 'staged')), [false, false]);
    assert.deepStrictEqual(disk(at(comparisonOf(workingTreeHash, commit))), [
      true,
      false,
    ]);
    assert.deepStrictEqual(source(diffImageUrl(at(commit), modified, 'new')), {
      root: '/repo',
      path: 'a.png',
      id: newId,
      disk: false,
    });
  });

  test('reads each side of a renamed image at its own path, and no side it lacks', () => {
    const renamed = binaryFile('old.jpg', 'new.png', `${oldId}..${newId}`);
    const origin = {
      route: '/image',
      root: '/repo',
      hash: comparisonOf(workingTreeHash, commit),
    };
    assert.deepStrictEqual(source(diffImageUrl(origin, renamed, 'old')), {
      root: '/repo',
      path: 'old.jpg',
      id: oldId,
      disk: true,
    });
    assert.strictEqual(
      source(diffImageUrl(origin, renamed, 'new'))?.path,
      'new.png',
    );
    const added = binaryFile('a.png', 'a.png', `${'0'.repeat(40)}..${newId}`);
    assert.strictEqual(diffImageUrl(origin, added, 'old'), undefined);
    const typeChanged = binaryFile('a.png', 'a.bin', `${oldId}..${newId}`);
    assert.strictEqual(diffImageUrl(origin, typeChanged, 'new'), undefined);
  });

  test('previews a binary image shown whole, from disk in the working tree', () => {
    const whole = { path: 'a.png', content: '', binary: true, id: commit };
    assert.strictEqual(previewsWholeImage(whole), true);
    assert.strictEqual(previewsWholeImage({ ...whole, path: 'a.bin' }), false);
    assert.strictEqual(
      previewsWholeImage({ path: 'a.png', binary: true }),
      false,
    );
    assert.strictEqual(
      source(
        wholeImageUrl({ route: '/image', root: '/repo', hash: commit }, whole),
      )?.disk,
      false,
    );
    assert.strictEqual(
      source(
        wholeImageUrl(
          {
            route: '/image',
            root: '/repo',
            hash: workingTreeHash,
            area: 'staged',
          },
          whole,
        ),
      )?.disk,
      true,
    );
  });
});
