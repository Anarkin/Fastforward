import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  commitsStartingWith,
  findCommit,
  findCommits,
} from '../../../../../tools/git/main/commitLookup';
import { renamingRepository } from '../../../../helpers/gitFixtures';
import {
  commitText,
  objectId,
  removeFolder,
  tempFolder,
  type TempRepository,
} from '../../../../helpers/repositories';

const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

suite('Git commit lookup', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;
  let blob: string;

  beforeAll(async () => {
    ({ temp, rename, blob } = await renamingRepository('commitLookup'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  afterAll(() => removeFolder(cwd));

  test('finds the commits a hash starts with', async () => {
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, rename.slice(0, 7)),
      [rename],
    );
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, 'ffffff0'),
      [],
    );
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, rename.slice(0, 3)),
      [],
    );
    assert.deepStrictEqual(await commitsStartingWith(gitPath, cwd, 'main'), []);
  });

  test('says which commit a typed hash is', async () => {
    assert.deepStrictEqual(await findCommit(gitPath, cwd, rename.slice(0, 7)), {
      kind: 'found',
      hash: rename,
    });
    assert.deepStrictEqual(
      await findCommit(gitPath, cwd, rename.slice(0, 7).toUpperCase()),
      { kind: 'found', hash: rename },
    );
    assert.deepStrictEqual(await findCommit(gitPath, cwd, 'ffffff0'), {
      kind: 'none',
    });
    assert.deepStrictEqual(await findCommit(gitPath, cwd, blob.slice(0, 7)), {
      kind: 'none',
    });
    await temp.git('branch', 'fade', 'HEAD');
    try {
      assert.deepStrictEqual(await findCommit(gitPath, cwd, 'fade'), {
        kind: 'none',
      });
    } finally {
      await temp.git('branch', '-D', 'fade');
    }
  });

  test('reads the subject of a commit found by its hash in its own encoding', async () => {
    const folder = tempFolder('message');
    try {
      const message = path.join(folder, 'message.txt');
      fs.writeFileSync(message, Buffer.from('caf\xe9\n', 'latin1'));
      const hash = (
        await temp.git(
          '-c',
          'i18n.commitEncoding=ISO-8859-1',
          'commit-tree',
          'HEAD^{tree}',
          '-F',
          message,
        )
      ).trim();
      const { commits } = await findCommits(gitPath, cwd, hash.slice(0, 12));
      assert.deepStrictEqual(
        commits.map((commit) => [commit.hash, commit.subject]),
        [[hash, 'café']],
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('finds the one commit among other objects sharing its prefix, whatever kind of object the repository prefers, or says how many share it', async () => {
    const blobText = '476\n';
    const [found, other] = ['76', '2116'].map((message) =>
      commitText(emptyTree, message),
    );
    const prefix = objectId('blob', blobText).slice(0, 4);
    for (const text of [found, other]) {
      assert.ok(objectId('commit', text).startsWith(prefix));
    }
    const hash = objectId('commit', found);
    const folder = tempFolder('objects');
    try {
      const write = async (type: string, text: string) => {
        const file = path.join(folder, type);
        fs.writeFileSync(file, text);
        await temp.git('hash-object', '-t', type, '-w', file);
      };
      await write('blob', blobText);
      await write('commit', found);
      assert.deepStrictEqual(await findCommit(gitPath, cwd, prefix), {
        kind: 'found',
        hash,
      });
      await temp.git('config', 'core.disambiguate', 'blob');
      assert.deepStrictEqual(await findCommit(gitPath, cwd, prefix), {
        kind: 'found',
        hash,
      });
      await temp.git('config', '--unset', 'core.disambiguate');
      await write('commit', other);
      assert.deepStrictEqual(await findCommit(gitPath, cwd, prefix), {
        kind: 'ambiguous',
        count: 2,
      });
      const all = await findCommits(gitPath, cwd, prefix);
      assert.strictEqual(all.commits.length, 2);
      assert.ok(all.commits.some((commit) => commit.hash === hash));
      assert.strictEqual(all.more, 0);
      const limited = await findCommits(gitPath, cwd, prefix, 1);
      assert.strictEqual(limited.commits.length, 1);
      assert.strictEqual(limited.more, 1);
    } finally {
      removeFolder(folder);
    }
  });

  test('lists at most 20 commits sharing a prefix, counting the rest', async () => {
    const prefix = '0000';
    const texts = [
      66330, 82218, 163167, 165457, 204413, 272219, 337817, 428796, 449636,
      536741, 729867, 801315, 833667, 884169, 953508, 978456, 1010149, 1011515,
      1275593, 1281590, 1353900,
    ].map((message) => commitText(emptyTree, `${message}`));
    const folder = tempFolder('prefixed');
    try {
      const files = texts.map((text, index) => {
        assert.ok(objectId('commit', text).startsWith(prefix));
        const file = path.join(folder, `${index}`);
        fs.writeFileSync(file, text);
        return file;
      });
      await temp.git('hash-object', '-t', 'commit', '-w', ...files);
      const found = await findCommits(gitPath, cwd, prefix);
      assert.strictEqual(found.commits.length, 20);
      assert.strictEqual(found.more, 1);
    } finally {
      removeFolder(folder);
    }
  });
});
