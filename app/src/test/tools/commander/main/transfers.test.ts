import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Notice } from '../../../../shell/main/shell';
import {
  Transfers,
  type TransferAsk,
  type TransferListener,
} from '../../../../tools/commander/main/transfers';
import type {
  TransferCommand,
  TransferEvent,
} from '../../../../tools/commander/main/transferProtocol';
import type { TransferView } from '../../../../tools/commander/shared/transfers';
import { strings } from '../../../../shared/strings';

const root = path.resolve('/');
const source = path.join(root, 'source');
const target = path.join(root, 'target');

function ask(names: string[], move = false): TransferAsk {
  return {
    plan: {
      sources: names.map((name) => path.join(source, name)),
      target,
      move,
    },
    folder: source,
    names,
  };
}

function transfers() {
  const shown: (TransferView | undefined)[] = [];
  const notices: Notice[] = [];
  const finished: TransferAsk[] = [];
  const processes: {
    readonly commands: TransferCommand[];
    readonly listener: TransferListener;
    disposed: boolean;
  }[] = [];
  const coordinator = new Transfers(
    (listener) => {
      const started = {
        commands: [] as TransferCommand[],
        listener,
        disposed: false,
      };
      processes.push(started);
      return {
        send: (command) => started.commands.push(command),
        dispose: () => {
          started.disposed = true;
        },
      };
    },
    {
      show: (view) => shown.push(view),
      notice: (notice) => notices.push(notice),
      finished: (done) => finished.push(done),
    },
  );
  const tell = (index: number, event: TransferEvent) =>
    processes[index].listener.event(event);
  const last = () => shown.at(-1);
  return { coordinator, shown, notices, finished, processes, tell, last };
}

const progress = {
  files: 1,
  totalFiles: 2,
  bytes: 10,
  totalBytes: 20,
  current: 'a.txt',
};

const clash = {
  name: 'a.txt',
  source: { size: 1, modified: 2 },
  target: { size: 3, modified: 4 },
};

