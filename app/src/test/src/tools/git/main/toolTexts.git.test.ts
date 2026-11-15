import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { type TempRepository } from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import {
  type Connection,
  closeViews,
  openView,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { FakePage } from '../../../../helpers/fakePage';
import { removeFolder } from '../../../../helpers/tempFolders';

suite('Git tool sending the texts of a diff', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  suite('with its tab open', () => {
    let page: FakePage;
    let connection: Connection;

    beforeEach(async () => {
      ({ page, connection } = await openView(log, [repository.root]));
    });

    afterEach(() => connection.dispose());

    test('sends the texts a diff asks for, an uncommitted new side read from disk, each side of a file once however often asked for, and none of a side over 2 MB, from git or from disk', async () => {
      const file = path.join(repository.root, 'texts.ts');
      fs.writeFileSync(file, 'old\n');
      try {
        const [blob] = await repository.resolve(
          (await repository.git('hash-object', '-w', file)).trim(),
        );
        fs.writeFileSync(file, 'new\n');
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 3,
          texts: [
            { path: 'texts.ts', side: 'old', blob },
            { path: 'texts.ts', side: 'new', blob },
            { path: 'other.ts', side: 'old', blob: '0'.repeat(39) + '1' },
          ],
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [
            ['old', 'old\n'],
            ['new', 'new\n'],
            ['old', undefined],
          ],
        );
        assert.strictEqual(page.last('texts')?.diff, 3);
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 4,
          texts: Array.from({ length: 1000 }, (_, at) => ({
            path: 'texts.ts',
            side: 'new' as const,
            blob: `${at}`,
          })),
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [['new', 'new\n']],
        );
        fs.writeFileSync(file, 'x'.repeat(2 * 1024 * 1024 + 1));
        const [large] = await repository.resolve(
          (await repository.git('hash-object', '-w', file)).trim(),
        );
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 4,
          texts: [
            { path: 'texts.ts', side: 'old', blob: large },
            { path: 'texts.ts', side: 'new', blob: large },
          ],
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [
            ['old', undefined],
            ['new', undefined],
          ],
        );
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    test('reads ahead the diff of a commit the page asks for without selecting it, and the texts of its blobs, so the page can color it before it is shown', async () => {
      const file = path.join(repository.root, 'ahead.ts');
      fs.writeFileSync(file, 'ahead\n');
      try {
        const blob = (await repository.git('hash-object', '-w', file)).trim();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        page.clear();
        await connection.receive({
          type: 'prefetchTexts',
          root: repository.root,
          hash: fixture.b,
          texts: [{ path: 'ahead.ts', side: 'new', blob }],
        });
        await connection.receive({
          type: 'prefetchDiff',
          root: repository.root,
          hash: fixture.b,
        });
        await connection.receive({
          type: 'prefetchTexts',
          root: repository.root,
          hash: fixture.b,
          texts: [{ path: 'ahead.ts', side: 'new', blob }],
        });
        assert.deepStrictEqual(
          page.messages
            .map(({ type }) => type)
            .filter((type) =>
              ['files', 'diff', 'prefetchedDiff', 'prefetchedTexts'].includes(
                type,
              ),
            ),
          ['prefetchedDiff', 'prefetchedTexts'],
        );
        assert.strictEqual(page.last('prefetchedDiff')?.hash, fixture.b);
        assert.deepStrictEqual(
          page.last('prefetchedTexts')?.texts.map(({ text }) => text),
          ['ahead\n'],
        );
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    test('sends the texts of blobs asked for again without reading them from git again', async () => {
      const file = path.join(repository.root, 'kept.ts');
      fs.writeFileSync(file, 'kept\n');
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      try {
        const blob = (await repository.git('hash-object', '-w', file)).trim();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        let gits = 0;
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            gits++;
            return spawn(...args);
          },
        );
        for (const diff of [1, 2]) {
          page.clear();
          await connection.receive({
            type: 'loadTexts',
            root: repository.root,
            hash: fixture.merge,
            diff,
            texts: [{ path: 'kept.ts', side: 'new', blob }],
          });
          assert.deepStrictEqual(
            page.last('texts')?.texts.map(({ text }) => text),
            ['kept\n'],
          );
        }
        assert.strictEqual(gits, 1);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        fs.rmSync(file, { force: true });
      }
    });
  });
});
