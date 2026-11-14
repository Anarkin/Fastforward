import * as assert from 'node:assert';
import { PassThrough } from 'node:stream';
import { suite, test } from 'vitest';
import {
  GitOutput,
  StoppedReading,
} from '../../../../../tools/git/main/gitOutput';

suite('What a git prints', () => {
  test('reads what git prints up to a byte or by its count, however it is cut into chunks', async () => {
    const stream = new PassThrough();
    const output = new GitOutput(stream);
    stream.write('one\0tw');
    stream.write('o\0abc');
    stream.write('def');

    assert.strictEqual((await output.until(0)).toString(), 'one');
    assert.strictEqual((await output.until(0)).toString(), 'two');
    assert.strictEqual((await output.take(5)).toString(), 'abcde');
    stream.end();
    assert.strictEqual((await output.take(1)).toString(), 'f');
    await assert.rejects(output.take(1));
  });

  test('hands on what git prints before a marker in parts, though the marker is cut across chunks, and stops reading when told to', async () => {
    const stream = new PassThrough();
    const output = new GitOutput(stream);
    const parts: string[] = [];
    stream.write('first part, ');
    stream.write('second part\n#MA');
    stream.write('RK#rest');

    assert.strictEqual((await output.peek(5)).toString(), 'first');
    await output.streamUntil(Buffer.from('\n#MARK#'), (part) => {
      parts.push(part.toString());
      return false;
    });
    assert.strictEqual(parts.join(''), 'first part, second part');
    assert.strictEqual((await output.take(4)).toString(), 'rest');

    stream.write('too much');
    await assert.rejects(
      output.streamUntil(Buffer.from('#END#'), () => true),
      StoppedReading,
    );
  });
});
