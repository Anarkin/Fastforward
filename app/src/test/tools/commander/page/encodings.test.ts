import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  encodingMenu,
  shownEncoding,
} from '../../../../tools/commander/page/encodings';

const labels = (menu: ReturnType<typeof encodingMenu>) =>
  menu.map((item) =>
    'separator' in item
      ? '-'
      : `${item.checked === true ? '✓ ' : ''}${item.label}`,
  );

suite('The encoding of a file viewed', () => {
  test('reads a file by the encoding its byte order mark names, else a binary file byte by byte, else as UTF-8', () => {
    assert.strictEqual(
      shownEncoding('auto', { binary: true, detected: 'utf-16le' }),
      'utf-16le',
    );
    assert.strictEqual(shownEncoding('auto', { binary: true }), 'bytes');
    assert.strictEqual(shownEncoding('auto', { binary: false }), 'utf-8');
    assert.strictEqual(shownEncoding('auto'), 'utf-8');
  });

  test('reads a file in the encoding chosen, whatever it seems to be', () => {
    assert.strictEqual(
      shownEncoding('windows-1250', { binary: true, detected: 'utf-8' }),
      'windows-1250',
    );
    assert.strictEqual(shownEncoding('bytes', { binary: false }), 'bytes');
  });

  test('names in the menu the encoding Auto chose, and offers bytes first of the encodings, as any file can be read as bytes', () => {
    assert.deepStrictEqual(labels(encodingMenu('auto', 'bytes', () => {})), [
      '✓ Auto: Bytes',
      '-',
      'Bytes',
      'UTF-8',
      'UTF-16 LE',
      'UTF-16 BE',
      'Western (Windows-1252)',
      'Central European (Windows-1250)',
      'Cyrillic (Windows-1251)',
    ]);
    assert.deepStrictEqual(
      labels(encodingMenu('utf-8', 'utf-8', () => {})).slice(0, 4),
      ['Auto', '-', 'Bytes', '✓ UTF-8'],
    );
  });

  test('chooses the encoding of the item clicked', () => {
    const chosen: string[] = [];
    const menu = encodingMenu('auto', 'utf-8', (choice) => chosen.push(choice));

    for (const item of menu) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }

    assert.deepStrictEqual(chosen, [
      'auto',
      'bytes',
      'utf-8',
      'utf-16le',
      'utf-16be',
      'windows-1252',
      'windows-1250',
      'windows-1251',
    ]);
  });
});
