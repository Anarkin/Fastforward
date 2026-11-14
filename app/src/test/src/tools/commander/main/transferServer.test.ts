import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { transferServer } from '../../../../../tools/commander/main/transferServer';
import type {
  TransferCommand,
  TransferEvent,
} from '../../../../../tools/commander/main/transferProtocol';
import { removeFolder, tempFolder } from '../../../../support/repositories';
import { waitFor } from '../../../../support/fixtures';

let folder: string;
let source: string;
let target: string;

beforeEach(() => {
  folder = tempFolder('transfer-server');
  source = path.join(folder, 'source');
  target = path.join(folder, 'target');
  fs.mkdirSync(source);
  fs.mkdirSync(target);
});

afterEach(() => removeFolder(folder));

const forged = (json: string): TransferCommand => JSON.parse(json);

function served() {
  const events: TransferEvent[] = [];
  const receive = transferServer((event) => events.push(event));
  const ended = () => events.some((event) => event.type === 'done');
  return { events, receive, ended };
}

suite('Transfer server', () => {
  test('runs the plan it is sent, telling of its progress and its end', async () => {
    fs.writeFileSync(path.join(source, 'a.txt'), 'a');
    const { events, receive, ended } = served();

    receive({
      type: 'start',
      plan: { sources: [path.join(source, 'a.txt')], target, move: false },
    });
    await waitFor(ended, 'the copy to end');

    assert.strictEqual(
      fs.readFileSync(path.join(target, 'a.txt'), 'utf8'),
      'a',
    );
    assert.deepStrictEqual(events.at(-1), { type: 'done', stopped: false });
    assert.ok(events.some((event) => event.type === 'progress'));
  });

  test('waits for the answer to a clash it tells of, and stops at once when told to while it waits', async () => {
    for (const name of ['a.txt', 'b.txt']) {
      fs.writeFileSync(path.join(source, name), `new ${name}`);
      fs.writeFileSync(path.join(target, name), `old ${name}`);
    }
    const first = served();
    first.receive({
      type: 'start',
      plan: {
        sources: [path.join(source, 'a.txt'), path.join(source, 'b.txt')],
        target,
        move: false,
      },
    });
    await waitFor(
      () => first.events.some((event) => event.type === 'clash'),
      'the first clash to be told of',
    );
    first.receive({
      type: 'answer',
      reply: { answer: 'overwrite', all: false },
    });
    await waitFor(
      () => first.events.filter((event) => event.type === 'clash').length > 1,
      'the second clash to be told of',
    );
    first.receive({ type: 'stop' });
    await waitFor(first.ended, 'the copy to stop');

    assert.deepStrictEqual(first.events.at(-1), {
      type: 'done',
      stopped: true,
    });
    assert.strictEqual(
      fs.readFileSync(path.join(target, 'a.txt'), 'utf8'),
      'new a.txt',
    );
    assert.strictEqual(
      fs.readFileSync(path.join(target, 'b.txt'), 'utf8'),
      'old b.txt',
    );
  });

  test('tells of an error that ended a transfer, as its end', async () => {
    const { events, receive, ended } = served();

    receive(
      forged(
        JSON.stringify({
          type: 'start',
          plan: {
            sources: [path.join(source, 'a.txt')],
            target: 7,
            move: false,
          },
        }),
      ),
    );
    await waitFor(ended, 'the transfer to end');

    const last = events.at(-1);
    assert.ok(last?.type === 'done' && last.error !== undefined);
  });
});
