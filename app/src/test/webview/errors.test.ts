import * as assert from 'node:assert';
import { errorText } from '../../webview/errors';

suite('Webview errors', () => {
  test('logs where an error came from', () => {
    const error = new Error('x');
    error.stack = 'Error: x\n    at f (webview.js:1:2)';
    assert.strictEqual(errorText(error), 'Error: x\n    at f (webview.js:1:2)');
  });

  test('logs the message of an error without a stack, or what was thrown', () => {
    const error = new Error('x');
    error.stack = undefined;
    assert.strictEqual(errorText(error), 'x');
    assert.strictEqual(errorText('boom'), 'boom');
  });
});
