import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { withChosen } from '../../../../../tools/diff/main/versionChoice';

const [a, b, c] = ['a', 'b', 'c'].map((each) => each.repeat(40));
const file = '/repo/a.txt';
const listed = {
  versions: [c, b, a].map((rev) => ({
    rev: rev ?? '',
    path: file,
    date: 1,
    subject: 'subject',
    gone: false,
  })),
  staged: false,
  changed: true,
  file,
  onDisk: true,
};

suite('Version choice', () => {
  test('moves the old side to the version below the one chosen on the new side while both sides are versions of one file, and leaves the old side of another file as it is', () => {
    assert.deepStrictEqual(
      withChosen({ old: file, new: file }, 'new', b, { new: listed }),
      {
        old: file,
        new: file,
        oldVersion: { rev: a, file },
        newVersion: { rev: b, file },
      },
    );
    assert.deepStrictEqual(
      withChosen({ old: '/repo/b.txt', new: file }, 'new', b, { new: listed }),
      { old: '/repo/b.txt', new: file, newVersion: { rev: b, file } },
    );
  });
});
