import * as assert from 'node:assert';
import { untrackedListing } from '../../git/workingTree';

suite('Untracked files', () => {
  test('lists them with git status on Windows, which reads the folders through its cache, keeping only the untracked ones', () => {
    const { args, paths } = untrackedListing('win32');
    assert.deepStrictEqual(args.slice(0, 3), [
      '-c',
      'core.fscache=true',
      'status',
    ]);
    assert.deepStrictEqual(
      paths(
        '1 .M N... 100644 100644 100644 aaa bbb a.txt\0? new file.txt\0? nested/\0',
      ),
      ['new file.txt', 'nested/'],
    );
  });

  test('lists them with ls-files elsewhere', () => {
    const { args, paths } = untrackedListing('linux');
    assert.strictEqual(args[0], 'ls-files');
    assert.deepStrictEqual(paths('a.txt\0nested/\0'), ['a.txt', 'nested/']);
  });
});
