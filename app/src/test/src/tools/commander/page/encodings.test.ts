import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { filteredItems } from '../../../../../lib/page/menu';
import {
  encodingMenu,
  shownEncoding,
} from '../../../../../tools/commander/page/encodings';

const labels = (menu: ReturnType<typeof encodingMenu>) =>
  menu.map((item) =>
    'separator' in item
      ? '-'
      : `${item.checked === true ? '✓ ' : ''}${item.label}`,
  );

const found = (query: string) =>
  filteredItems(
    encodingMenu('auto', 'utf-8', () => {}),
    query,
  ).map((item) => ('separator' in item ? '-' : item.label));

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

  test('names in the menu the encoding Auto chose, offers bytes first, then the encodings of Unicode, Windows, ISO, DOS and Unix, and the Mac in groups, each by its name and then what it is for, in the order of their names', () => {
    assert.deepStrictEqual(labels(encodingMenu('auto', 'bytes', () => {})), [
      '✓ Auto: Bytes',
      '-',
      'Bytes',
      '-',
      'UTF-8',
      'UTF-16 BE',
      'UTF-16 LE',
      '-',
      'Windows-874 Thai',
      'Windows-1250 Central European',
      'Windows-1251 Cyrillic',
      'Windows-1252 Western',
      'Windows-1253 Greek',
      'Windows-1254 Turkish',
      'Windows-1255 Hebrew',
      'Windows-1256 Arabic',
      'Windows-1257 Baltic',
      'Windows-1258 Vietnamese',
      '-',
      'ISO-8859-2 Central European',
      'ISO-8859-3 South European',
      'ISO-8859-4 North European',
      'ISO-8859-5 Cyrillic',
      'ISO-8859-6 Arabic',
      'ISO-8859-7 Greek',
      'ISO-8859-8 Hebrew, visual',
      'ISO-8859-8-I Hebrew',
      'ISO-8859-10 Nordic',
      'ISO-8859-13 Baltic',
      'ISO-8859-14 Celtic',
      'ISO-8859-15 Western',
      'ISO-8859-16 South-Eastern European',
      '-',
      'DOS-866 Cyrillic',
      'KOI8-R Russian',
      'KOI8-U Ukrainian',
      '-',
      'Mac Cyrillic',
      'Mac Roman Western',
    ]);
    assert.deepStrictEqual(
      labels(encodingMenu('utf-8', 'utf-8', () => {})).slice(0, 5),
      ['Auto', '-', 'Bytes', '-', '✓ UTF-8'],
    );
    assert.strictEqual(
      labels(encodingMenu('auto', 'windows-1250', () => {}))[0],
      '✓ Auto: Windows-1250 Central European',
    );
  });

  test('finds an encoding by its code page and the name it goes by, too', () => {
    assert.deepStrictEqual(found('1250'), ['Windows-1250 Central European']);
    assert.deepStrictEqual(found('28592'), ['ISO-8859-2 Central European']);
    assert.deepStrictEqual(found('latin2'), ['ISO-8859-2 Central European']);
    assert.deepStrictEqual(found('koi8'), [
      'KOI8-R Russian',
      'KOI8-U Ukrainian',
    ]);
  });

  test('chooses the encoding of the item clicked', () => {
    const chosen: string[] = [];
    const menu = encodingMenu('auto', 'utf-8', (choice) => chosen.push(choice));

    for (const item of menu) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }

    assert.deepStrictEqual(chosen.slice(0, 7), [
      'auto',
      'bytes',
      'utf-8',
      'utf-16be',
      'utf-16le',
      'windows-874',
      'windows-1250',
    ]);
    assert.strictEqual(chosen.at(-1), 'macintosh');
  });
});
