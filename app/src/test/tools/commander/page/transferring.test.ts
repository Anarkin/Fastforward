import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../shared/strings';
import {
  progressLines,
  runningLines,
  shareDone,
  transferQuestion,
} from '../../../../tools/commander/page/transferring';
import type { TransferView } from '../../../../tools/commander/shared/transfers';

suite('The progress of a pack', () => {
  const progress = {
    files: 10,
    totalFiles: 40,
    bytes: 100,
    totalBytes: 800,
    current: 'docs/a.txt',
  };
  const view: TransferView = {
    id: 1,
    move: false,
    archiveJob: 'pack',
    items: 3,
    target: '/x/a.zip',
    stopping: false,
    progress,
  };

  test('counts the files 7-Zip read, which it reads ahead of what it packed, and names the one it read last until it read them all, then says it packs the rest', () => {
    assert.deepStrictEqual(progressLines(view), {
      current: 'docs/a.txt',
      files: '10 of 40 files read',
    });
    assert.deepStrictEqual(
      progressLines({
        ...view,
        progress: { ...progress, files: 40, totalFiles: 40 },
      }),
      { current: strings.commander.packingRest, files: '40 of 40 files read' },
    );
  });

  test('says it tests the archive once packed, counting the files tested', () => {
    assert.deepStrictEqual(
      progressLines({ ...view, progress: { ...progress, testing: true } }),
      {
        current: strings.commander.testingArchive,
        files: '10 of 40 files tested',
      },
    );
  });

  test('counts and names the files a copy on disk copied, as it copies them one at a time', () => {
    assert.deepStrictEqual(progressLines({ ...view, archiveJob: undefined }), {
      current: 'docs/a.txt',
      files: '10 of 40 files',
    });
  });

  test('says a move out of an archive deletes from it what it moved, once moved, without counting files', () => {
    assert.deepStrictEqual(
      progressLines({
        ...view,
        archiveJob: undefined,
        progress: { ...progress, current: 'a.zip', deleting: true },
      }),
      {
        current: strings.commander.deletingMovedFrom('a.zip'),
        files: undefined,
      },
    );
  });
});

suite('Commander transferring into an archive', () => {
  test('says after its lines how many of the items are there already, offering to replace them', () => {
    assert.deepStrictEqual(
      transferQuestion(['a.txt', 'b', 'c'], false, '/x/a.zip/docs', 2),
      {
        title: 'Copy',
        lines: [
          { label: 'Copy', text: '3 items' },
          { label: 'To', name: '/x/a.zip/docs' },
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
        { label: 'To', name: 'D:\\photos' },
      ],
      confirm: 'Copy',
    });
    assert.deepStrictEqual(transferQuestion(['a', 'b', 'c'], true, '/tmp'), {
      title: 'Move',
      lines: [
        { label: 'Move', text: '3 items' },
        { label: 'To', name: '/tmp' },
      ],
      confirm: 'Move',
    });
  });

  test('says on lines what a copy, a move or a job on an archive is doing and where, so the end of a long path is never cut off', () => {
    const copy: TransferView = {
      id: 1,
      move: false,
      items: 1,
      name: 'a.txt',
      target: 'D:\\photos',
      stopping: false,
    };
    assert.deepStrictEqual(runningLines(copy), [
      { label: 'Copying', name: 'a.txt' },
      { label: 'To', name: 'D:\\photos' },
    ]);
    assert.deepStrictEqual(runningLines({ ...copy, move: true, items: 2 }), [
      { label: 'Moving', text: '2 items' },
      { label: 'To', name: 'D:\\photos' },
    ]);
    const archive = { ...copy, items: 3, target: '/x/a.zip' };
    assert.deepStrictEqual(
      (
        [
          'pack',
          'delete',
          'rename',
          'folder',
          'copyIn',
          'moveIn',
          'test',
          'update',
        ] as const
      ).map((archiveJob) => runningLines({ ...archive, archiveJob })),
      [
        [
          { label: 'Packing', text: '3 items' },
          { label: 'Into', name: '/x/a.zip' },
        ],
        [
          { label: 'Deleting', text: '3 items' },
          { label: 'From', name: '/x/a.zip' },
        ],
        [
          { label: 'Renaming', text: '3 items' },
          { label: 'In', name: '/x/a.zip' },
        ],
        [
          { label: 'Making', text: '3 items' },
          { label: 'In', name: '/x/a.zip' },
        ],
        [
          { label: 'Copying', text: '3 items' },
          { label: 'To', name: '/x/a.zip' },
        ],
        [
          { label: 'Moving', text: '3 items' },
          { label: 'To', name: '/x/a.zip' },
        ],
        [{ label: 'Testing', text: '3 items' }],
        [{ label: 'Putting back', text: '3 items' }],
      ],
    );
  });

  test('measures how far a copy got by its bytes, by its files when they hold none, and as done when there was nothing to copy', () => {
    const progress = { files: 1, totalFiles: 4, bytes: 30, totalBytes: 40 };
    assert.strictEqual(shareDone(undefined), 0);
    assert.strictEqual(shareDone(progress), 75);
    assert.strictEqual(shareDone({ ...progress, bytes: 0, totalBytes: 0 }), 25);
    assert.strictEqual(
      shareDone({ files: 0, totalFiles: 0, bytes: 0, totalBytes: 0 }),
      100,
    );
  });
});
