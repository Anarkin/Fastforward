import * as assert from 'node:assert';
import { BlobTexts } from '../../git/blobTexts';

function reader(texts: Readonly<Record<string, string>>) {
  const asked: string[][] = [];
  const read = (ids: readonly string[]) => {
    asked.push([...ids]);
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => (id in texts ? [[id, texts[id] ?? '']] : [])),
      ),
    );
  };
  return { asked, read };
}

suite('Texts of blobs', () => {
  test('reads only the blobs it does not know, each once, keeping what has no text unread', async () => {
    const kept = new BlobTexts(100);
    const { asked, read } = reader({ a: 'one', b: 'two' });
    assert.deepStrictEqual(
      await kept.read(['a', 'b', 'a', 'gone'], read),
      new Map([
        ['a', 'one'],
        ['b', 'two'],
      ]),
    );
    assert.deepStrictEqual(
      await kept.read(['b', 'a', 'gone'], read),
      new Map([
        ['b', 'two'],
        ['a', 'one'],
      ]),
    );
    assert.deepStrictEqual(asked, [['a', 'b', 'gone'], ['gone']]);
  });

  test('forgets the texts read least recently once they pass its size, and never keeps one larger than it', async () => {
    const kept = new BlobTexts(10);
    const { asked, read } = reader({
      a: 'aaaa',
      b: 'bbbb',
      c: 'cccc',
      huge: 'x'.repeat(11),
    });
    await kept.read(['a', 'b'], read);
    await kept.read(['a'], read);
    await kept.read(['c'], read);
    await kept.read(['huge'], read);
    asked.length = 0;
    await kept.read(['a', 'b', 'c', 'huge'], read);
    assert.deepStrictEqual(asked, [['b', 'huge']]);
  });

  test('returns each text it knew when asked, though keeping those read with it, or by another read meanwhile, forgets it', async () => {
    const kept = new BlobTexts(10);
    const { read } = reader({
      a: 'aaaa',
      b: 'bbbb',
      c: 'cccc',
      e: 'eeee',
      f: 'ffff',
    });
    await kept.read(['a', 'b'], read);
    assert.deepStrictEqual(
      await kept.read(['c', 'a'], read),
      new Map([
        ['c', 'cccc'],
        ['a', 'aaaa'],
      ]),
    );
    const slow = Promise.withResolvers<ReadonlyMap<string, string>>();
    const reading = kept.read(['c', 'd'], () => slow.promise);
    await kept.read(['e', 'f'], read);
    slow.resolve(new Map([['d', 'dddd']]));
    assert.deepStrictEqual(
      await reading,
      new Map([
        ['c', 'cccc'],
        ['d', 'dddd'],
      ]),
    );
  });
});
