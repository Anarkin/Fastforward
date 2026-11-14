import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { ContextMenuItem } from '../../../../lib/page/contextMenu';
import { plainOf } from '../../../../lib/shared/strings';
import {
  encodingSourceItems,
  endingSourceItems,
} from '../../../../tools/commander/page/editorSources';

const config = path.join('work', '.editorconfig');

function opening() {
  const opened: string[] = [];
  return {
    opened,
    opening: {
      file: (file: string) => opened.push(file),
      settings: () => opened.push('settings'),
    },
  };
}

const rowsOf = (items: readonly ContextMenuItem[]) =>
  items.map((item) =>
    'separator' in item
      ? '-'
      : `${item.checked === true ? '✓ ' : ''}${item.disabled === true ? '(off) ' : ''}${plainOf(item.sentence ?? item.label)}`,
  );

const click = (items: readonly ContextMenuItem[], at: number) => {
  const item = items[at];
  if (item !== undefined && !('separator' in item)) {
    item.onClick?.();
  }
};

suite('Where the editor says its text comes from', () => {
  test('lists where the line ending of new lines comes from, the lines of the file apart from the places a file with no line break yet takes it from, checking in each the first that sets it and dimming those that set nothing', () => {
    const { opening: none } = opening();
    assert.deepStrictEqual(
      rowsOf(
        endingSourceItems(
          [
            { kind: 'editorConfig', ending: 'lf', file: config },
            { kind: 'git', ending: 'crlf', by: 'core.autocrlf' },
            { kind: 'extension', extension: 'txt' },
            { kind: 'settings', ending: 'lf' },
          ],
          'crlf',
          none,
        ),
      ),
      [
        '(off) New lines end in:',
        '✓ CRLF, as most lines of the file end',
        '-',
        '(off) With no line break yet, new lines end in the first of these that applies:',
        `✓ LF, from "end_of_line" in "${config}"`,
        'CRLF, from "core.autocrlf" of git',
        '(off) "editor.files" in the settings sets nothing for ".txt"',
        'LF, from "editor.endOfLine" in the settings',
      ],
    );
    assert.deepStrictEqual(
      rowsOf(
        endingSourceItems(
          [
            { kind: 'editorConfig' },
            { kind: 'git', ending: 'lf', by: 'eol' },
            { kind: 'extension', extension: 'cmd', ending: 'crlf' },
            { kind: 'settings', ending: 'lf' },
          ],
          undefined,
          none,
        ),
      ).slice(1),
      [
        '(off) The file has no line break yet',
        '-',
        '(off) With no line break yet, new lines end in the first of these that applies:',
        '(off) No .editorconfig sets "end_of_line"',
        '✓ LF, from the "eol" attribute of git',
        'CRLF, from "editor.files" for ".cmd" in the settings',
        'LF, from "editor.endOfLine" in the settings',
      ],
    );
    assert.deepStrictEqual(
      rowsOf(
        endingSourceItems(
          [
            { kind: 'git' },
            { kind: 'extension', extension: '' },
            { kind: 'settings', ending: 'lf' },
          ],
          undefined,
          none,
        ),
      ).slice(4, 6),
      [
        '(off) Git sets no "eol" attribute, "core.autocrlf" or "core.eol"',
        '(off) "editor.files" in the settings sets nothing for files without an extension',
      ],
    );
  });

  test('opens the .editorconfig or the settings a line ending comes from once its row is clicked', () => {
    const { opening: opens, opened } = opening();
    const items = endingSourceItems(
      [
        { kind: 'editorConfig', ending: 'lf', file: config },
        { kind: 'extension', extension: 'cmd', ending: 'crlf' },
        { kind: 'settings', ending: 'lf' },
      ],
      undefined,
      opens,
    );
    click(items, 4);
    click(items, 5);
    click(items, 6);
    assert.deepStrictEqual(opened, [config, 'settings', 'settings']);
  });

  test('lists how the encoding of a file was found, the one chosen over its byte order mark, its bytes looking like UTF-16, being UTF-8 and the code page of the system', () => {
    const { opening: none } = opening();
    assert.deepStrictEqual(
      rowsOf(
        encodingSourceItems(
          [
            { kind: 'chosen' },
            { kind: 'bom' },
            { kind: 'utf16' },
            { kind: 'utf8', encoding: 'utf-8' },
            { kind: 'codePage', encoding: 'windows-1252' },
          ],
          none,
        ),
      ),
      [
        '(off) Read in the first of these that applies:',
        '(off) No encoding chosen for this file',
        '(off) No byte order mark',
        "(off) Its bytes don't look like UTF-16",
        '✓ UTF-8, as its bytes are UTF-8',
        'Windows-1252 Western, the code page of the system',
      ],
    );
    assert.deepStrictEqual(
      rowsOf(
        encodingSourceItems(
          [
            { kind: 'chosen', encoding: 'iso-8859-2' },
            { kind: 'bom', encoding: 'utf-16le' },
            { kind: 'utf16', encoding: 'utf-16be' },
            { kind: 'utf8' },
            { kind: 'codePage', encoding: 'windows-1252' },
          ],
          none,
        ),
      ).slice(1),
      [
        '✓ ISO-8859-2 Central European, chosen for this file',
        'UTF-16 LE, from its byte order mark',
        'UTF-16 BE, as its bytes look like UTF-16',
        "(off) Its bytes aren't UTF-8",
        'Windows-1252 Western, the code page of the system',
      ],
    );
  });

  test('lists where the charset of a new file comes from, opening the .editorconfig or the settings it comes from once clicked', () => {
    const { opening: opens, opened } = opening();
    const items = encodingSourceItems(
      [
        {
          kind: 'editorConfig',
          encoding: 'utf-8',
          bom: true,
          file: config,
        },
        { kind: 'settings', encoding: 'utf-8', bom: false },
      ],
      opens,
    );
    assert.deepStrictEqual(rowsOf(items), [
      '(off) Written in the first of these that applies:',
      `✓ UTF-8 with BOM, from "charset" in "${config}"`,
      'UTF-8, from "editor.charset" in the settings',
    ]);
    click(items, 1);
    click(items, 2);
    assert.deepStrictEqual(opened, [config, 'settings']);
    assert.deepStrictEqual(
      rowsOf(
        encodingSourceItems(
          [
            { kind: 'editorConfig' },
            { kind: 'settings', encoding: 'utf-16le', bom: true },
          ],
          opens,
        ),
      ).slice(1),
      [
        '(off) No .editorconfig sets "charset"',
        '✓ UTF-16 LE, from "editor.charset" in the settings',
      ],
    );
  });
});
