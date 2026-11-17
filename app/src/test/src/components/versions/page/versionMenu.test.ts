import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import type { ContextMenuItem } from '../../../../../lib/page/contextMenuItem';
import {
  showsCommit,
  versionLabel,
  versionMenu,
} from '../../../../../components/versions/page/versionMenu';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
const day = Date.UTC(2026, 10, 17, 12);

const listed = {
  versions: [
    { rev: a, path: '/work/new.ts', date: day, subject: 'gone', gone: true },
    { rev: b, path: '/work/new.ts', date: day, subject: 'two', gone: false },
    { rev: c, path: '/work/old.ts', date: day, subject: 'one', gone: false },
  ],
  staged: true,
  onDisk: true,
  changed: true,
};

const shown = (items: readonly ContextMenuItem[]) =>
  items.map((item) =>
    'separator' in item
      ? '-'
      : [
          [
            ...(item.details ?? [])
              .map((detail) => detail.trim())
              .filter((detail) => detail !== ''),
            item.label,
          ].join(' | '),
          item.checked === true,
          item.disabled === true,
        ],
  );

suite('Version menu', () => {
  test('lists the file on disk, the version the index holds and then each commit that changed the file, by its subject after its short hash and date, set apart as details, the one shown checked and the one that deleted the file disabled', () => {
    assert.deepStrictEqual(
      shown(versionMenu(listed, b, 'YYYY-MM-DD', () => {})),
      [
        [strings.commits.uncommitted, false, false],
        [strings.versions.staged, false, false],
        '-',
        ['aaaaaaa | 2026-11-17 | gone', false, true],
        ['bbbbbbb | 2026-11-17 | two', true, false],
        ['ccccccc | 2026-11-17 | one', false, false],
      ],
    );
    assert.deepStrictEqual(
      shown(
        versionMenu(
          { ...listed, staged: false, onDisk: false },
          undefined,
          'YYYY-MM-DD',
          () => {},
        ),
      ).slice(0, 1),
      [['aaaaaaa | 2026-11-17 | gone', false, true]],
    );
  });

  test('lists no file on disk apart while it is as the newest commit that changed it has it, that commit standing for it, checked while the file on disk shows and showing it once chosen', () => {
    const unchanged = {
      ...listed,
      versions: listed.versions.slice(1),
      staged: false,
      changed: false,
    };
    const chosen: (string | undefined)[] = [];
    const items = versionMenu(unchanged, undefined, 'YYYY-MM-DD', (rev) =>
      chosen.push(rev),
    );
    assert.deepStrictEqual(shown(items), [
      ['bbbbbbb | 2026-11-17 | two', true, false],
      ['ccccccc | 2026-11-17 | one', false, false],
    ]);
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(chosen, [undefined, c]);
    assert.deepStrictEqual(
      shown(versionMenu(unchanged, b, 'YYYY-MM-DD', () => {})).map(
        (row) => row[1],
      ),
      [true, false],
    );
  });

  test('puts the names of the file on disk and of the index in the column of the subjects, their columns of hash and date left blank as wide as those of the commits', () => {
    const items = versionMenu(listed, undefined, 'YYYY-MM-DD HH:mm', () => {});
    const widths = items.flatMap((item) =>
      'separator' in item
        ? []
        : [(item.details ?? []).map((detail) => detail.length)],
    );
    assert.deepStrictEqual(widths, [
      [7, 16],
      [7, 16],
      [7, 16],
      [7, 16],
      [7, 16],
    ]);
  });

  test('chooses the file on disk, the version of the index or a commit, and nothing on the commit that deleted the file', () => {
    const chosen: (string | undefined)[] = [];
    for (const item of versionMenu(listed, undefined, 'YYYY-MM-DD', (rev) =>
      chosen.push(rev),
    )) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(chosen, [undefined, 'index', b, c]);
  });

  test('names the version shown on its button by its short hash, or as the file on disk or the version of the index, the file on disk by the newest commit while that commit stands for it, as its menu checks that commit', () => {
    const unchanged = {
      ...listed,
      versions: listed.versions.slice(1),
      changed: false,
    };
    assert.deepStrictEqual(
      [
        versionLabel(undefined, listed),
        versionLabel('index', listed),
        versionLabel(b, listed),
        versionLabel(undefined, unchanged),
        versionLabel(c, unchanged),
      ],
      [
        strings.commits.uncommitted,
        strings.versions.staged,
        'bbbbbbb',
        'bbbbbbb',
        'ccccccc',
      ],
    );
  });

  test('says the button names a commit while it shows a hash, for the file on disk too while the newest commit stands for it', () => {
    const unchanged = {
      ...listed,
      versions: listed.versions.slice(1),
      changed: false,
    };
    assert.deepStrictEqual(
      [
        showsCommit(undefined, listed),
        showsCommit('index', listed),
        showsCommit(b, listed),
        showsCommit(undefined, unchanged),
      ],
      [false, false, true, true],
    );
  });
});
