import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { nextEnds } from '../../../../../tools/canvas/page/arrows';

const edge = { id: 'e', fromNode: 'a', toNode: 'b' };

suite('Canvas arrows', () => {
  test('turns an edge from pointing at where it goes to pointing back, both ways, neither way and round again, an edge without ends pointing as JSON Canvas takes it, at where it goes', () => {
    const one = nextEnds(edge);
    const two = nextEnds({ ...edge, ...one });
    const three = nextEnds({ ...edge, ...two });
    const four = nextEnds({ ...edge, ...three });
    assert.deepStrictEqual(
      [one, two, three, four],
      [
        { fromEnd: 'arrow', toEnd: 'none' },
        { fromEnd: 'arrow', toEnd: 'arrow' },
        { fromEnd: 'none', toEnd: 'none' },
        { fromEnd: 'none', toEnd: 'arrow' },
      ],
    );
  });
});
