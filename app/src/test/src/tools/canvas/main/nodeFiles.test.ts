import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  headBytes,
  nodeFilesOf,
  pathIn,
  shownText,
  vaultOf,
  type FileAccess,
} from '../../../../../tools/canvas/main/nodeFiles';
import type { Board } from '../../../../../tools/canvas/shared/board';

const root = path.resolve('/vault');

const fileNode = (id: string, file: string) => ({
  id,
  type: 'file' as const,
  file,
  x: 0,
  y: 0,
  width: 70,
  height: 36,
});

function access(
  files: Record<string, string | Buffer>,
  folders: readonly string[],
): FileAccess & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    isFolder: (file) => Promise.resolve(folders.includes(file)),
    readHead: (file, bytes) => {
      asked.push(file);
      const found = files[file];
      return found === undefined
        ? Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' }))
        : Promise.resolve(Buffer.from(found).subarray(0, bytes));
    },
    codePage: () => Promise.resolve('windows-1252'),
  };
}

suite('Canvas node files', () => {
  test('takes the folder of the vault a canvas is in, the nearest above it holding .obsidian, as Obsidian writes the paths of files from it, and the folder of the canvas where none is', async () => {
    const canvas = path.join(root, 'boards', 'deep', 'plan.canvas');
    assert.strictEqual(
      await vaultOf(canvas, (folder) =>
        Promise.resolve(folder === path.join(root, '.obsidian')),
      ),
      root,
    );
    assert.strictEqual(
      await vaultOf(canvas, () => Promise.resolve(false)),
      path.join(root, 'boards', 'deep'),
    );
  });

  test('reads a file of a node only inside the folder of its vault', () => {
    assert.strictEqual(
      pathIn(root, 'notes/a.md'),
      path.join(root, 'notes', 'a.md'),
    );
    assert.strictEqual(
      pathIn(root, '..notes/a.md'),
      path.join(root, '..notes', 'a.md'),
    );
    for (const outside of [
      '../secret.txt',
      'notes/../../secret.txt',
      path.resolve('/elsewhere/secret.txt'),
      '',
      '.',
    ]) {
      assert.strictEqual(pathIn(root, outside), undefined, outside);
    }
  });

  test('shows the whole lines of the head of a file, in its encoding, a carriage return alone ending a line as in every view, 500 lines at most, and no text of a binary file', () => {
    assert.strictEqual(
      shownText(Buffer.from('one\r\ntwo\rthree\nfour'), true, 'utf-8'),
      'one\ntwo\nthree\nfour',
    );
    assert.strictEqual(
      shownText(Buffer.from('one\ntwo\nthr'), false, 'utf-8'),
      'one\ntwo',
    );
    assert.strictEqual(
      shownText(Buffer.from('a line cut short'), false, 'utf-8'),
      'a line cut short',
    );
    assert.strictEqual(
      shownText(Buffer.from([0x43, 0x61, 0x66, 0xe9]), true, 'windows-1252'),
      'Café',
    );
    assert.strictEqual(
      shownText(Buffer.from('x\n'.repeat(600)), true, 'utf-8')?.split('\n')
        .length,
      500,
    );
    assert.strictEqual(
      shownText(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d]),
        true,
        'utf-8',
      ),
      undefined,
    );
  });

  test('tells the page where each file of a node is and the head of its text, a folder, a binary file or a file not there by its path alone, and nothing of a path that leaves the vault', async () => {
    const canvas = path.join(root, 'plan.canvas');
    const files = access(
      {
        [path.join(root, 'notes', 'a.md')]: '# A\nbody\n',
        [path.join(root, 'image.png')]: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0, 0,
        ]),
        [path.join(root, 'long.txt')]:
          `${'y'.repeat(headBytes - 2)}\nz${'w'.repeat(10)}`,
      },
      [path.join(root, '.obsidian'), path.join(root, 'notes')],
    );
    const board: Board = {
      nodes: [
        fileNode('a', 'notes/a.md'),
        fileNode('b', 'notes/a.md'),
        fileNode('c', 'image.png'),
        fileNode('d', 'notes'),
        fileNode('e', 'gone.md'),
        fileNode('f', '../secret.txt'),
        fileNode('g', 'long.txt'),
      ],
      edges: [],
    };
    assert.deepStrictEqual(await nodeFilesOf(canvas, board, files), {
      'notes/a.md': {
        path: path.join(root, 'notes', 'a.md'),
        text: '# A\nbody\n',
      },
      'image.png': { path: path.join(root, 'image.png') },
      notes: { path: path.join(root, 'notes') },
      'gone.md': { path: path.join(root, 'gone.md') },
      'long.txt': {
        path: path.join(root, 'long.txt'),
        text: 'y'.repeat(headBytes - 2),
      },
    });
    assert.strictEqual(
      files.asked.filter((file) => file.endsWith('a.md')).length,
      1,
    );
    assert.deepStrictEqual(
      await nodeFilesOf(canvas, { nodes: [], edges: [] }, files),
      {},
    );
  });
});
