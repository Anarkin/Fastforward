import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  filesReadAtOnce,
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
  links: Readonly<Record<string, string>> = {},
): FileAccess & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    realPath: (file) => Promise.resolve(links[file] ?? file),
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

  test('reads the head of a file of UTF-8 as UTF-8 though it was cut inside a character, rather than in the code page of the system', () => {
    const text = 'Ünïcödé\n日本語 ü';
    const bytes = Buffer.from(text);
    assert.strictEqual(
      shownText(bytes.subarray(0, bytes.length - 1), false, 'windows-1252'),
      'Ünïcödé',
    );
  });

  test('reads the files of a canvas of many file nodes a few at a time, as each holds a file open and thousands at once ran out of the files the system lets a process hold', async () => {
    const canvas = path.join(root, 'plan.canvas');
    const names = Array.from({ length: 200 }, (_, at) => `notes/${at}.md`);
    const files = access(
      Object.fromEntries(
        names.map((name) => [path.join(root, name), `# ${name}`]),
      ),
      [],
    );
    let reading = 0;
    let most = 0;
    const counted: FileAccess = {
      ...files,
      readHead: async (file, bytes) => {
        reading += 1;
        most = Math.max(most, reading);
        await new Promise((resolve) => setTimeout(resolve, 0));
        try {
          return await files.readHead(file, bytes);
        } finally {
          reading -= 1;
        }
      },
    };
    const read = await nodeFilesOf(
      canvas,
      {
        nodes: names.map((name, at) => fileNode(`${at}`, name)),
        edges: [],
      },
      counted,
    );
    assert.strictEqual(Object.keys(read).length, names.length);
    assert.ok(most <= filesReadAtOnce, String(most));
  });

  test('reads no file of a node whose real path leaves the vault, as a link inside it to a file outside', async () => {
    const canvas = path.join(root, 'plan.canvas');
    const linked = path.join(root, 'notes', 'k.md');
    const outside = path.resolve('/home/me/.ssh/id_rsa');
    const inside = path.join(root, 'notes', 'kept.md');
    const files = access(
      { [linked]: 'secret', [outside]: 'secret', [inside]: 'kept' },
      [],
      { [linked]: outside, [path.join(root, 'notes', 'alias.md')]: inside },
    );
    assert.deepStrictEqual(
      await nodeFilesOf(
        canvas,
        {
          nodes: [fileNode('k', 'notes/k.md'), fileNode('a', 'notes/alias.md')],
          edges: [],
        },
        files,
      ),
      {
        'notes/alias.md': {
          path: path.join(root, 'notes', 'alias.md'),
          text: 'kept',
        },
      },
    );
    assert.ok(!files.asked.includes(linked));
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
