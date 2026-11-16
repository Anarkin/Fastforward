import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { TabLife } from '../../../../lib/page/tabLife';
import { count, optional, record } from '../../../../lib/shared/schema';

const schema = record({ place: optional(count()) });

function life(handed: ReadonlyMap<string, string> = new Map()) {
  const places = new Map<string, number>();
  const kept: [string, string][] = [];
  const forgotten: string[] = [];
  let shown: string | undefined;
  const tabs = new TabLife(
    {
      of: (tab) => handed.get(tab),
      keep: (tab, view) => kept.push([tab, view]),
    },
    schema,
    {
      viewOf: (tab) => ({ place: places.get(tab) }),
      restore: (tab, view) => {
        if (view.place === undefined) {
          places.delete(tab);
        } else {
          places.set(tab, view.place);
        }
      },
      forget: (tab) => {
        places.delete(tab);
        forgotten.push(tab);
      },
    },
    () => shown,
  );
  const show = (tab: string | undefined) => {
    const leaving = shown;
    if (tab !== undefined) {
      tabs.showing(tab, leaving);
    }
    shown = tab;
    tabs.settled(leaving, shown);
  };
  return { tabs, places, kept, forgotten, show };
}

suite('Life of a tab on its page', () => {
  test('brings a tab back from the view handed to the page as it is shown from another tab, and not while it stays shown', () => {
    const { places, show } = life(new Map([['1', '{"place":7}']]));
    show('1');
    assert.strictEqual(places.get('1'), 7);
    places.set('1', 9);
    show('1');
    assert.strictEqual(places.get('1'), 9);
  });

  test('sends the view of a tab once it is left, and none of a tab it does not know', () => {
    const { tabs, places, kept, show } = life();
    show('1');
    places.set('1', 4);
    show('2');
    assert.deepStrictEqual(kept, [['1', '{"place":4}']]);
    assert.strictEqual(tabs.release('9', '2'), undefined);
  });

  test('gives the view of a tab released at once and forgets it, or forgets a tab released while shown only once it is left', () => {
    const { tabs, places, forgotten, show } = life();
    show('1');
    places.set('1', 3);
    show('2');
    places.set('2', 5);
    assert.strictEqual(tabs.release('1', '2'), '{"place":3}');
    assert.deepStrictEqual(forgotten, ['1']);
    assert.strictEqual(tabs.release('2', '2'), '{"place":5}');
    assert.deepStrictEqual(forgotten, ['1']);
    show(undefined);
    assert.deepStrictEqual(forgotten, ['1', '2']);
  });

  test('forgets a tab closed, and takes nothing of a view handed that is not well formed', () => {
    const { tabs, places, forgotten, show } = life(
      new Map([
        ['1', '{"place":"far"}'],
        ['2', 'not json'],
      ]),
    );
    show('1');
    show('2');
    assert.deepStrictEqual([...places], []);
    tabs.closed('1');
    assert.deepStrictEqual(forgotten, ['1']);
  });
});
