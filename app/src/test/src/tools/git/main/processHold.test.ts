import * as assert from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { suite, test } from 'vitest';
import { unpackedKoffi } from '../../../../../lib/main/unpacked';
import { processHolderAt } from '../../../../../tools/git/main/processHold';

const idOfNoProcess = 0;

suite('Holding a process open', () => {
  test.runIf(process.platform === 'win32')(
    'holds a running process of Windows by its id until let go of, so its id still names it once it has ended and Node has let go of it, and holds no process an id names none of',
    async () => {
      const held = processHolderAt(unpackedKoffi());
      const child = spawn(process.execPath, ['-e', ''], {
        stdio: 'ignore',
        windowsHide: true,
      });
      assert.ok(child.pid !== undefined);
      const { pid } = child;

      const release = held(pid);
      await once(child, 'close');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const releaseEnded = held(pid);

      assert.strictEqual(typeof release, 'function');
      assert.strictEqual(typeof releaseEnded, 'function');
      assert.doesNotThrow(() => releaseEnded?.());
      assert.doesNotThrow(() => release?.());
      assert.strictEqual(held(idOfNoProcess), undefined);
    },
  );

  test('holds nothing where koffi is not at hand, outside Windows, loading nothing', () => {
    const held = processHolderAt(undefined);

    assert.strictEqual(held(process.pid), undefined);
  });
});
