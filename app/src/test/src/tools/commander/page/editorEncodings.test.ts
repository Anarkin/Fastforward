import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ContextMenuItem } from '../../../../../lib/page/contextMenu';
import { filteredItems } from '../../../../../lib/page/menu';
import { encodingMenu } from '../../../../../tools/commander/page/encodings';
import {
  readMenu,
  saveMenu,
} from '../../../../../tools/commander/page/editorEncodings';

const labels = (menu: readonly ContextMenuItem[]) =>
  menu.map((item) =>
    'separator' in item
      ? '-'
      : `${item.checked === true ? '✓ ' : ''}${item.disabled === true ? '(off) ' : ''}${item.label}`,
  );

const viewer = labels(encodingMenu('auto', 'windows-1252', () => {}));

const nothing = () => {};

const readSources: readonly ContextMenuItem[] = [
  { label: 'Read in', disabled: true },
  { label: 'Windows-1252 Western, the code page of the system', checked: true },
];

const writtenSources: readonly ContextMenuItem[] = [
  { label: 'Written in', disabled: true },
  { label: 'UTF-8, from editor.charset in the settings', checked: true },
];

const click = (menu: readonly ContextMenuItem[], label: string) => {
  const item = menu.find(
    (each) => !('separator' in each) && each.label === label,
  );
  assert.ok(item !== undefined && !('separator' in item), label);
  item.onClick?.();
};

const found = (query: string) =>
  labels(
    filteredItems(
      saveMenu(
        { saving: 'windows-1252', bom: false, onDisk: undefined },
        nothing,
        [],
      ),
      query,
    ),
  );

suite('The encoding menus of the editor', () => {
  test('lists the encodings to read the file in as the viewer lists them, but bytes, Auto naming the one it read the file in, then where its encoding comes from', () => {
    assert.deepStrictEqual(
      labels(
        readMenu(
          { choice: 'auto', shown: 'windows-1252' },
          nothing,
          readSources,
        ),
      ),
      [
        '✓ Auto: Windows-1252 Western',
        ...viewer.slice(3),
        '-',
        '(off) Read in',
        '✓ Windows-1252 Western, the code page of the system',
      ],
    );
  });

  test('checks the encoding chosen to read the file in rather than Auto, which then names none', () => {
    const menu = labels(
      readMenu({ choice: 'iso-8859-2', shown: 'iso-8859-2' }, nothing, []),
    );

    assert.strictEqual(menu[0], 'Auto');
    assert.deepStrictEqual(
      menu.filter((label) => label.startsWith('✓')),
      ['✓ ISO-8859-2 Central European'],
    );
  });

  test('lists the encodings to save the file in as those to read it in, Auto naming the one it has on disk, UTF-8 with a byte order mark beside UTF-8', () => {
    const groups = viewer
      .slice(3)
      .flatMap((label) =>
        label === 'UTF-8' ? ['UTF-8', 'UTF-8 with BOM'] : [label],
      );

    assert.deepStrictEqual(
      labels(
        saveMenu(
          { saving: 'windows-1252', bom: false, onDisk: undefined },
          nothing,
          [],
        ),
      ),
      ['✓ Auto: Windows-1252 Western', ...groups],
    );
    assert.deepStrictEqual(
      labels(
        saveMenu(
          {
            saving: 'utf-8',
            bom: false,
            onDisk: { encoding: 'windows-1252', bom: false },
          },
          nothing,
          [],
        ),
      ).slice(0, 4),
      ['Auto: Windows-1252 Western', '-', '✓ UTF-8', 'UTF-8 with BOM'],
    );
  });

  test('tells UTF-8 with a byte order mark from UTF-8 without one, on disk and to save in', () => {
    assert.strictEqual(
      labels(
        saveMenu(
          { saving: 'utf-8', bom: true, onDisk: undefined },
          nothing,
          [],
        ),
      )[0],
      '✓ Auto: UTF-8 with BOM',
    );
    assert.deepStrictEqual(
      labels(
        saveMenu(
          {
            saving: 'utf-8',
            bom: true,
            onDisk: { encoding: 'utf-8', bom: false },
          },
          nothing,
          [],
        ),
      ).slice(0, 4),
      ['Auto: UTF-8', '-', 'UTF-8', '✓ UTF-8 with BOM'],
    );
  });

  test('lists where the encoding of a new file comes from below the encodings to save it in', () => {
    assert.deepStrictEqual(
      labels(
        saveMenu(
          { saving: 'utf-8', bom: false, onDisk: undefined },
          nothing,
          writtenSources,
        ),
      ).slice(-3),
      ['-', '(off) Written in', '✓ UTF-8, from editor.charset in the settings'],
    );
  });

  test('reads the file again in the encoding clicked, and saves it in the one clicked, with its byte order mark', () => {
    const reopened: string[] = [];
    const saved: string[] = [];
    const reading = readMenu(
      { choice: 'auto', shown: 'windows-1252' },
      (choice) => reopened.push(choice),
      [],
    );
    const saving = saveMenu(
      {
        saving: 'utf-8',
        bom: false,
        onDisk: { encoding: 'windows-1252', bom: false },
      },
      (encoding, bom) => saved.push(`${encoding}${bom ? ' BOM' : ''}`),
      [],
    );
    click(reading, 'Windows-1250 Central European');
    click(reading, 'Auto: Windows-1252 Western');
    click(saving, 'UTF-8 with BOM');
    click(saving, 'UTF-16 LE');
    click(saving, 'KOI8-R Russian');
    click(saving, 'Auto: Windows-1252 Western');

    assert.deepStrictEqual(reopened, ['windows-1250', 'auto']);
    assert.deepStrictEqual(saved, [
      'utf-8 BOM',
      'utf-16le BOM',
      'koi8-r',
      'auto',
    ]);
  });

  test('finds an encoding to save in by its code page and the name it goes by, as the viewer finds one', () => {
    assert.deepStrictEqual(found('28592'), ['ISO-8859-2 Central European']);
    assert.deepStrictEqual(found('latin2'), ['ISO-8859-2 Central European']);
    assert.deepStrictEqual(found('bom'), ['UTF-8 with BOM']);
  });
});
