import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../helpers/filters';
import { filteredItems } from '../../../../lib/page/menuFilter';

const labelsOf = (items: ReturnType<typeof filteredItems>) =>
  items.map((item) => ('separator' in item ? '-' : item.label));

suite('Menu filter', () => {
  test('keeps the items whose label or keywords have every word of the filter, ignoring case, and drops the separators while filtering', () => {
    const items = [
      { label: 'Auto: TypeScript', keywords: 'ts typescript' },
      { separator: true as const },
      { label: 'JavaScript', keywords: 'js javascript' },
      { label: 'TypeScript', keywords: 'ts typescript' },
      { label: 'TSX', keywords: 'tsx' },
    ];

    assert.deepStrictEqual(labelsOf(filteredItems(items, plainFilter(''))), [
      'Auto: TypeScript',
      '-',
      'JavaScript',
      'TypeScript',
      'TSX',
    ]);
    assert.deepStrictEqual(labelsOf(filteredItems(items, plainFilter('TS'))), [
      'Auto: TypeScript',
      'TypeScript',
      'TSX',
    ]);
    assert.deepStrictEqual(
      labelsOf(filteredItems(items, plainFilter('type auto'))),
      ['Auto: TypeScript'],
    );
    assert.deepStrictEqual(
      labelsOf(filteredItems(items, plainFilter('java ts'))),
      [],
    );
  });

  test('folds the labels and the words as every filter of the app does, so a final sigma and letters composed or not match alike', () => {
    const items = [{ label: 'ΟΔΟΣ' }, { label: 'élan' }, { label: 'Other' }];

    assert.deepStrictEqual(
      labelsOf(filteredItems(items, plainFilter('οδοσ'))),
      ['ΟΔΟΣ'],
    );
    assert.deepStrictEqual(
      labelsOf(filteredItems(items, plainFilter('ÉLAN'))),
      ['élan'],
    );
  });
});
