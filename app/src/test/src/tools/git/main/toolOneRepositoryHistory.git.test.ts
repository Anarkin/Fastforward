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
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { soloKey } from '../../../../../tools/git/main/storage';
import type { GitTool } from '../../../../../tools/git/main/tool';
import { FakeStore } from '../../../../helpers/fakeStore';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import {
  type Connection,
  gitState,
  closeViews,
  gate,
  idleOnlyOnceOpened,
  openView,
  stubMethod,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { FakePage } from '../../../../helpers/fakePage';

suite('Git tool of one repository', () => {
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
    let fastforward: GitTool;
    let page: FakePage;
    let connection: Connection;
    let store: FakeStore;

    beforeEach(async () => {
      ({
        view: fastforward,
        page,
        connection,
        store,
      } = await openView(log, [repository.root]));
    });

    afterEach(() => connection.dispose());

    test('starts with no commit selected the first time a tab opens, and opens again with none once the commit is deselected', async () => {
      assert.ok(page.last('commits'));
      assert.strictEqual(page.last('reveal'), undefined);
      assert.strictEqual(page.last('files'), undefined);

      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: undefined,
      });
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('reveal'), undefined);
      assert.strictEqual(page.last('files'), undefined);
      assert.strictEqual(page.last('diff'), undefined);
    });

    test('is idle only once the messages it was handling are handled, also after the page closed', async () => {
      const held = gate();
      let handling = false;
      stubMethod(fastforward, 'handle', async (original, ...args) => {
        handling = true;
        await held.opened;
        return original(...args);
      });
      const handled = connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      await waitFor(() => handling, 'the message to be handled');
      connection.dispose();
      await idleOnlyOnceOpened(fastforward, held);
      await handled;
    });

    test('is idle only once the steps back and forward of a commit selected are sent', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      const held = gate();
      let sending = false;
      stubMethod(fastforward, 'sendNavigation', async (original, ...args) => {
        sending = true;
        await held.opened;
        return original(...args);
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      assert.ok(sending);
      await idleOnlyOnceOpened(fastforward, held);
    });

    test('reopens at the position of the selected commit', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      page.clear();
      await connection.receive({ type: 'ready' });
      const replayed = page.messages.find(
        (message) => message.type === 'commits',
      );
      assert.strictEqual(replayed?.selectedIndex, 1);
    });

    test('shows the last selected commit when an earlier one answers last', async () => {
      const held = gate();
      let waiting = false;
      stubMethod(fastforward, 'patchOf', async (original, ...args) => {
        if (args[1] === workingTreeHash) {
          waiting = true;
          await held.opened;
        }
        return original(...args);
      });
      const first = connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await waitFor(() => waiting, 'the working tree diff');
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      held.open();
      await first;
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      assert.strictEqual(page.last('diff')?.hash, fixture.b);
    });

    test('takes a root the page spells another way as the one of its tab, adding no tab for it', async () => {
      const spelled = `${repository.root}${path.sep}.`;
      await connection.receive({ type: 'setSolo', root: spelled, solo: true });
      try {
        assert.deepStrictEqual(gitState(store).get(soloKey), {
          [repository.root]: true,
        });
        await connection.receive({
          type: 'scrolled',
          root: spelled,
          hash: fixture.b,
          offset: 3,
          report: 1,
        });
        page.clear();
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        assert.strictEqual(page.last('commits')?.scrollTarget?.offset, 3);
      } finally {
        await gitState(store).update(soloKey, {});
      }
    });

    test('refreshes once at a time, without sending an unchanged diff', async () => {
      let calls = 0;
      let running = 0;
      let most = 0;
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        calls++;
        running++;
        most = Math.max(most, running);
        try {
          await original(...args);
        } finally {
          running--;
        }
      });
      fs.writeFileSync(path.join(repository.root, 'draft.txt'), 'draft\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('diff')?.patch.includes('+draft'));
        await connection.refresh();
        calls = 0;
        most = 0;
        page.clear();
        await Promise.all([connection.refresh(), connection.refresh()]);
        assert.strictEqual(most, 1);
        assert.ok(calls >= 2);
        assert.ok(page.last('workingTree'));
        assert.strictEqual(page.last('files'), undefined);
        assert.strictEqual(page.last('diff'), undefined);
        assert.strictEqual(page.last('error'), undefined);
      } finally {
        fs.rmSync(path.join(repository.root, 'draft.txt'));
      }
    });

    test('sends a diff asked for again while a refresh finds it unchanged', async () => {
      fs.writeFileSync(path.join(repository.root, 'one.txt'), 'one\n');
      fs.writeFileSync(path.join(repository.root, 'two.txt'), 'two\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'selectFile',
          root: repository.root,
          hash: workingTreeHash,
          path: 'one.txt',
        });
        assert.strictEqual(page.last('diff')?.path, 'one.txt');
        const held = gate();
        let waiting = 0;
        stubMethod(fastforward, 'patchOf', async (original, ...args) => {
          if (waiting < 2) {
            waiting++;
            await held.opened;
          }
          return original(...args);
        });
        page.clear();
        const asked = Promise.all([
          connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: 'two.txt',
          }),
          connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: 'one.txt',
          }),
        ]);
        await waitFor(() => waiting === 2, 'the asked for diffs');
        await connection.refresh();
        held.open();
        await asked;
        assert.strictEqual(page.last('diff')?.path, 'one.txt');
      } finally {
        fs.rmSync(path.join(repository.root, 'one.txt'));
        fs.rmSync(path.join(repository.root, 'two.txt'));
      }
    });

    test('sends the files and diff again when the shown commit is selected again', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.merge);
      page.clear();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.merge);
      assert.strictEqual(page.last('diff')?.hash, fixture.merge);
    });
  });
});
