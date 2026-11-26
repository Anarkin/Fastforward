import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { codeOf, hasCode, messageOf } from '../../../../lib/shared/errors';

const coded = (code: unknown) => Object.assign(new Error('failed'), { code });

suite('Errors', () => {
  test('gives the message of an error, and anything else thrown as text', () => {
    assert.strictEqual(messageOf(new Error('failed')), 'failed');
    assert.strictEqual(messageOf('refused'), 'refused');
    assert.strictEqual(messageOf(7), '7');
  });

  test('gives the code of an error, or of any object thrown with one, as text or a number', () => {
    assert.strictEqual(codeOf(coded('ENOENT')), 'ENOENT');
    assert.strictEqual(codeOf(coded(128)), 128);
    assert.strictEqual(codeOf({ code: 'EPERM' }), 'EPERM');
    assert.strictEqual(codeOf(coded({ nested: true })), undefined);
    assert.strictEqual(codeOf(new Error('failed')), undefined);
    assert.strictEqual(codeOf('ENOENT'), undefined);
    assert.strictEqual(codeOf(null), undefined);
  });

  test('tells whether an error has any of the codes named', () => {
    assert.strictEqual(hasCode(coded('EPERM'), 'EACCES', 'EPERM'), true);
    assert.strictEqual(hasCode(coded('ENOTDIR'), 'ENOENT'), false);
    assert.strictEqual(hasCode(coded(2), '2'), false);
    assert.strictEqual(hasCode(new Error('failed'), 'ENOENT'), false);
  });
});
