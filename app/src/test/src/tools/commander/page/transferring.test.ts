import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { transferQuestion } from '../../../../../tools/commander/page/transferring';

suite('Commander transferring into an archive', () => {
  test('says after its lines how many of the items are there already, offering to replace them', () => {
    assert.deepStrictEqual(
      transferQuestion(['a.txt', 'b', 'c'], false, '/x/a.zip/docs', 2),
      {
        title: 'Copy',
        lines: [
          { label: 'Copy', text: '3 items' },
          { label: 'To', name: '/x/a.zip/docs', path: 'folder' },
        ],
        note: '2 of them are there already.',
        confirm: 'Replace',
      },
    );
    assert.deepStrictEqual(
      transferQuestion(['a.txt'], true, '/x/a.zip', 1).note,
      'It is there already.',
    );
  });
});

suite('Commander transferring', () => {
  test('asks before copying or moving into the folder of the other side on lines that read as the question, naming a single item and counting more', () => {
    assert.deepStrictEqual(transferQuestion(['a.txt'], false, 'D:\\photos'), {
      title: 'Copy',
      lines: [
        { label: 'Copy', name: 'a.txt' },
        { label: 'To', name: 'D:\\photos', path: 'folder' },
      ],
      confirm: 'Copy',
    });
    assert.deepStrictEqual(transferQuestion(['a', 'b', 'c'], true, '/tmp'), {
      title: 'Move',
      lines: [
        { label: 'Move', text: '3 items' },
        { label: 'To', name: '/tmp', path: 'folder' },
      ],
      confirm: 'Move',
    });
  });
});
