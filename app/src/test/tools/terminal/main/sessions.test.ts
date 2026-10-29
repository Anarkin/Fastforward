import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  flowLimits,
  type FlowLimits,
} from '../../../../tools/terminal/main/flowControl';
import type {
  HostEvent,
  ShellLaunch,
} from '../../../../tools/terminal/main/hostProtocol';
import { PtyHost } from '../../../../tools/terminal/main/sessions';
import { strings } from '../../../../shared/strings';
import { fakePtys, until } from '../../../fakePty';
import { fakeTimer } from '../../../fakeTimer';

const launch: ShellLaunch = {
  file: 'zsh',
  args: ['-l'],
  cwd: '/work',
  env: { TERM: 'xterm-256color' },
};

function host(limits: Partial<FlowLimits> = {}) {
  const ptys = fakePtys();
  const clock = fakeTimer();
  const events: HostEvent[] = [];
  const ptyHost = new PtyHost(
    ptys.spawn,
    (event) => events.push(event),
    { ...flowLimits, ...limits },
    clock.timer,
  );
  const start = (columns = 80, rows = 24) =>
    ptyHost.receive({ type: 'spawn', id: '1', launch, columns, rows });
  const attach = async (columns = 80, rows = 24) => {
    const before = events.length;
    ptyHost.receive({ type: 'attach', id: '1', columns, rows });
    await until(() =>
      events.slice(before).some((event) => event.type === 'screen'),
    );
    return events.slice(before).find((event) => event.type === 'screen');
  };
  const outputs = () =>
    events.flatMap((event) => (event.type === 'output' ? [event.data] : []));
  return { ptyHost, ptys, clock, events, start, attach, outputs };
}

