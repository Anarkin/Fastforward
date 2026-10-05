import * as assert from 'node:assert';
import * as path from 'node:path';
import { checkout } from '../operations';
import { recordingLog } from './stub';

suite('Operations', () => {
  test('names a commit it could not check out by its short hash, as the rest of the app does', async () => {
    const recording = recordingLog();
    const notices: string[] = [];
    const hash = 'f'.repeat(40);
    const checkedOut = await checkout(
      recording.log,
      (_level, message) => notices.push(message),
      { gitPath: path.resolve('no-such-git'), root: path.resolve('.') },
      { kind: 'commit', hash },
    );
    assert.strictEqual(checkedOut, false);
    assert.match(notices[0] ?? '', /^Couldn't check out fffffff\. /);
    assert.ok(recording.error.includes(`Checking out commit ${hash} failed`));
  });
});
