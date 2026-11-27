import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { PushedTags } from '../../../../../tools/git/main/remoteTags';

suite('Tags pushed while the tags of a remote are listed', () => {
  test('makes a listing give way only to a tag pushed to its own remote of its own repository, as one counter for the app threw away the listings of every other', () => {
    const pushed = new PushedTags();
    const before = pushed.countOf('/a', 'origin');
    const ofOther = pushed.countOf('/b', 'origin');
    const ofUpstream = pushed.countOf('/a', 'upstream');

    pushed.record('/a', 'origin');

    assert.notStrictEqual(pushed.countOf('/a', 'origin'), before);
    assert.strictEqual(pushed.countOf('/b', 'origin'), ofOther);
    assert.strictEqual(pushed.countOf('/a', 'upstream'), ofUpstream);
  });
});