suite('Terminal sessions', () => {
  test('starts the shell asked for at the size asked for', () => {
    const { ptys, start } = host();
    start(100, 30);
    const [pty] = ptys.spawned;
    assert.deepStrictEqual(
      [pty.launch, pty.columns, pty.rows],
      [launch, 100, 30],
    );
  });

  test('sends a page what the shell printed before it attached as the screen, and what it prints after as output', async () => {
    const { ptys, clock, events, start, attach, outputs } = host();
    start();
    ptys.last().print('before');
    await clock.fire();
    assert.deepStrictEqual(outputs(), []);
    const screen = await attach();
    assert.ok(
      screen?.type === 'screen' && screen.data.includes('before'),
      JSON.stringify(screen),
    );
    ptys.last().print('after');
    await clock.fire();
    assert.deepStrictEqual(outputs(), ['after']);
    assert.strictEqual(events.at(-1)?.type, 'output');
  });

  test('batches what the shell prints until the batch time passes, or sends it at once when the batch is full', async () => {
    const { ptys, clock, start, attach, outputs } = host({ batchChars: 6 });
    start();
    await attach();
    ptys.last().print('ab');
    ptys.last().print('cd');
    assert.deepStrictEqual(outputs(), []);
    assert.deepStrictEqual(
      clock.waiting().map((entry) => entry.ms),
      [flowLimits.batchMilliseconds],
    );
    await clock.fire();
    assert.deepStrictEqual(outputs(), ['abcd']);
    ptys.last().print('efghij');
    assert.deepStrictEqual(outputs(), ['abcd', 'efghij']);
  });

  test('holds what the shell prints while the screen is copied for a page, and sends it right after the screen', async () => {
    const { ptyHost, ptys, clock, events, start } = host();
    start();
    ptyHost.receive({ type: 'attach', id: '1', columns: 80, rows: 24 });
    ptys.last().print('meanwhile');
    await clock.fire();
    await until(() => events.some((event) => event.type === 'output'));
    const [screen, output] = events;
    assert.strictEqual(screen.type, 'screen');
    assert.ok(screen.type === 'screen' && !screen.data.includes('meanwhile'));
    assert.deepStrictEqual(output, {
      type: 'output',
      id: '1',
      data: 'meanwhile',
    });
  });

  test('sends one screen when a page attaches again before the first screen is copied', async () => {
    const { ptyHost, events, start, attach } = host();
    start();
    ptyHost.receive({ type: 'attach', id: '1', columns: 80, rows: 24 });
    await attach();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(
      events.filter((event) => event.type === 'screen').length,
      1,
    );
  });

  test('pauses the shell once the page falls behind by more than the high watermark, and resumes it once the page catches up below the low one', async () => {
    const { ptyHost, ptys, clock, start, attach } = host({
      highWatermark: 10,
      lowWatermark: 4,
    });
    start();
    await attach();
    const pty = ptys.last();
    pty.print('1234567890');
    await clock.fire();
    assert.strictEqual(pty.paused, false);
    pty.print('1');
    await clock.fire();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(pty.paused, true);
    ptyHost.receive({ type: 'ack', id: '1', chars: 6 });
    assert.strictEqual(pty.paused, true);
    ptyHost.receive({ type: 'ack', id: '1', chars: 2 });
    assert.strictEqual(pty.paused, false);
  });

  test('pauses the shell while its copy of the screen falls behind, even with no page attached, and resumes it once the copy catches up', async () => {
    const { ptys, clock, start } = host({ highWatermark: 10, lowWatermark: 4 });
    start();
    const pty = ptys.last();
    pty.print('12345678901');
    await clock.fire();
    assert.strictEqual(pty.paused, true);
    await until(() => !pty.paused);
  });

  test('stops waiting for a page that detaches, so a terminal in a hidden tab never stalls its shell', async () => {
    const { ptyHost, ptys, clock, start, attach } = host({
      highWatermark: 10,
      lowWatermark: 4,
    });
    start();
    await attach();
    const pty = ptys.last();
    pty.print('12345678901');
    await clock.fire();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(pty.paused, true);
    ptyHost.receive({ type: 'detach', id: '1' });
    assert.strictEqual(pty.paused, false);
  });

  test('writes what a page types to the shell, and resizes the shell and its screen copy only when the size changes', async () => {
    const { ptyHost, ptys, start, attach } = host();
    start();
    ptyHost.receive({ type: 'input', id: '1', data: 'ls\r' });
    ptyHost.receive({ type: 'resize', id: '1', columns: 80, rows: 24 });
    ptyHost.receive({ type: 'resize', id: '1', columns: 120, rows: 40 });
    await attach(120, 40);
    assert.deepStrictEqual(ptys.last().written, ['ls\r']);
    assert.deepStrictEqual(ptys.last().sizes, [[120, 40]]);
  });

  test('tells of an exit a while after it, so the last output comes first, with a line giving the exit code', async () => {
    const { ptys, clock, events, start, attach, outputs } = host();
    start();
    await attach();
    ptys.last().exit(3);
    assert.deepStrictEqual(
      clock.waiting().map((entry) => entry.ms),
      [flowLimits.exitMilliseconds],
    );
    ptys.last().print('last words');
    await clock.fire();
    assert.deepStrictEqual(outputs(), [
      `last words\r\n${strings.terminal.exited(3)}\r\n`,
    ]);
    assert.deepStrictEqual(events.at(-1), { type: 'exited', id: '1' });
    const screen = await attach();
    assert.ok(screen?.type === 'screen' && screen.exited);
  });

  test('starts the shell again in the same screen once it has exited, and leaves a running one be', async () => {
    const { ptyHost, ptys, clock, start, attach } = host();
    start();
    ptys.last().print('first shell');
    start();
    assert.strictEqual(ptys.spawned.length, 1);
    ptys.last().exit(0);
    await clock.fire();
    await clock.fire();
    ptyHost.receive({
      type: 'spawn',
      id: '1',
      launch,
      columns: 80,
      rows: 24,
    });
    assert.strictEqual(ptys.spawned.length, 2);
    const screen = await attach();
    assert.ok(
      screen?.type === 'screen' &&
        screen.data.includes('first shell') &&
        !screen.exited,
    );
  });

  test('tells why a shell could not start, as an exit', async () => {
    const events: HostEvent[] = [];
    const clock = fakeTimer();
    const ptyHost = new PtyHost(
      () => {
        throw new Error('File not found: nosh.');
      },
      (event) => events.push(event),
      flowLimits,
      clock.timer,
    );
    ptyHost.receive({
      type: 'spawn',
      id: '1',
      launch: { ...launch, file: 'nosh' },
      columns: 80,
      rows: 24,
    });
    ptyHost.receive({ type: 'attach', id: '1', columns: 80, rows: 24 });
    await until(() => events.some((event) => event.type === 'screen'));
    const screen = events.find((event) => event.type === 'screen');
    assert.ok(
      screen?.type === 'screen' &&
        screen.exited &&
        screen.data.includes("Couldn't start nosh. File not found: nosh."),
      JSON.stringify(screen),
    );
  });

  test('kills the shell and forgets it, so later messages about it do nothing', async () => {
    const { ptyHost, ptys, events, start } = host();
    start();
    ptyHost.receive({ type: 'kill', id: '1' });
    ptyHost.receive({ type: 'attach', id: '1', columns: 80, rows: 24 });
    ptyHost.receive({ type: 'input', id: '1', data: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(ptys.last().killed, true);
    assert.deepStrictEqual(ptys.last().written, []);
    assert.deepStrictEqual(events, []);
  });

  test('kills every shell when it is disposed', () => {
    const { ptyHost, ptys } = host();
    for (const id of ['1', '2']) {
      ptyHost.receive({ type: 'spawn', id, launch, columns: 80, rows: 24 });
    }
    ptyHost.dispose();
    assert.deepStrictEqual(
      ptys.spawned.map((pty) => pty.killed),
      [true, true],
    );
  });
});