suite('Transfers', () => {
  test('starts each copy or move in a process of its own, shows it counting and then its progress, and closes its dialog once done without a word, as it was shown', () => {
    const { coordinator, processes, tell, last, notices, finished } =
      transfers();
    const asked = ask(['a.txt', 'b.txt']);

    coordinator.start(asked);

    assert.deepStrictEqual(processes[0].commands, [
      { type: 'start', plan: asked.plan },
    ]);
    assert.deepStrictEqual(last(), {
      id: 1,
      move: false,
      items: 2,
      target,
      stopping: false,
    });
    tell(0, { type: 'progress', progress });
    assert.deepStrictEqual(last()?.progress, progress);
    tell(0, { type: 'done', stopped: false });
    assert.strictEqual(last(), undefined);
    assert.ok(processes[0].disposed);
    assert.deepStrictEqual(notices, []);
    assert.deepStrictEqual(finished, [asked]);
  });

  test('keeps a transfer going once its dialog is closed, showing the one started before it again, and says once it is done', () => {
    const { coordinator, tell, last, notices } = transfers();
    coordinator.start(ask(['a.txt']));
    coordinator.start(ask(['b.txt', 'c.txt'], true));
    assert.strictEqual(last()?.id, 2);

    coordinator.hide(2);
    assert.strictEqual(last()?.id, 1);
    coordinator.hide(1);
    assert.strictEqual(last(), undefined);
    tell(1, { type: 'done', stopped: false });
    tell(0, { type: 'done', stopped: false });

    assert.deepStrictEqual(notices, [
      {
        level: 'info',
        message: strings.commander.moved(strings.commander.items(2), target),
      },
      {
        level: 'info',
        message: strings.commander.copied(
          strings.commander.oneItem('a.txt'),
          target,
        ),
      },
    ]);
  });

  test('shows a transfer that asks about an item there already, its dialog closed or not, takes only an answer to the question it asks, and sends it on', () => {
    const { coordinator, processes, tell, last } = transfers();
    coordinator.start(ask(['a.txt']));
    coordinator.start(ask(['b.txt']));
    coordinator.hide(1);
    coordinator.hide(2);

    tell(0, { type: 'clash', clash });
    assert.deepStrictEqual(last()?.clash, { ...clash, asked: 1 });
    assert.strictEqual(last()?.id, 1);

    coordinator.answer(1, 2, 'overwrite', false);
    coordinator.answer(1, 1, 'replace', false);
    coordinator.answer(1, 1, 'skip', 'yes');
    coordinator.answer(2, 1, 'skip', false);
    assert.deepStrictEqual(processes[0].commands.slice(1), []);
    assert.deepStrictEqual(processes[1].commands.slice(1), []);

    coordinator.answer(1, 1, 'keepBoth', true);
    assert.deepStrictEqual(processes[0].commands.slice(1), [
      { type: 'answer', reply: { answer: 'keepBoth', all: true } },
    ]);
    assert.strictEqual(last()?.clash, undefined);
    assert.strictEqual(last()?.id, 1);
  });

  test('stops a transfer when told to, or when its dialog is closed while it asks, showing it stopping until its process ends, then without a word', () => {
    const { coordinator, processes, tell, last, notices } = transfers();
    coordinator.start(ask(['a.txt']));
    coordinator.start(ask(['b.txt']));

    coordinator.stop(1);
    coordinator.stop(1);
    assert.deepStrictEqual(processes[0].commands.slice(1), [{ type: 'stop' }]);
    tell(1, { type: 'clash', clash });
    coordinator.hide(2);
    assert.deepStrictEqual(processes[1].commands.slice(1), [{ type: 'stop' }]);
    assert.deepStrictEqual(
      { id: last()?.id, stopping: last()?.stopping, clash: last()?.clash },
      { id: 2, stopping: true, clash: undefined },
    );

    tell(1, { type: 'done', stopped: true });
    tell(0, { type: 'done', stopped: true });
    assert.strictEqual(last(), undefined);
    assert.deepStrictEqual(notices, []);
  });

  test('says which item could not be copied or moved and why, or how many and the first of them, once done', () => {
    const { coordinator, tell, notices } = transfers();
    coordinator.start(ask(['a.txt']));
    coordinator.start(ask(['b.txt', 'c.txt', 'd.txt'], true));

    tell(0, { type: 'failed', name: 'a.txt', reason: 'It is in use' });
    tell(0, { type: 'done', stopped: false });
    tell(1, { type: 'failed', name: 'b.txt', reason: 'Access is denied' });
    tell(1, { type: 'failed', name: 'c.txt', reason: 'It is in use' });
    tell(1, { type: 'failed', name: 'd.txt', reason: 'It is in use' });
    tell(1, { type: 'done', stopped: false });

    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.copyFailed('a.txt', 'It is in use'),
      },
      {
        level: 'error',
        message: strings.commander.moveFailedMany(
          3,
          'b.txt',
          'Access is denied',
        ),
      },
    ]);
  });

  test('says a transfer stopped when its process ends before it does, or it ends in an error, and takes nothing from it afterwards', () => {
    const { coordinator, processes, tell, last, notices, finished } =
      transfers();
    coordinator.start(ask(['a.txt']));
    coordinator.start(ask(['b.txt'], true));

    processes[0].listener.stopped(1);
    tell(0, { type: 'done', stopped: false });
    tell(1, { type: 'done', stopped: false, error: 'Something broke' });

    assert.strictEqual(last(), undefined);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.copyingStopped(target) },
      { level: 'error', message: strings.commander.movingStopped(target) },
    ]);
    assert.strictEqual(finished.length, 2);
  });

  test('shows the transfer it shows again to a page loaded anew, and ends every process on quitting', () => {
    const { coordinator, processes, shown, last } = transfers();
    coordinator.start(ask(['a.txt']));
    coordinator.start(ask(['b.txt']));
    const before = shown.length;

    coordinator.resend();
    assert.strictEqual(shown.length, before + 1);
    assert.strictEqual(last()?.id, 2);
    coordinator.quit();
    assert.deepStrictEqual(
      processes.map((each) => each.disposed),
      [true, true],
    );
  });
});
