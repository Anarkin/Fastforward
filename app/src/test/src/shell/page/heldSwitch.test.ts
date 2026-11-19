import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  holdingSwitches,
  type HeldPicture,
} from '../../../../shell/page/heldSwitch';
import type { ToWebview } from '../../../../shell/shared/protocol';

const tabs = (active: string | undefined): ToWebview => ({
  type: 'tabs',
  tabs: [],
  active,
});

const other: ToWebview = { type: 'tabHold', milliseconds: 300 };

function page(options: { readonly hold?: number; readonly plain?: true } = {}) {
  let active: string | undefined = 'one';
  const received: ToWebview[] = [];
  const pictures: {
    readonly update: () => void;
    readonly updated: () => void;
    skipped: boolean;
  }[] = [];
  const settles: { readonly within: number; readonly done: () => void }[] = [];
  const receive = holdingSwitches(
    (message) => {
      received.push(message);
      if (message.type === 'tabs') {
        ({ active } = message);
      }
    },
    {
      active: () => active,
      hold: () => options.hold ?? 300,
      settled: (within) =>
        new Promise((done) => {
          settles.push({ within, done });
        }),
    },
    options.plain
      ? {}
      : {
          startViewTransition: (update): HeldPicture => {
            const { promise, resolve } = Promise.withResolvers<undefined>();
            const picture = {
              update,
              updated: () => resolve(undefined),
              skipped: false,
            };
            pictures.push(picture);
            return {
              updateCallbackDone: promise,
              skipTransition: () => {
                picture.skipped = true;
              },
            };
          },
        },
  );
  return {
    receive,
    received,
    pictures,
    settles,
    later: () => new Promise((done) => setTimeout(done)),
  };
}

suite('Held switch', () => {
  test('hands on what the page receives as it comes while no tab is switched to', () => {
    const shell = page();
    shell.receive(other);
    shell.receive(tabs('one'));
    assert.deepStrictEqual(shell.received, [other, tabs('one')]);
    assert.strictEqual(shell.pictures.length, 0);
  });

  test('keeps the switch to another tab and all that comes after it until the picture of the tab left is taken, then hands them on in their order, so the page draws the tab switched to under that picture', () => {
    const shell = page();
    shell.receive(tabs('two'));
    shell.receive(other);
    assert.deepStrictEqual(shell.received, []);
    assert.strictEqual(shell.pictures.length, 1);
    shell.pictures[0].update();
    assert.deepStrictEqual(shell.received, [tabs('two'), other]);
    shell.receive(other);
    assert.deepStrictEqual(shell.received, [tabs('two'), other, other]);
  });

  test('shows the tab switched to once it has settled, given the hold of the settings to settle in', async () => {
    const shell = page({ hold: 450 });
    shell.receive(tabs('two'));
    shell.pictures[0].update();
    await shell.later();
    assert.strictEqual(shell.settles.length, 0);
    shell.pictures[0].updated();
    await shell.later();
    assert.deepStrictEqual(
      shell.settles.map(({ within }) => within),
      [450],
    );
    assert.strictEqual(shell.pictures[0].skipped, false);
    shell.settles[0].done();
    await shell.later();
    assert.strictEqual(shell.pictures[0].skipped, true);
  });

  test('holds no picture for the first tab shown, for a window left with no tab, with a hold of 0 and where the browser takes no picture', () => {
    const first = page();
    first.receive(tabs(undefined));
    first.receive(tabs('two'));
    assert.strictEqual(first.pictures.length, 0);
    assert.deepStrictEqual(first.received, [tabs(undefined), tabs('two')]);
    const off = page({ hold: 0 });
    off.receive(tabs('two'));
    assert.strictEqual(off.pictures.length, 0);
    assert.deepStrictEqual(off.received, [tabs('two')]);
    const plain = page({ plain: true });
    plain.receive(tabs('two'));
    assert.deepStrictEqual(plain.received, [tabs('two')]);
  });
});
