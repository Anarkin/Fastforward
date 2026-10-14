import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { changeKind, changeTitle } from '../../webview/fileStatus';
import { fileChange as change } from '../fixtures';

suite('File status', () => {
  test('sorts every status into the four kinds GitHub shows, a copy or an untracked file being new and a type change or an unknown status a modification', () => {
    assert.deepStrictEqual(
      (['A', 'U', 'C', 'M', 'T', '?', 'D', 'R'] as const).map((status) =>
        changeKind(change('a.ts', { status })),
      ),
      [
        'added',
        'added',
        'added',
        'modified',
        'modified',
        'modified',
        'deleted',
        'renamed',
      ],
    );
  });

  test('names the status and both paths of a rename in the tooltip', () => {
    assert.strictEqual(
      changeTitle(change('new.ts', { status: 'R', oldPath: 'old.ts' })),
      'Renamed: old.ts → new.ts',
    );
    assert.strictEqual(
      changeTitle(change('gone.ts', { status: 'D' })),
      'Deleted: gone.ts',
    );
  });
});
