import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  parsePatch,
  type DiffFile,
} from '../../../../../components/diff/page/diff';
import type { ImageOrigin } from '../../../../../components/diff/page/diffImages';
import {
  viewedSource,
  wholeViewedSource,
} from '../../../../../components/diff/page/viewedSource';

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

const at = (hash: string, area?: ImageOrigin['area']) => ({
  route: '/image',
  root: '/repo',
  hash,
  ...(area ? { area } : {}),
});

const textFile = (index: string) =>
  parsePatch(
    [
      'diff --git a/docs/a.md b/docs/a.md',
      `index ${index}`,
      '--- a/docs/a.md',
      '+++ b/docs/a.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n'),
  )[0];
suite('Files to view', () => {
  const none = '0'.repeat(40);

  test('views the new side of a file, from the working tree where it is on disk, and from a commit or the index by its blob', () => {
    const changed = textFile(`${oldId}..${newId}`);
    assert.deepStrictEqual(viewedSource(at(commit), changed), {
      path: 'docs/a.md',
      blob: newId,
    });
    assert.deepStrictEqual(
      viewedSource(at(workingTreeHash, 'unstaged'), changed),
      { path: 'docs/a.md' },
    );
    assert.deepStrictEqual(viewedSource(at(workingTreeHash), changed), {
      path: 'docs/a.md',
    });
    assert.deepStrictEqual(
      viewedSource(at(workingTreeHash, 'staged'), changed),
      { path: 'docs/a.md', blob: newId },
    );
  });

  test('views the old side of a file deleted, and the old path of one renamed', () => {
    assert.deepStrictEqual(
      viewedSource(at(commit), textFile(`${oldId}..${none}`)),
      { path: 'docs/a.md', blob: oldId },
    );
    assert.deepStrictEqual(
      viewedSource(
        at(workingTreeHash),
        binaryFile('old.png', 'new.png', `${oldId}..${none}`),
      ),
      { path: 'old.png', blob: oldId },
    );
  });

  test('views a file shown entire by its blob, or where it is in the working tree, and nothing it can not tell where to read from', () => {
    const whole = { path: 'a.md', content: '', binary: false, id: newId };
    assert.deepStrictEqual(wholeViewedSource(at(commit), whole), {
      path: 'a.md',
      blob: newId,
    });
    assert.deepStrictEqual(wholeViewedSource(at(workingTreeHash), whole), {
      path: 'a.md',
    });
    assert.strictEqual(
      wholeViewedSource(at(commit), { ...whole, id: undefined }),
      undefined,
    );
    assert.strictEqual(
      viewedSource(at(commit), {
        ...textFile(`${oldId}..${newId}`),
        blobs: undefined,
      }),
      undefined,
    );
  });
});
