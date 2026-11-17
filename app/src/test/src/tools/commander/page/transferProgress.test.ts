import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import {
  progressLines,
  runningLines,
  shareDone,
} from '../../../../../tools/commander/page/transferProgress';
import type { TransferView } from '../../../../../tools/commander/shared/transfers';

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
      current: undefined,
      file: 'docs/a.txt',
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

  test('counts and names the files a copy on disk copied, as it copies them one at a time, each by its path, for the dialog to draw on a line of its own as the path of a side, its folders giving way first', () => {
    assert.deepStrictEqual(
      progressLines({
        ...view,
        archiveJob: undefined,
        progress: { ...progress, current: '/home/me/docs/a.txt' },
      }),
      {
        current: undefined,
        file: '/home/me/docs/a.txt',
        files: '10 of 40 files',
      },
    );
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

suite('Commander transferring', () => {
  test('says on lines what a copy, a move or a job on an archive is doing and where, so the end of a long path is never cut off', () => {
    const copy: TransferView = {
      id: 1,
      move: false,
      items: 1,
      name: 'C:\\from\\a.txt',
      target: 'D:\\photos',
      stopping: false,
    };
    assert.deepStrictEqual(runningLines(copy), [
      { label: '', name: 'C:\\from\\a.txt', path: 'file' },
      { label: 'To', name: 'D:\\photos', path: 'folder' },
    ]);
    assert.deepStrictEqual(runningLines({ ...copy, name: 'a.txt' })[0], {
      label: '',
      name: 'a.txt',
      path: 'file',
    });
    assert.deepStrictEqual(runningLines({ ...copy, move: true, items: 2 }), [
      { label: '', text: '2 items' },
      { label: 'To', name: 'D:\\photos', path: 'folder' },
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
          { label: '', text: '3 items' },
          { label: 'Into', name: '/x/a.zip', path: 'file' },
        ],
        [
          { label: '', text: '3 items' },
          { label: 'From', name: '/x/a.zip', path: 'file' },
        ],
        [
          { label: '', text: '3 items' },
          { label: 'In', name: '/x/a.zip', path: 'file' },
        ],
        [
          { label: '', text: '3 items' },
          { label: 'In', name: '/x/a.zip', path: 'file' },
        ],
        [
          { label: '', text: '3 items' },
          { label: 'To', name: '/x/a.zip', path: 'folder' },
        ],
        [
          { label: '', text: '3 items' },
          { label: 'To', name: '/x/a.zip', path: 'folder' },
        ],
        [{ text: '3 items' }],
        [{ text: '3 items' }],
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
