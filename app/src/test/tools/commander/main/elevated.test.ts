import * as assert from 'node:assert';
import * as net from 'node:net';
import { suite, test } from 'vitest';
import { elevatedFileSystem } from '../../../../tools/commander/main/elevated';
import type { FileSystem } from '../../../../tools/commander/main/fileSystem';
import {
  helperArguments,
  helperOf,
  newHelperAddress,
  runHelper,
  send,
} from '../../../../tools/commander/main/helper';
import type { Entry } from '../../../../tools/commander/shared/protocol';
import { waitFor } from '../../../fixtures';

const notes: Entry = {
  name: 'notes.txt',
  folder: false,
  link: false,
  hidden: false,
  size: 5,
  modified: 1,
};

const root = process.platform === 'win32' ? 'C:\\' : '/';
const locked = process.platform === 'win32' ? 'C:\\locked' : '/locked';

const files: FileSystem = {
  list: (folder) =>
    folder === locked
      ? Promise.reject(Object.assign(new Error('denied'), { code: 'EPERM' }))
      : Promise.resolve([notes]),
  drives: () => Promise.resolve([]),
};

suite('The elevated helper of the commander', () => {
  test('finds where to connect and with what in its own arguments only', () => {
    const address = newHelperAddress(process.platform);
    assert.deepStrictEqual(
      helperOf(['app.exe', ...helperArguments(address)]),
      address,
    );
    assert.strictEqual(helperOf(['app.exe', 'C:\\work']), undefined);
    assert.notDeepStrictEqual(newHelperAddress(process.platform), address);
  });

  test('lists folders for the app, failing as the folder fails, and stops once the app goes', async () => {
    let exited = false;
    const elevated = await elevatedFileSystem((address) => {
      runHelper(
        address,
        () => Promise.resolve(files),
        () => (exited = true),
      );
      return Promise.resolve(true);
    }, process.platform);
    assert.ok(elevated);

    assert.deepStrictEqual(await elevated.list(root), [notes]);
    await assert.rejects(elevated.list(locked), { code: 'EPERM' });

    elevated.close();
    await waitFor(() => exited, 'the helper to stop');
  });

  test('gives no file system when the user says no, or the helper never comes', async () => {
    assert.strictEqual(
      await elevatedFileSystem(() => Promise.resolve(false), process.platform),
      undefined,
    );
    assert.strictEqual(
      await elevatedFileSystem(
        () => Promise.resolve(true),
        process.platform,
        50,
      ),
      undefined,
    );
  });

  test('answers only the helper that knows the secret, not another program connecting first', async () => {
    let strangerClosed = false;
    const elevated = await elevatedFileSystem(async (address) => {
      const stranger = net.connect(address.pipe);
      stranger.on('close', () => (strangerClosed = true));
      stranger.on('error', () => {});
      send(stranger, { token: 'guessed' });
      await waitFor(() => strangerClosed, 'the stranger to be turned away');
      runHelper(
        address,
        () => Promise.resolve(files),
        () => {},
      );
      return true;
    }, process.platform);
    assert.ok(elevated);
    assert.deepStrictEqual(await elevated.list(root), [notes]);
    elevated.close();
  });

  test('tells the app when the helper stops, failing what it still waited for', async () => {
    let socketOfHelper: (() => void) | undefined;
    const elevated = await elevatedFileSystem((address) => {
      const slow: FileSystem = {
        list: () => new Promise(() => {}),
        drives: () => Promise.resolve([]),
      };
      runHelper(
        address,
        () => Promise.resolve(slow),
        () => {},
      );
      socketOfHelper = () => {
        process.nextTick(() => elevated?.close());
      };
      return Promise.resolve(true);
    }, process.platform);
    assert.ok(elevated && socketOfHelper);
    const waiting = elevated.list(root);
    socketOfHelper();
    await assert.rejects(waiting);
    await elevated.closed;
  });
});
