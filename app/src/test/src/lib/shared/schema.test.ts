import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bounded,
  count,
  flag,
  keyed,
  list,
  never,
  oneOf,
  optional,
  record,
  set,
  text,
  type Infer,
} from '../../../../lib/shared/schema';

const roundTrip = <T>(
  schema: {
    decode: (value: unknown) => T | undefined;
    encode: (value: T) => unknown;
  },
  value: T,
) => schema.decode(JSON.parse(JSON.stringify(schema.encode(value))));

suite('Schemas of what a view keeps', () => {
  test('takes text within its bound, and nothing else', () => {
    const name = text({ max: 5 });
    assert.deepStrictEqual(
      ['adam', 'adamus', 7, null, undefined].map(name.decode),
      ['adam', undefined, undefined, undefined, undefined],
    );
    assert.strictEqual(name.encode('adamus'), undefined);
    assert.strictEqual(text().decode('x'.repeat(10_000))?.length, 10_000);
  });

  test('takes counts in their range, whole when asked, as a share between 0 and 1 or a place in a list, and no number that is not finite', () => {
    const share = count({ min: 0, max: 1 });
    assert.deepStrictEqual(
      [0, 0.3, 1, 1.2, -0.1, Number.NaN, Infinity, '0.5'].map(share.decode),
      [0, 0.3, 1, undefined, undefined, undefined, undefined, undefined],
    );
    const place = count({ min: 0, integer: true });
    assert.deepStrictEqual([0, 12, 1.5, -1, 2 ** 60].map(place.decode), [
      0,
      12,
      undefined,
      undefined,
      undefined,
    ]);
    assert.strictEqual(count().decode(-12.5), -12.5);
    assert.strictEqual(share.encode(7), undefined);
  });

  test('takes flags and one of the values named, as the side or layout of a tab', () => {
    const layout = oneOf(['details', 'thumbnails']);
    assert.deepStrictEqual([true, false, 'true', 0].map(flag().decode), [
      true,
      false,
      undefined,
      undefined,
    ]);
    assert.deepStrictEqual(
      ['details', 'thumbnails', 'tiles', 1].map(layout.decode),
      ['details', 'thumbnails', undefined, undefined],
    );
  });

  test('takes a record whole only when each field it requires is well formed, dropping a field it may do without alone, and never a field never sent, as the password of a pack', () => {
    const pack = record({
      format: oneOf(['zip', '7z']),
      level: optional(count({ min: 0, max: 9, integer: true })),
      archive: optional(text()),
      password: never<string>(),
    });
    const packed: Infer<typeof pack> = {
      format: 'zip',
      level: 5,
      password: 'secret',
    };
    assert.deepStrictEqual(pack.encode(packed), { format: 'zip', level: 5 });
    assert.deepStrictEqual(roundTrip(pack, packed), {
      format: 'zip',
      level: 5,
    });
    assert.deepStrictEqual(
      pack.decode({ format: '7z', level: 12, archive: 3, password: 'x' }),
      { format: '7z' },
    );
    assert.deepStrictEqual(
      [{ level: 5 }, { format: 'rar' }, [], null, 'zip'].map(pack.decode),
      [undefined, undefined, undefined, undefined, undefined],
    );
    const inherited: unknown = Object.create({ format: 'zip' });
    assert.strictEqual(pack.decode(inherited), undefined);
  });

  test('takes a list item by item, dropping those that are not well formed and keeping the last ones within its bound, as the twenty places of a diff, or whole or not at all, as the marks of a side', () => {
    const places = list(count({ integer: true }), { max: 20 });
    const many = Array.from({ length: 30 }, (_, index) => index);
    assert.deepStrictEqual(places.decode([1, 'x', 2, 2.5]), [1, 2]);
    assert.deepStrictEqual(places.decode(many), many.slice(10));
    assert.deepStrictEqual(places.encode(many), many.slice(10));
    assert.strictEqual(places.decode({ length: 0 }), undefined);

    const marks = list(text(), { max: 5000, whole: true });
    const names = Array.from({ length: 5000 }, (_, index) => `${index}.txt`);
    assert.deepStrictEqual(marks.decode(names), names);
    assert.strictEqual(marks.decode([...names, 'one more']), undefined);
    assert.strictEqual(marks.encode([...names, 'one more']), undefined);
    assert.strictEqual(marks.decode(['a', 1]), undefined);
  });

  test('keeps a Map and a Set as their entries, the last ones within its bound, as the last thousand folders toggled', () => {
    const scrolls = keyed(text(), count({ min: 0 }));
    const kept = new Map([
      ['left', 40],
      ['right', 0],
    ]);
    assert.deepStrictEqual(scrolls.encode(kept), [
      ['left', 40],
      ['right', 0],
    ]);
    assert.deepStrictEqual(roundTrip(scrolls, kept), kept);
    assert.deepStrictEqual(
      scrolls.decode([['left', -1], 'x', ['right', 5], ['a', 1, 2]]),
      new Map([['right', 5]]),
    );

    const folders = set(text(), { max: 1000 });
    const toggled = new Set(
      Array.from({ length: 1500 }, (_, index) => `folder ${index}`),
    );
    const back = roundTrip(folders, toggled);
    assert.strictEqual(back?.size, 1000);
    assert.ok(back.has('folder 1499') && !back.has('folder 499'));
    assert.strictEqual(folders.decode('folder'), undefined);
  });

  test('keeps what it bounds whole or not at all by the length of what it encodes, as a dialog naming many items within 128K characters', () => {
    const dialog = bounded(record({ names: list(text()) }), {
      chars: 128 * 1024,
    });
    const few = { names: ['a.txt', 'b.txt'] };
    const many = {
      names: Array.from(
        { length: 20_000 },
        (_, index) => `a file with a long name, the ${index}th.txt`,
      ),
    };
    assert.deepStrictEqual(roundTrip(dialog, few), few);
    assert.strictEqual(dialog.encode(many), undefined);
    assert.strictEqual(dialog.decode(many), undefined);
  });
});
