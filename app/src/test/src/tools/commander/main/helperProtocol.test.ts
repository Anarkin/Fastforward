import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  helperArguments,
  helperOf,
  newHelperAddress,
} from '../../../../../tools/commander/main/helperProtocol';

suite('The elevated helper of the commander', () => {
  test('finds where to connect and with what in its own arguments only', () => {
    const address = newHelperAddress(process.platform);
    assert.deepStrictEqual(
      helperOf(['app.exe', ...helperArguments(address)]),
      address,
    );
    assert.strictEqual(helperOf(['app.exe', 'C:\\work']), undefined);
    assert.notDeepStrictEqual(newHelperAddress(process.platform), address);
    const longTemp = '/var/folders/n6/hn37q6pj7sj_9dmqqc2113800000gn/T';
    assert.ok(
      newHelperAddress('darwin', longTemp).pipe.length < 104,
      'a socket path fits the 104 bytes macOS allows',
    );
  });
});
