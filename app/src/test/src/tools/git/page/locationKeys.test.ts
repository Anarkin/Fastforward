import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { indexRefs } from '../../../../../tools/git/page/refIndex';
import { commitInfo, keyPress } from '../../../../helpers/fixtures';
import { refs } from './locationsFixtures';
import {
  enterTarget,
  focusLeaves,
  foundCommits,
  popupKeyAction,
} from '../../../../../tools/git/page/locationKeys';
import {
  pinnedResults,
  resultItems,
  searchRefs,
} from '../../../../../tools/git/page/locationResults';

const focused = (inside: boolean, menu = false) => ({
  inside,
  closest: (selector: string) =>
    menu && selector === '.context-menu' ? {} : null,
});

suite('Locations search', () => {
  test('puts the commits a typed hash may be before those found by text, each once', () => {
    const found = foundCommits(
      [commitInfo('a1')],
      [commitInfo('a1'), commitInfo('b2')],
    );
    assert.deepStrictEqual(
      found.map((commit) => commit.hash),
      ['a1', 'b2'],
    );
  });

  test('jumps on Enter to the commit of a pinned row, or nowhere for a bookmark that is gone', () => {
    const [main, gone, hash] = pinnedResults(
      [
        { kind: 'branch', name: 'main' },
        { kind: 'branch', name: 'gone' },
        { kind: 'commit', name: 'e'.repeat(40) },
      ],
      refs,
    );
    assert.strictEqual(enterTarget('main', undefined, main), 'b');
    assert.strictEqual(enterTarget('gone', undefined, gone), undefined);
    assert.strictEqual(
      enterTarget('eeee', undefined, hash, true),
      'e'.repeat(40),
    );
  });

  test('jumps on Enter to the bookmark named as typed, though its name may be a hash not looked up yet', () => {
    const [bookmark] = pinnedResults(
      [{ kind: 'tag', name: '2024' }],
      [{ kind: 'tag', name: '2024', commit: 'e' }],
    );
    assert.strictEqual(enterTarget(' 2024 ', undefined, bookmark), 'e');
  });

  test('jumps on Enter to the highlighted commit or ref', () => {
    const [branch, commit] = resultItems(
      [commitInfo('b'.repeat(40))],
      searchRefs(indexRefs([refs[3]]), 'feat'),
    );
    const found = { commits: [], more: 0 };
    assert.strictEqual(enterTarget('ab12', found, commit), 'b'.repeat(40));
    assert.strictEqual(enterTarget('ab12', found, branch), refs[3].commit);
    assert.strictEqual(enterTarget('feat', undefined, branch), refs[3].commit);
    assert.strictEqual(enterTarget('zz', undefined, undefined), undefined);
  });

  test('leaves Enter and the arrows to an input method composing text', () => {
    const key = keyPress('', { isComposing: false, keyCode: 13 });
    assert.strictEqual(popupKeyAction({ ...key, key: 'Enter' }), 'enter');
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowDown' }), 1);
    assert.strictEqual(popupKeyAction({ ...key, key: 'ArrowUp' }), -1);
    assert.strictEqual(
      popupKeyAction(keyPress('Enter', { isComposing: true, keyCode: 13 })),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(keyPress('Enter', { isComposing: false, keyCode: 229 })),
      undefined,
    );
    assert.strictEqual(
      popupKeyAction(
        keyPress('ArrowDown', { isComposing: true, keyCode: 229 }),
      ),
      undefined,
    );
  });

  test('jumps on Enter to a hash not looked up yet as typed', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('A1B2c3d4', undefined, branch), 'a1b2c3d4');
    assert.strictEqual(enterTarget(' AB12 ', undefined, branch), 'ab12');
  });

  test('jumps on Enter to the ref named as typed, though its name may be a hash not looked up yet', () => {
    const [tag] = resultItems(
      [],
      searchRefs(
        indexRefs([{ kind: 'tag', name: '2024', commit: 'e' }]),
        '2024',
      ),
    );
    assert.strictEqual(enterTarget(' 2024 ', undefined, tag), 'e');
  });

  test('jumps on Enter to the result picked with the arrows, though the typed text may be a hash not looked up yet', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(
      enterTarget('ab12', undefined, branch, true),
      refs[3].commit,
    );
  });

  test('jumps nowhere on Enter without a search, which highlights no match', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('', undefined, branch), undefined);
  });

  test('takes a search of spaces alone as no search, jumping nowhere', () => {
    const [branch] = resultItems([], searchRefs(indexRefs([refs[3]]), 'a'));
    assert.strictEqual(enterTarget('  ', undefined, branch), undefined);
  });
});

suite('Locations popup', () => {
  test('closes once the focus moves out of it, as Tab moves it to the next column, but not into its context menu, nor when nothing takes it', () => {
    const popup = {
      contains: (target: ReturnType<typeof focused>) => target.inside,
    };
    assert.strictEqual(focusLeaves(popup, focused(false)), true);
    assert.strictEqual(focusLeaves(popup, focused(true)), false);
    assert.strictEqual(focusLeaves(popup, focused(false, true)), false);
    assert.strictEqual(focusLeaves(popup, null), false);
  });
});
